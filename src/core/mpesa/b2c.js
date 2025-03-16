// src/core/mpesa/b2c.js
'use strict';

const axios = require('axios');
const { logger } = require('../utils/logger');
const MpesaAuth = require('./auth');

class BusinessToCustomer {
    constructor(config) {
        this.auth = new MpesaAuth(config);
        this.baseUrl = config.baseUrl;
        this.shortCode = config.initiatorName;
        this.securityCredential = config.securityCredential;
        this.initiatorName = config.initiatorName;
        this.resultUrl = config.resultUrl;
        this.timeoutUrl = config.timeoutUrl;
        this.queueTimeoutUrl = config.queueTimeoutUrl;
    }

    /**
     * Send money to customer
     * @param {Object} params - B2C parameters
     * @param {string} params.phoneNumber - Customer phone number (format: 254XXXXXXXXX)
     * @param {number} params.amount - Amount to send
     * @param {string} params.remarks - Transaction remarks
     * @param {string} params.occasion - Occasion
     * @param {string} params.commandId - Command ID (SalaryPayment, BusinessPayment, PromotionPayment)
     * @returns {Promise<Object>} B2C response
     */
    async sendMoney(params) {
        try {
            const token = await this.auth.getOAuthToken();
            
            // Ensure phone number format is correct
            const phoneNumber = params.phoneNumber.replace(/^0/, '254').replace(/^\+/, '');
            
            const requestBody = {
                InitiatorName: this.initiatorName,
                SecurityCredential: this.securityCredential,
                CommandID: params.commandId || 'BusinessPayment',
                Amount: params.amount,
                PartyA: this.shortCode,
                PartyB: phoneNumber,
                Remarks: params.remarks || 'B2C Payment',
                QueueTimeOutURL: `${this.queueTimeoutUrl}/api/v1/b2c/timeout`,
                ResultURL: `${this.resultUrl}/api/v1/b2c/result`,
                Occasion: params.occasion || ''
            };
            
            logger.info('Initiating B2C transaction', { 
                phoneNumber, 
                amount: params.amount,
                commandId: params.commandId 
            });
            
            const response = await axios({
                method: 'post',
                url: `${this.baseUrl}/mpesa/b2c/v1/paymentrequest`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: requestBody
            });
            
            logger.info('B2C transaction initiated successfully', {
                ConversationID: response.data.ConversationID,
                OriginatorConversationID: response.data.OriginatorConversationID
            });
            
            return response.data;
        } catch (error) {
            logger.error('Error initiating B2C transaction', { 
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    /**
     * Query B2C transaction status
     * @param {string} transactionId - Transaction ID
     * @returns {Promise<Object>} Transaction status
     */
    async queryTransaction(transactionId) {
        try {
            const token = await this.auth.getOAuthToken();
            
            const requestBody = {
                Initiator: this.initiatorName,
                SecurityCredential: this.securityCredential,
                CommandID: 'TransactionStatusQuery',
                TransactionID: transactionId,
                PartyA: this.shortCode,
                IdentifierType: '4', // Organization shortcode
                ResultURL: `${this.resultUrl}/api/v1/transaction/status/result`,
                QueueTimeOutURL: `${this.queueTimeoutUrl}/api/v1/transaction/status/timeout`,
                Remarks: 'Transaction status query',
                Occasion: ''
            };
            
            logger.info('Querying transaction status', { transactionId });
            
            const response = await axios({
                method: 'post',
                url: `${this.baseUrl}/mpesa/transactionstatus/v1/query`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: requestBody
            });
            
            logger.info('Transaction status query initiated successfully', {
                ConversationID: response.data.ConversationID,
                OriginatorConversationID: response.data.OriginatorConversationID
            });
            
            return response.data;
        } catch (error) {
            logger.error('Error querying transaction status', { 
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }
}

module.exports = BusinessToCustomer;