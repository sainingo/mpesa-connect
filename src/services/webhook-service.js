// src/services/webhook-service.js
'use strict';
const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('../core/utils/logger');
const Webhook = require('../models/webhook');
const User = require('../models/user');

/**
 * Send webhook to client endpoint
 * @param {string} webhookId - Webhook document ID
 * @returns {Promise<void>}
 */
exports.sendWebhook = async (webhookId) => {
    try {
        // Find webhook
        const webhook = await Webhook.findById(webhookId);
        if (!webhook) {
            logger.error('Webhook not found', { webhookId });
            return;
        }
        
        // Check if already sent
        if (webhook.status === 'SENT') {
            return;
        }
        
        // Get user to get webhook secret
        const user = await User.findById(webhook.userId).select('+webhookConfig.secret');
        if (!user || !user.webhookConfig || !user.webhookConfig.secret) {
            logger.error('User or webhook secret not found', { userId: webhook.userId });
            webhook.status = 'FAILED';
            webhook.errorMessage = 'Invalid webhook configuration';
            await webhook.save();
            return;
        }
        
        // Update attempt info
        webhook.attempts += 1;
        webhook.lastAttempt = new Date();
        webhook.status = 'PENDING';
        await webhook.save();
        
        // Generate signature
        const payload = JSON.stringify(webhook.payload);
        const signature = crypto
            .createHmac('sha256', user.webhookConfig.secret)
            .update(payload)
            .digest('hex');
        
        // Send webhook
        const response = await axios({
            method: 'post',
            url: webhook.destination,
            headers: {
                'Content-Type': 'application/json',
                'X-MPESA-Connect-Signature': signature,
                'X-MPESA-Connect-Timestamp': new Date().toISOString(),
                'X-MPESA-Connect-WebhookId': webhook._id.toString()
            },
            data: webhook.payload,
            timeout: 10000 // 10 seconds timeout
        });
        
        // Update webhook status
        webhook.status = 'SENT';
        webhook.response = {
            status: response.status,
            data: response.data
        };
        
        await webhook.save();
        
        logger.info('Webhook sent successfully', { 
            webhookId, 
            destination: webhook.destination,
            status: response.status
        });
    } catch (error) {
        logger.error('Error sending webhook', { 
            webhookId, 
            error: error.message,
            stack: error.stack
        });
        
        // Update webhook with error information
        try {
            const webhook = await Webhook.findById(webhookId);
            if (webhook) {
                webhook.status = 'FAILED';
                webhook.errorMessage = error.message;
                
                // Check if max retries reached
                const maxRetries = 5;
                if (webhook.attempts >= maxRetries) {
                    webhook.status = 'FAILED_PERMANENT';
                    logger.warn('Max retries reached for webhook', { webhookId, attempts: webhook.attempts });
                }
                
                await webhook.save();
            }
        } catch (updateError) {
            logger.error('Error updating webhook after failure', {
                webhookId,
                error: updateError.message
            });
        }
    }
};

/**
 * Create a new webhook entry
 * @param {Object} webhookData - Webhook data
 * @param {string} webhookData.userId - User ID
 * @param {string} webhookData.transactionId - Related transaction ID
 * @param {string} webhookData.destination - Webhook URL
 * @param {string} webhookData.eventType - Event type (e.g., 'PAYMENT_RECEIVED')
 * @param {Object} webhookData.payload - Webhook payload
 * @returns {Promise<Object>} Created webhook
 */
exports.createWebhook = async (webhookData) => {
    try {
        const webhook = new Webhook({
            userId: webhookData.userId,
            transactionId: webhookData.transactionId,
            destination: webhookData.destination,
            eventType: webhookData.eventType,
            payload: webhookData.payload,
            status: 'PENDING',
            attempts: 0,
            created: new Date()
        });
        
        await webhook.save();
        logger.info('Webhook created', { webhookId: webhook._id });
        
        // Schedule immediate delivery
        process.nextTick(() => {
            this.sendWebhook(webhook._id).catch(err => {
                logger.error('Failed to send webhook on creation', {
                    webhookId: webhook._id,
                    error: err.message
                });
            });
        });
        
        return webhook;
    } catch (error) {
        logger.error('Error creating webhook', { error: error.message });
        throw error;
    }
};

/**
 * Retry failed webhooks
 * @param {number} batchSize - Number of webhooks to process at once
 * @returns {Promise<number>} Number of webhooks processed
 */
exports.retryFailedWebhooks = async (batchSize = 50) => {
    try {
        // Find failed webhooks that haven't reached max retries
        const failedWebhooks = await Webhook.find({
            status: 'FAILED',
            attempts: { $lt: 5 },
            // Only retry webhooks that failed more than 5 minutes ago
            lastAttempt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
        }).limit(batchSize);
        
        logger.info(`Retrying ${failedWebhooks.length} failed webhooks`);
        
        // Process each webhook
        const retryPromises = failedWebhooks.map(webhook => 
            this.sendWebhook(webhook._id).catch(err => {
                logger.error('Error in retry process', {
                    webhookId: webhook._id,
                    error: err.message
                });
            })
        );
        
        await Promise.all(retryPromises);
        return failedWebhooks.length;
    } catch (error) {
        logger.error('Error retrying failed webhooks', { error: error.message });
        throw error;
    }
};

/**
 * Get webhook status
 * @param {string} webhookId - Webhook ID
 * @returns {Promise<Object>} Webhook status
 */
exports.getWebhookStatus = async (webhookId) => {
    try {
        const webhook = await Webhook.findById(webhookId).select('-payload');
        if (!webhook) {
            throw new Error('Webhook not found');
        }
        
        return {
            id: webhook._id,
            status: webhook.status,
            attempts: webhook.attempts,
            lastAttempt: webhook.lastAttempt,
            created: webhook.created,
            eventType: webhook.eventType,
            transactionId: webhook.transactionId,
            errorMessage: webhook.errorMessage
        };
    } catch (error) {
        logger.error('Error getting webhook status', {
            webhookId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Get webhooks for a transaction
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<Array>} Array of webhooks
 */
exports.getWebhooksForTransaction = async (transactionId) => {
    try {
        return await Webhook.find({ transactionId }).select('-payload');
    } catch (error) {
        logger.error('Error getting webhooks for transaction', {
            transactionId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Configure webhook settings for a user
 * @param {string} userId - User ID
 * @param {Object} webhookConfig - Webhook configuration
 * @param {string} webhookConfig.url - Default webhook URL
 * @param {string} webhookConfig.secret - Secret for signing webhooks
 * @param {boolean} webhookConfig.enabled - Whether webhooks are enabled
 * @returns {Promise<Object>} Updated user
 */
exports.configureWebhooks = async (userId, webhookConfig) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        
        user.webhookConfig = {
            url: webhookConfig.url,
            secret: webhookConfig.secret,
            enabled: webhookConfig.enabled !== false
        };
        
        await user.save();
        logger.info('Webhook configuration updated', { userId });
        
        return {
            url: user.webhookConfig.url,
            enabled: user.webhookConfig.enabled
        };
    } catch (error) {
        logger.error('Error configuring webhooks', {
            userId,
            error: error.message
        });
        throw error;
    }
};