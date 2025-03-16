// src/api/v1/c2b/handlers.js
'use strict';

const Boom = require('@hapi/boom');
const { logger } = require('../../../core/utils/logger');
const User = require('../../../models/user');
const Transaction = require('../../../models/transactions');
const Webhook = require('../../../models/webhook');
const C2B = require('../../../core/mpesa/c2b');
const { sendWebhook } = require('../../../services/webhook-service');

exports.registerUrls = async (request, h) => {
    try {
        const userId = request.auth.credentials.id;
        
        // Get user with MPESA configuration
        const user = await User.findById(userId).select('+mpesaConfig.consumerKey +mpesaConfig.consumerSecret');
        if (!user) {
            return Boom.notFound('User not found');
        }
        
        // Check if MPESA is configured
        if (!user.mpesaConfig || !user.mpesaConfig.consumerKey || !user.mpesaConfig.shortCode) {
            return Boom.badRequest('MPESA is not configured for your account');
        }
        
        // Configure C2B service
        const baseUrl = user.mpesaConfig.environment === 'production' 
            ? process.env.MPESA_PROD_URL 
            : process.env.MPESA_SANDBOX_URL;
            
        const c2bConfig = {
            baseUrl,
            consumerKey: user.mpesaConfig.consumerKey,
            consumerSecret: user.mpesaConfig.consumerSecret,
            shortCode: user.mpesaConfig.shortCode
        };
        
        const c2bService = new C2B(c2bConfig);
        
        // Set callback URLs
        const callbackBaseUrl = user.mpesaConfig.callbackBaseUrl || process.env.DEFAULT_CALLBACK_URL;
        const validationUrl = `${callbackBaseUrl}/api/v1/c2b/validation`;
        const confirmationUrl = `${callbackBaseUrl}/api/v1/c2b/confirmation`;
        
        // Register URLs with MPESA
        const response = await c2bService.registerUrls({
            ValidationURL: validationUrl,
            ConfirmationURL: confirmationUrl,
            ResponseType: 'Completed' // Default to completed
        });
        
        // Update user with registered URLs
        user.mpesaConfig.validationUrl = validationUrl;
        user.mpesaConfig.confirmationUrl = confirmationUrl;
        await user.save();
        
        return h.response({
            success: true,
            message: 'C2B URLs registered successfully',
            data: {
                validationUrl,
                confirmationUrl,
                responseType: 'Completed',
                responseDescription: response.ResponseDescription
            }
        });
    } catch (error) {
        logger.error('Error in registerUrls handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        if (error.response && error.response.data) {
            return Boom.badRequest(error.response.data.errorMessage || 'Error registering C2B URLs');
        }
        
        return Boom.badImplementation('Error registering C2B URLs');
    }
};

exports.simulateC2B = async (request, h) => {
    try {
        const { phoneNumber, amount, billRefNumber, metadata } = request.payload;
        const userId = request.auth.credentials.id;
        
        // Get user with MPESA configuration
        const user = await User.findById(userId).select('+mpesaConfig.consumerKey +mpesaConfig.consumerSecret');
        if (!user) {
            return Boom.notFound('User not found');
        }
        
        // Check if MPESA is configured
        if (!user.mpesaConfig || !user.mpesaConfig.consumerKey || !user.mpesaConfig.shortCode) {
            return Boom.badRequest('MPESA is not configured for your account');
        }
        
        // Check if environment is sandbox
        if (user.mpesaConfig.environment !== 'sandbox') {
            return Boom.badRequest('C2B simulation is only available in sandbox environment');
        }
        
        // Format phone number (ensure it starts with 254)
        const formattedPhone = phoneNumber.replace(/^0/, '254').replace(/^\+/, '');
        
        // Configure C2B service
        const baseUrl = process.env.MPESA_SANDBOX_URL;
        const c2bConfig = {
            baseUrl,
            consumerKey: user.mpesaConfig.consumerKey,
            consumerSecret: user.mpesaConfig.consumerSecret,
            shortCode: user.mpesaConfig.shortCode
        };
        
        const c2bService = new C2B(c2bConfig);
        
        // Create transaction record
        const transaction = new Transaction({
            userId,
            type: 'C2B',
            amount,
            phoneNumber: formattedPhone,
            accountReference: billRefNumber || 'Account',
            status: 'PENDING',
            metadata
        });
        
        await transaction.save();
        
        // Simulate C2B payment
        const c2bParams = {
            ShortCode: user.mpesaConfig.shortCode,
            CommandID: 'CustomerPayBillOnline',
            Amount: amount,
            Msisdn: formattedPhone,
            BillRefNumber: billRefNumber || transaction._id.toString()
        };
        
        logger.info('Simulating C2B payment', { 
            transactionId: transaction._id, 
            amount, 
            phoneNumber: formattedPhone 
        });
        
        const c2bResponse = await c2bService.simulate(c2bParams);
        
        // Update transaction with MPESA response data
        transaction.rawRequest = c2bParams;
        transaction.rawResponse = c2bResponse;
        transaction.mpesaReference = c2bResponse.OriginatorCoversationID;
        
        await transaction.save();
        
        return h.response({
            success: true,
            message: 'C2B payment simulated successfully',
            data: {
                transactionId: transaction._id,
                conversationId: c2bResponse.OriginatorCoversationID,
                responseCode: c2bResponse.ResponseCode,
                responseDescription: c2bResponse.ResponseDescription
            }
        });
    } catch (error) {
        logger.error('Error in simulateC2B handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        if (error.response && error.response.data) {
            return Boom.badRequest(error.response.data.errorMessage || 'Error simulating C2B payment');
        }
        
        return Boom.badImplementation('Error simulating C2B payment');
    }
};

exports.validation = async (request, h) => {
    try {
        const validationData = request.payload;
        logger.info('C2B validation received', { body: validationData });
        
        // Extract transaction details
        const { TransID, TransAmount, BillRefNumber, MSISDN, BusinessShortCode } = validationData;
        
        // Find user by short code
        const user = await User.findOne({ 'mpesaConfig.shortCode': BusinessShortCode });
        
        if (!user) {
            logger.error('User not found for C2B validation', { shortCode: BusinessShortCode });
            // Return error response - this will reject the transaction
            return h.response({
                ResultCode: 1, // Reject
                ResultDesc: 'Rejected: Unknown recipient'
            });
        }
        
        // Find user's webhook configuration
        if (user.webhookConfig && user.webhookConfig.endpoints && user.webhookConfig.endpoints.c2bValidation) {
            // Create webhook record
            const webhook = new Webhook({
                userId: user._id,
                type: 'C2B_VALIDATION',
                status: 'PENDING',
                payload: validationData,
                destination: user.webhookConfig.endpoints.c2bValidation
            });
            
            await webhook.save();
            
            // Send webhook to client's endpoint asynchronously
            const response = await sendWebhook(webhook._id);
            
            // If client responded, use their response
            if (response && response.data) {
                return h.response(response.data);
            }
        }
        
        // Default to accepting the transaction
        return h.response({
            ResultCode: 0, // Accept
            ResultDesc: 'Accepted'
        });
    } catch (error) {
        logger.error('Error in C2B validation handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        // Default to accepting the transaction on error
        return h.response({
            ResultCode: 0, // Accept
            ResultDesc: 'Accepted'
        });
    }
};

exports.confirmation = async (request, h) => {
    try {
        const confirmationData = request.payload;
        logger.info('C2B confirmation received', { body: confirmationData });
        
        // Extract transaction details
        const { 
            TransID, 
            TransAmount, 
            BillRefNumber, 
            MSISDN, 
            BusinessShortCode, 
            TransactionType 
        } = confirmationData;
        
        // Find user by short code
        const user = await User.findOne({ 'mpesaConfig.shortCode': BusinessShortCode });
        
        if (!user) {
            logger.error('User not found for C2B confirmation', { shortCode: BusinessShortCode });
            return h.response({ success: true });
        }
        
        // Format phone number for consistency
        const formattedPhone = MSISDN.toString().replace(/^0/, '254').replace(/^\+/, '');
        
        // Create or update transaction
        let transaction = await Transaction.findOne({ 
            mpesaReference: TransID, 
            type: 'C2B' 
        });
        
        if (!transaction) {
            transaction = new Transaction({
                userId: user._id,
                type: 'C2B',
                amount: parseFloat(TransAmount),
                phoneNumber: formattedPhone,
                accountReference: BillRefNumber,
                mpesaReference: TransID,
                status: 'COMPLETED',
                callbackData: confirmationData
            });
        } else {
            transaction.status = 'COMPLETED';
            transaction.callbackData = confirmationData;
        }
        
        await transaction.save();
        
        // Find user's webhook configuration
        if (user.webhookConfig && user.webhookConfig.endpoints && user.webhookConfig.endpoints.c2bConfirmation) {
            // Create webhook record
            const webhook = new Webhook({
                userId: user._id,
                transactionId: transaction._id,
                type: 'C2B_CONFIRMATION',
                status: 'PENDING',
                payload: {
                    transactionId: transaction._id,
                    mpesaReference: TransID,
                    amount: parseFloat(TransAmount),
                    phoneNumber: formattedPhone,
                    accountReference: BillRefNumber,
                    status: 'COMPLETED',
                    rawCallback: confirmationData
                },
                destination: user.webhookConfig.endpoints.c2bConfirmation
            });
            
            await webhook.save();
            
            // Send webhook asynchronously
            sendWebhook(webhook._id).catch(err => {
                logger.error('Error sending webhook', { error: err.message });
            });
        }
        
        return h.response({ success: true });
    } catch (error) {
        logger.error('Error in C2B confirmation handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        // Always return success to MPESA
        return h.response({ success: true });
    }
};