// src/api/v1/stk/handlers.js
'use strict';

const Boom = require('@hapi/boom');
const { logger } = require('../../../core/utils/logger');
const User = require('../../../models/user');
const Transaction = require('../../../models/transactions');
const Webhook = require('../../../models/webhook');
const StkPush = require('../../../core/mpesa/stk');
const { sendWebhook } = require('../../../services/webhook-service');

exports.initiateStkPush = async (request, h) => {
    try {
        const { phoneNumber, amount, accountReference, transactionDesc, metadata } = request.payload;
        const userId = request.auth.credentials.id;
        
        // Get user with MPESA configuration
        const user = await User.findById(userId).select('+mpesaConfig.consumerKey +mpesaConfig.consumerSecret +mpesaConfig.passKey');
        if (!user) {
            return Boom.notFound('User not found');
        }
        
        // Check if MPESA is configured
        if (!user.mpesaConfig || !user.mpesaConfig.consumerKey || !user.mpesaConfig.shortCode) {
            return Boom.badRequest('MPESA is not configured for your account');
        }
        
        // Format phone number (ensure it starts with 254)
        const formattedPhone = phoneNumber.replace(/^0/, '254').replace(/^\+/, '');
        
        // Configure STK push service
        const baseUrl = user.mpesaConfig.environment === 'production' 
            ? process.env.MPESA_PROD_URL 
            : process.env.MPESA_SANDBOX_URL;
            
        const stkConfig = {
            baseUrl,
            consumerKey: user.mpesaConfig.consumerKey,
            consumerSecret: user.mpesaConfig.consumerSecret,
            shortCode: user.mpesaConfig.shortCode,
            passKey: user.mpesaConfig.passKey,
            callbackUrl: user.mpesaConfig.callbackBaseUrl || process.env.DEFAULT_CALLBACK_URL
        };
        
        const stkService = new StkPush(stkConfig);
        
        // Create transaction record
        const transaction = new Transaction({
            userId,
            type: 'STK',
            amount,
            phoneNumber: formattedPhone,
            description: transactionDesc || 'STK Push Payment',
            accountReference: accountReference || 'Account',
            status: 'PENDING',
            metadata
        });
        
        await transaction.save();
        
        // Initiate STK push
        const stkParams = {
            phoneNumber: formattedPhone,
            amount,
            accountReference: accountReference || transaction._id.toString(),
            transactionDesc: transactionDesc || 'Payment'
        };
        
        logger.info('Initiating STK push', { 
            transactionId: transaction._id, 
            amount, 
            phoneNumber: formattedPhone 
        });
        
        const stkResponse = await stkService.initiate(stkParams);
        
        // Update transaction with MPESA response data
        transaction.checkoutRequestId = stkResponse.CheckoutRequestID;
        transaction.merchantRequestId = stkResponse.MerchantRequestID;
        transaction.rawRequest = stkParams;
        transaction.rawResponse = stkResponse;
        
        await transaction.save();
        
        return h.response({
            success: true,
            message: 'STK push initiated successfully',
            data: {
                transactionId: transaction._id,
                checkoutRequestId: stkResponse.CheckoutRequestID,
                merchantRequestId: stkResponse.MerchantRequestID,
                responseCode: stkResponse.ResponseCode,
                responseDescription: stkResponse.ResponseDescription,
                customerMessage: stkResponse.CustomerMessage
            }
        });
    } catch (error) {
        logger.error('Error in initiateStkPush handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        if (error.response && error.response.data) {
            return Boom.badRequest(error.response.data.errorMessage || 'Error initiating STK push');
        }
        
        return Boom.badImplementation('Error initiating STK push');
    }
};

exports.checkStkStatus = async (request, h) => {
    try {
        const { checkoutRequestId } = request.params;
        const userId = request.auth.credentials.id;
        
        // Find transaction
        const transaction = await Transaction.findOne({
            userId,
            checkoutRequestId,
            type: 'STK'
        });
        
        if (!transaction) {
            return Boom.notFound('Transaction not found');
        }
        
        // Get user with MPESA configuration
        const user = await User.findById(userId).select('+mpesaConfig.consumerKey +mpesaConfig.consumerSecret +mpesaConfig.passKey');
        
        // Configure STK push service
        const baseUrl = user.mpesaConfig.environment === 'production' 
            ? process.env.MPESA_PROD_URL 
            : process.env.MPESA_SANDBOX_URL;
            
        const stkConfig = {
            baseUrl,
            consumerKey: user.mpesaConfig.consumerKey,
            consumerSecret: user.mpesaConfig.consumerSecret,
            shortCode: user.mpesaConfig.shortCode,
            passKey: user.mpesaConfig.passKey
        };
        
        const stkService = new StkPush(stkConfig);
        
        // Query STK status
        const statusResponse = await stkService.query(checkoutRequestId);
        
        // Update transaction if status has changed
        if (statusResponse.ResultCode !== undefined) {
            transaction.resultCode = statusResponse.ResultCode;
            transaction.resultDesc = statusResponse.ResultDesc;
            
            // Update status based on result code
            if (statusResponse.ResultCode === 0) {
                transaction.status = 'COMPLETED';
            } else if ([1, 1032].includes(statusResponse.ResultCode)) {
                transaction.status = 'CANCELLED';
            } else {
                transaction.status = 'FAILED';
            }
            
            await transaction.save();
        }
        
        return h.response({
            success: true,
            data: {
                transactionId: transaction._id,
                checkoutRequestId,
                status: transaction.status,
                resultCode: transaction.resultCode,
                resultDesc: transaction.resultDesc
            }
        });
    } catch (error) {
        logger.error('Error in checkStkStatus handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        return Boom.badImplementation('Error checking STK status');
    }
};

exports.stkCallback = async (request, h) => {
    try {
        const callbackData = request.payload;
        logger.info('STK callback received', { 
            body: callbackData 
        });
        
        const body = callbackData.Body;
        const stkCallback = body.stkCallback;
        const checkoutRequestId = stkCallback.CheckoutRequestID;
        
        // Find transaction
        const transaction = await Transaction.findOne({
            checkoutRequestId,
            type: 'STK'
        });
        
        if (!transaction) {
            logger.error('Transaction not found for callback', { checkoutRequestId });
            return h.response({ success: true });
        }
        
        // Update transaction with callback data
        transaction.callbackData = callbackData;
        transaction.resultCode = stkCallback.ResultCode;
        transaction.resultDesc = stkCallback.ResultDesc;
        
        // Update status based on result code
        if (stkCallback.ResultCode === 0) {
            transaction.status = 'COMPLETED';
            
            // Extract MPESA reference if available
            if (stkCallback.CallbackMetadata && stkCallback.CallbackMetadata.Item) {
                const items = stkCallback.CallbackMetadata.Item;
                
                // Find MPESA Receipt Number
                const receiptItem = items.find(item => item.Name === 'MpesaReceiptNumber');
                if (receiptItem && receiptItem.Value) {
                    transaction.mpesaReference = receiptItem.Value;
                }
                
                // Find transaction date
                const dateItem = items.find(item => item.Name === 'TransactionDate');
                if (dateItem && dateItem.Value) {
                    // Format: YYYYMMDDHHMMSS
                    const dateStr = dateItem.Value.toString();
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    const hour = dateStr.substring(8, 10);
                    const minute = dateStr.substring(10, 12);
                    const second = dateStr.substring(12, 14);
                    
                    transaction.mpesaTimestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
                }
            }
        } else {
            transaction.status = 'FAILED';
        }
        
        await transaction.save();
        
        // Find user to get webhook configuration
        const user = await User.findById(transaction.userId);
        
        // Send webhook to client's endpoint if configured
        if (user && user.webhookConfig && user.webhookConfig.endpoints && user.webhookConfig.endpoints.stkCallback) {
            const webhook = new Webhook({
                userId: transaction.userId,
                transactionId: transaction._id,
                type: 'STK',
                status: 'PENDING',
                payload: {
                    transactionId: transaction._id,
                    checkoutRequestId,
                    resultCode: transaction.resultCode,
                    resultDesc: transaction.resultDesc,
                    mpesaReference: transaction.mpesaReference,
                    amount: transaction.amount,
                    phoneNumber: transaction.phoneNumber,
                    status: transaction.status,
                    timestamp: transaction.mpesaTimestamp
                },
                destination: user.webhookConfig.endpoints.stkCallback
            });
            
            await webhook.save();
            
            // Send webhook asynchronously
            sendWebhook(webhook._id).catch(err => {
                logger.error('Error sending webhook', { error: err.message });
            });
        }
        
        return h.response({ success: true });
    } catch (error) {
        logger.error('Error in stkCallback handler', { 
            error: error.message,
            stack: error.stack 
        });
        
        // Always return success to MPESA
        return h.response({ success: true });
    }
};