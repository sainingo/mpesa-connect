// src/core/mpesa/stk.js
'use strict';

const axios = require('axios');
const { logger } = require('../utils/logger');
const MpesaAuth = require('./auth');

class StkPush {
    constructor(config) {
        this.auth = new MpesaAuth(config);
        this.baseUrl = config.baseUrl;
        this.shortCode = config.shortCode;
        this.passKey = config.passKey;
        this.callbackUrl = config.callbackUrl;
    }

    /**
     * Generate timestamp for STK push
     * @returns {string} Timestamp in YYYYMMDDHHmmss format
     */
    generateTimestamp() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

    /**
     * Generate password for STK push
     * @param {string} timestamp - Current timestamp
     * @returns {string} Base64 encoded password
     */
    generatePassword(timestamp) {
        const password = `${this.shortCode}${this.passKey}${timestamp}`;
        return Buffer.from(password).toString('base64');
    }

    /**
     * Initiate STK push
     * @param {Object} params - STK push parameters
     * @param {string} params.phoneNumber - Customer phone number (format: 254XXXXXXXXX)
     * @param {number} params.amount - Amount to charge
     * @param {string} params.accountReference - Account reference
     * @param {string} params.transactionDesc - Transaction description
     * @returns {Promise<Object>} STK push response
     */
    async initiate(params) {
        try {
            const token = await this.auth.getOAuthToken();
            const timestamp = this.generateTimestamp();
            const password = this.generatePassword(timestamp);
            
            // Ensure phone number format is correct
            const phoneNumber = params.phoneNumber.replace(/^0/, '254').replace(/^\+/, '');
            
            const requestBody = {
                BusinessShortCode: this.shortCode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: params.amount,
                PartyA: phoneNumber,
                PartyB: this.shortCode,
                PhoneNumber: phoneNumber,
                CallBackURL: `${this.callbackUrl}/api/v1/stk/callback`,
                AccountReference: params.accountReference || 'Account',
                TransactionDesc: params.transactionDesc || 'Payment'
            };
            
            logger.info('Initiating STK push', { phoneNumber, amount: params.amount });
            
            const response = await axios({
                method: 'post',
                url: `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: requestBody
            });
            
            logger.info('STK push initiated successfully', { 
                CheckoutRequestID: response.data.CheckoutRequestID 
            });
            
            return response.data;
        } catch (error) {
            logger.error('Error initiating STK push', { 
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    /**
     * Query STK push status
     * @param {string} checkoutRequestId - Checkout request ID
     * @returns {Promise<Object>} STK push status
     */
    async query(checkoutRequestId) {
        try {
            const token = await this.auth.getOAuthToken();
            const timestamp = this.generateTimestamp();
            const password = this.generatePassword(timestamp);
            
            const requestBody = {
                BusinessShortCode: this.shortCode,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestId
            };
            
            logger.info('Querying STK push status', { checkoutRequestId });
            
            const response = await axios({
                method: 'post',
                url: `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: requestBody
            });
            
            logger.info('STK push status query successful', {
                ResultCode: response.data.ResultCode
            });
            
            return response.data;
        } catch (error) {
            logger.error('Error querying STK push status', { 
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }
}

module.exports = StkPush;