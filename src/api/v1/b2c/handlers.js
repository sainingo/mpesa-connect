// src/api/v1/b2c/handlers.js
'use strict';

const Boom = require('@hapi/boom');
const { logger } = require('../../../core/utils/logger');
const User = require('../../../models/user');
const Transaction = require('../../../models/transactions');
const Webhook = require('../../../models/webhook');
const B2C = require('../../../core/mpesa/b2c');
const { sendWebhook } = require('../../../services/webhook-service');

exports.initiateB2C = async (request, h) => {
    try {
        const { phoneNumber, amount, commandID, remarks, occassion, metadata } = request.payload;
        const userId = request.auth.credentials.id;
        
        // Get user with MPESA configuration
        const user = await User.findById(userId).select('+mpesaConfig.consumerKey +mpesaConfig.consumerSecret +mpesaConfig.initiatorName +mpesaConfig.securityCredential');
        if (!user) {
            return Boom.notFound('User not found');
        }
        
        // Check if MPESA is configured
        if (!user.mpesaConfig || !user.mpesaConfig.consumerKey || !user.mpesaConfig.shortCode) {
            return Boom.badRequest('MPESA is not configured for your account');
        }
        
        // Check if B2C specific configs are set
        if (!user.mpesaConfig.initiatorName || !user.mpesaConfig.securityCredential) {
            return Boom.badRequest('B2C configuration is incomplete. Please set initiatorName and securityCredential');
        }
        
        // Format phone number (ensure it starts with 254)
        const formattedPhone = phoneNumber.replace(/^0/, '254').replace(/^\+/, '');
        
        // Configure B2C service
        const baseUrl = user.mpesaConfig.environment === 'production' 
            ? process.env.MPESA_PROD_URL 
            : process.env.MPESA_SANDBOX_URL;
            
        const b2cConfig = {
            baseUrl,
            consumerKey: user.mpesaConfig.consumerKey,
            consumerSecret: user.mpesaConfig.consumerSecret,
            initiatorName: user.mpesaConfig.initiatorName,
            securityCredential: user.mpesaConfig.securityCredential,
            shortCode: user.mpesaConfig.shortCode,
            callbackBaseUrl: user.mpesaConfig.callbackBaseUrl || process.env.DEFAULT_CALLBACK_URL
        };
        
        const b2cService = new B2C(b2cConfig);
        
        // Create transaction record
        const transaction = new Transaction({
            userId,
            type: 'B2C',
            amount,
            phoneNumber: formattedPhone,
            commandID: commandID || 'BusinessPayment',
            remarks: remarks || 'B2C Payment',
            status: 'PENDING',
            metadata
        });
        
        await transaction.save();
        
        // Initiate B2C payment
        const b2cParams = {
            InitiatorName: user.mpesaConfig.initiatorName,
            SecurityCredential: user.mpesaConfig.securityCredential,
            CommandID: commandID || 'BusinessPayment',
            Amount: amount,
            PartyA: user.mpesaConfig.shortCode,
            PartyB: formattedPhone,
            Remarks: remarks || 'B2C Payment',
            QueueTimeOutURL: `${b2cConfig.callbackBaseUrl}/api/v1/b2c/timeout`,
            ResultURL: `${b2cConfig.callbackBaseUrl}/api/v1/b2c/result`,
            Occassion: occassion || ''
        };
        
        logger.info('Initiating B2C payment', { 
            transactionId: transaction._id, 
            amount, 
            phoneNumber: formattedPhone 
        });
        
        const b2cResponse = await b2cService.initiatePayment(b2cParams);
        
        // Update transaction with MPESA response data
        transaction.conversationId = b2cResponse.ConversationID;
        transaction.originatorConversationId = b2cResponse.OriginatorConversationID;
        transaction.rawRequest = b2cParams;
        transaction.rawResponse = b2cResponse;
        
        await transaction.save();
        
        return h.response({
            success: true,
            message: 'B2C payment initiated successfully',
            data: {
                transactionId: transaction._id,
                conversationId: b2cResponse.ConversationID,
                originatorConversationId: b2cResponse.OriginatorConversationID,
                responseCode: b2cResponse.ResponseCode,
                responseDescription: b2cResponse.ResponseDescription
            }
        });
    } catch (error) {
        logger.error('Error in initiateB2C handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        if (error.response && error.response.data) {
            return Boom.badRequest(error.response.data.errorMessage || 'Error initiating B2C payment');
        }
        
        return Boom.badImplementation('Error initiating B2C payment');
    }
};

exports.checkB2CStatus = async (request, h) => {
    try {
        const { conversationId } = request.params;
        const userId = request.auth.credentials.id;
        
        // Find transaction
        const transaction = await Transaction.findOne({
            userId,
            conversationId,
            type: 'B2C'
        });
        
        if (!transaction) {
            return Boom.notFound('Transaction not found');
        }
        
        return h.response({
            success: true,
            data: {
                transactionId: transaction._id,
                conversationId,
                status: transaction.status,
                resultCode: transaction.resultCode,
                resultDesc: transaction.resultDesc,
                mpesaReference: transaction.mpesaReference
            }
        });
    } catch (error) {
        logger.error('Error in checkB2CStatus handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        return Boom.badImplementation('Error checking B2C status');
    }
};

exports.b2cResult = async (request, h) => {
    try {
        const resultData = request.payload;
        logger.info('B2C result callback received', { body: resultData });
        
        const { Result } = resultData;
        const conversationId = Result.ConversationID;
        const originatorConversationId = Result.OriginatorConversationID;
        const resultCode = Result.ResultCode;
        const resultDesc = Result.ResultDesc;
        
        // Find transaction
        const transaction = await Transaction.findOne({
            conversationId,
            type: 'B2C'
        });
        
        if (!transaction) {
            logger.error('Transaction not found for B2C result', { conversationId });
            return h.response({ success: true });
        }
        
        // Update transaction with result data
        transaction.callbackData = resultData;
        transaction.resultCode = resultCode;
        transaction.resultDesc = resultDesc;
        
        // Update status based on result code
        if (resultCode === 0) {
            transaction.status = 'COMPLETED';
            
            // Extract transaction ID if available
            if (Result.ResultParameters && Result.ResultParameters.ResultParameter) {
                const params = Result.ResultParameters.ResultParameter;
                
                // Find Transaction ID
                const transIdParam = params.find(param => param.Key === 'TransactionID');
                if (transIdParam && transIdParam.Value) {
                    transaction.mpesaReference = transIdParam.Value;
                }
                
                // Find transaction date
                const dateParam = params.find(param => param.Key === 'TransactionCompletedDateTime');
                if (dateParam && dateParam.Value) {
                    transaction.mpesaTimestamp = new Date(dateParam.Value);
                }
            }
        } else {
            transaction.status = 'FAILED';
        }
        
        await transaction.save();
        
        // Find user to get webhook configuration
        const user = await User.findById(transaction.userId);
        
        // Send webhook to client's endpoint if configured
        if (user && user.webhookConfig && user.webhookConfig.endpoints && user.webhookConfig.endpoints.b2cResult) {
            const webhook = new Webhook({
                userId: transaction.userId,
                transactionId: transaction._id,
                type: 'B2C',
                status: 'PENDING',
                payload: {
                    transactionId: transaction._id,
                    conversationId,
                    originatorConversationId,
                    resultCode: transaction.resultCode,
                    resultDesc: transaction.resultDesc,
                    mpesaReference: transaction.mpesaReference,
                    amount: transaction.amount,
                    phoneNumber: transaction.phoneNumber,
                    status: transaction.status,
                    timestamp: transaction.mpesaTimestamp
                },
                destination: user.webhookConfig.endpoints.b2cResult
            });
            
            await webhook.save();
            
            // Send webhook asynchronously
            sendWebhook(webhook._id).catch(err => {
                logger.error('Error sending webhook', { error: err.message });
            });
        }
        
        return h.response({ success: true });
    } catch (error) {
        logger.error('Error in b2cResult handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        // Always return success to MPESA
        return h.response({ success: true });
    }
};

exports.b2cTimeout = async (request, h) => {
    try {
        const timeoutData = request.payload;
        logger.info('B2C timeout callback received', { body: timeoutData });
        
        const { Result } = timeoutData;
        const conversationId = Result.ConversationID;
        const originatorConversationId = Result.OriginatorConversationID;
        
        // Find transaction
        const transaction = await Transaction.findOne({
            conversationId,
            type: 'B2C'
        });
        
        if (!transaction) {
            logger.error('Transaction not found for B2C timeout', { conversationId });
            return h.response({ success: true });
        }
        
        // Update transaction with timeout data
        transaction.callbackData = timeoutData;
        transaction.status = 'TIMEOUT';
        
        await transaction.save();
        
        // Find user to get webhook configuration
        const user = await User.findById(transaction.userId);
        
        // Send webhook to client's endpoint if configured
        if (user && user.webhookConfig && user.webhookConfig.endpoints && user.webhookConfig.endpoints.b2cTimeout) {
            const webhook = new Webhook({
                userId: transaction.userId,
                transactionId: transaction._id,
                type: 'B2C_TIMEOUT',
                status: 'PENDING',
                payload: {
                    transactionId: transaction._id,
                    conversationId,
                    originatorConversationId,
                    amount: transaction.amount,
                    phoneNumber: transaction.phoneNumber,
                    status: 'TIMEOUT',
                    timestamp: new Date()
                },
                destination: user.webhookConfig.endpoints.b2cTimeout
            });
            
            await webhook.save();
            
            // Send webhook asynchronously
            sendWebhook(webhook._id).catch(err => {
                logger.error('Error sending webhook', { error: err.message });
            });
        }
        
        return h.response({ success: true });
    } catch (error) {
        logger.error('Error in b2cTimeout handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        // Always return success to MPESA
        return h.response({ success: true });
    }
};