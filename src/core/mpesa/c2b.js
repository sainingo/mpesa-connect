// src/core/mpesa/c2b.js
'use strict';

const axios = require('axios');
const { logger } = require('../utils/logger');
const MpesaAuth = require('./auth');

class C2B {
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.consumerKey = config.consumerKey;
        this.consumerSecret = config.consumerSecret;
        this.shortCode = config.shortCode;
        this.auth = new MpesaAuth(config);
    }

    async registerUrls(params) {
        try {
            const token = await this.auth.getAccessToken();
            
            const defaultParams = {
                ShortCode: this.shortCode,
                ResponseType: 'Completed'
            };
            
            const payload = { ...defaultParams, ...params };
            
            logger.info('Registering C2B URLs', { 
                shortCode: this.shortCode, 
                validationUrl: params.ValidationURL, 
                confirmationUrl: params.ConfirmationURL 
            });
            
            const response = await axios({
                method: 'post',
                url: `${this.baseUrl}/mpesa/c2b/v1/registerurl`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: payload
            });
            
            return response.data;
        } catch (error) {
            logger.error('Error registering C2B URLs', {
                error: error.message,
                stack: error.stack
            });
            
            if (error.response && error.response.data) {
                throw new Error(error.response.data.errorMessage || 'Failed to register C2B URLs');
            }
            
            throw error;
        }
    }

    async simulate(params) {
        try {
            const token = await this.auth.getAccessToken();
            
            const defaultParams = {
                ShortCode: this.shortCode,
                CommandID: 'CustomerPayBillOnline'
            };
            
            const payload = { ...defaultParams, ...params };
            
            logger.info('Simulating C2B payment', { 
                shortCode: this.shortCode, 
                phone: params.Msisdn, 
                amount: params.Amount 
            });
            
            const response = await axios({
                method: 'post',
                url: `${this.baseUrl}/mpesa/c2b/v1/simulate`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: payload
            });
            
            return response.data;
        } catch (error) {
            logger.error('Error simulating C2B payment', {
                error: error.message,
                stack: error.stack
            });
            
            if (error.response && error.response.data) {
                throw new Error(error.response.data.errorMessage || 'Failed to simulate C2B payment');
            }
            
            throw error;
        }
    }
}

module.exports = C2B;








// // src/core/mpesa/c2b.js
// 'use strict';

// const axios = require('axios');
// const { logger } = require('../utils/logger');
// const MpesaAuth = require('./auth');

// class CustomerToBusiness {
//     constructor(config) {
//         this.auth = new MpesaAuth(config);
//         this.baseUrl = config.baseUrl;
//         this.shortCode = config.shortCode;
//         this.confirmationUrl = config.confirmationUrl;
//         this.validationUrl = config.validationUrl;
//     }

//     /**
//      * Register C2B URLs with Safaricom
//      * @returns {Promise<Object>} Registration response
//      */
//     async registerUrls() {
//         try {
//             const token = await this.auth.getOAuthToken();
            
//             const requestBody = {
//                 ShortCode: this.shortCode,
//                 ResponseType: 'Completed',
//                 ConfirmationURL: `${this.confirmationUrl}/api/v1/c2b/confirmation`,
//                 ValidationURL: `${this.validationUrl}/api/v1/c2b/validation`
//             };
            
//             logger.info('Registering C2B URLs', { shortCode: this.shortCode });
            
//             const response = await axios({
//                 method: 'post',
//                 url: `${this.baseUrl}/mpesa/c2b/v1/registerurl`,
//                 headers: {
//                     'Authorization': `Bearer ${token}`,
//                     'Content-Type': 'application/json'
//                 },
//                 data: requestBody
//             });
            
//             logger.info('C2B URLs registered successfully');
            
//             return response.data;
//         } catch (error) {
//             logger.error('Error registering C2B URLs', { 
//                 error: error.message,
//                 response: error.response?.data
//             });
//             throw error;
//         }
//     }

//     /**
//      * Simulate C2B transaction (for testing only)
//      * @param {Object} params - Simulation parameters
//      * @param {string} params.phoneNumber - Customer phone number (format: 254XXXXXXXXX)
//      * @param {number} params.amount - Amount to charge
//      * @param {string} params.billRefNumber - Bill reference number
//      * @returns {Promise<Object>} Simulation response
//      */
//     async simulate(params) {
//         try {
//             const token = await this.auth.getOAuthToken();
            
//             // Ensure phone number format is correct
//             const phoneNumber = params.phoneNumber.replace(/^0/, '254').replace(/^\+/, '');
            
//             const requestBody = {
//                 ShortCode: this.shortCode,
//                 CommandID: 'CustomerPayBillOnline',
//                 Amount: params.amount,
//                 Msisdn: phoneNumber,
//                 BillRefNumber: params.billRefNumber || 'Test'
//             };
            
//             logger.info('Simulating C2B transaction', { 
//                 phoneNumber, 
//                 amount: params.amount,
//                 billRefNumber: params.billRefNumber 
//             });
            
//             const response = await axios({
//                 method: 'post',
//                 url: `${this.baseUrl}/mpesa/c2b/v1/simulate`,
//                 headers: {
//                     'Authorization': `Bearer ${token}`,
//                     'Content-Type': 'application/json'
//                 },
//                 data: requestBody
//             });
            
//             logger.info('C2B simulation successful', {
//                 OriginatorCoversationID: response.data.OriginatorCoversationID
//             });
            
//             return response.data;
//         } catch (error) {
//             logger.error('Error simulating C2B transaction', { 
//                 error: error.message,
//                 response: error.response?.data
//             });
//             throw error;
//         }
//     }
// }

// module.exports = CustomerToBusiness;