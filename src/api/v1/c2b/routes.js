// src/api/v1/c2b/routes.js
'use strict';

const Joi = require('@hapi/joi');
const handlers = require('./handlers');

const routes = [
    {
        method: 'POST',
        path: '/api/v1/c2b/register',
        handler: handlers.registerUrls,
        options: {
            auth: 'jwt',
            description: 'Register C2B URLs',
            tags: ['api', 'c2b']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/c2b/simulate',
        handler: handlers.simulateC2B,
        options: {
            auth: 'jwt',
            validate: {
                payload: Joi.object({
                    phoneNumber: Joi.string().required().regex(/^(?:254|\+254|0)?(7[0-9]{8})$/),
                    amount: Joi.number().positive().required(),
                    billRefNumber: Joi.string().max(20),
                    metadata: Joi.object()
                })
            },
            description: 'Simulate C2B transaction (sandbox only)',
            tags: ['api', 'c2b']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/c2b/validation',
        handler: handlers.validation,
        options: {
            auth: false,
            description: 'C2B validation URL',
            tags: ['api', 'c2b']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/c2b/confirmation',
        handler: handlers.confirmation,
        options: {
            auth: false,
            description: 'C2B confirmation URL',
            tags: ['api', 'c2b']
        }
    }
];

module.exports = routes;