// src/api/v1/b2c/routes.js
'use strict';

const Joi = require('@hapi/joi');
const handlers = require('./handlers');

const routes = [
    {
        method: 'POST',
        path: '/api/v1/b2c/payment',
        handler: handlers.initiateB2C,
        options: {
            auth: 'jwt',
            validate: {
                payload: Joi.object({
                    phoneNumber: Joi.string().required().regex(/^(?:254|\+254|0)?(7[0-9]{8})$/),
                    amount: Joi.number().positive().required(),
                    commandID: Joi.string().valid('SalaryPayment', 'BusinessPayment', 'PromotionPayment').default('BusinessPayment'),
                    remarks: Joi.string().max(100),
                    occassion: Joi.string().max(100),
                    metadata: Joi.object()
                })
            },
            description: 'Initiate B2C payment',
            tags: ['api', 'b2c']
        }
    },
    {
        method: 'GET',
        path: '/api/v1/b2c/status/{conversationId}',
        handler: handlers.checkB2CStatus,
        options: {
            auth: 'jwt',
            validate: {
                params: Joi.object({
                    conversationId: Joi.string().required()
                })
            },
            description: 'Check B2C payment status',
            tags: ['api', 'b2c']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/b2c/result',
        handler: handlers.b2cResult,
        options: {
            auth: false,
            description: 'B2C result callback',
            tags: ['api', 'b2c']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/b2c/timeout',
        handler: handlers.b2cTimeout,
        options: {
            auth: false,
            description: 'B2C timeout callback',
            tags: ['api', 'b2c']
        }
    }
];

module.exports = routes;