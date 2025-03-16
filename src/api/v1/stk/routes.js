// src/api/v1/stk/routes.js
'use strict';

const Joi = require('@hapi/joi');
const handlers = require('./handlers');

const routes = [
    {
        method: 'POST',
        path: '/api/v1/stk/push',
        handler: handlers.initiateStkPush,
        options: {
            auth: 'jwt',
            validate: {
                payload: Joi.object({
                    phoneNumber: Joi.string().required().regex(/^(?:254|\+254|0)?(7[0-9]{8})$/),
                    amount: Joi.number().positive().required(),
                    accountReference: Joi.string().max(20),
                    transactionDesc: Joi.string().max(100),
                    metadata: Joi.object()
                })
            },
            description: 'Initiate STK push',
            tags: ['api', 'stk']
        }
    },
    {
        method: 'GET',
        path: '/api/v1/stk/status/{checkoutRequestId}',
        handler: handlers.checkStkStatus,
        options: {
            auth: 'jwt',
            validate: {
                params: Joi.object({
                    checkoutRequestId: Joi.string().required()
                })
            },
            description: 'Check STK push status',
            tags: ['api', 'stk']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/stk/callback',
        handler: handlers.stkCallback,
        options: {
            auth: false,
            description: 'STK push callback',
            tags: ['api', 'stk']
        }
    }
];

module.exports = routes;