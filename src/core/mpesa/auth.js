// src/core/mpesa/auth.js
'use strict';

const axios = require('axios');
const { logger } = require('../utils/logger');

class MpesaAuth {
    constructor(config) {
        this.consumerKey = config.consumerKey;
        this.consumerSecret = config.consumerSecret;
        this.baseUrl = config.baseUrl;
        this.tokenCache = null;
        this.tokenExpiry = null;
    }

    /**
     * Generate base64 encoded auth string from consumer key and secret
     * @returns {string} Base64 encoded auth string
     */
    generateAuthString() {
        const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
        return auth;
    }

    /**
     * Get OAuth token from Safaricom
     * @returns {Promise<string>} OAuth token
     */
    async getOAuthToken() {
        try {
            // Check if we have a valid cached token
            const now = new Date();
            if (this.tokenCache && this.tokenExpiry && this.tokenExpiry > now) {
                logger.debug('Using cached OAuth token');
                return this.tokenCache;
            }

            logger.info('Fetching new OAuth token from Safaricom');
            
            const auth = this.generateAuthString();
            const response = await axios({
                method: 'get',
                url: `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
                headers: {
                    'Authorization': `Basic ${auth}`
                }
            });

            if (response.data && response.data.access_token) {
                this.tokenCache = response.data.access_token;
                
                // Set token expiry (Safaricom tokens typically last 1 hour)
                this.tokenExpiry = new Date(now.getTime() + 55 * 60 * 1000); // 55 minutes
                
                return this.tokenCache;
            } else {
                throw new Error('Could not get access token from response');
            }
        } catch (error) {
            logger.error('Error getting OAuth token', { error: error.message });
            throw error;
        }
    }
}

module.exports = MpesaAuth;