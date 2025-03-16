// src/api/v1/auth/routes.js
'use strict';

const Joi = require('@hapi/joi');
const handlers = require('./handlers');

const routes = [
    {
        method: 'POST',
        path: '/api/v1/auth/register',
        handler: handlers.register,
        options: {
            validate: {
                payload: Joi.object({
                    name: Joi.string().required(),
                    email: Joi.string().email().required(),
                    password: Joi.string().min(8).required(),
                    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
                })
            },
            description: 'Register a new user',
            tags: ['api', 'auth']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/auth/login',
        handler: handlers.login,
        options: {
            validate: {
                payload: Joi.object({
                    email: Joi.string().email().required(),
                    password: Joi.string().required()
                })
            },
            description: 'Login a user',
            tags: ['api', 'auth']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/auth/refresh',
        handler: handlers.refreshToken,
        options: {
            validate: {
                payload: Joi.object({
                    refreshToken: Joi.string().required()
                })
            },
            description: 'Refresh access token',
            tags: ['api', 'auth']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/auth/forgot-password',
        handler: handlers.forgotPassword,
        options: {
            validate: {
                payload: Joi.object({
                    email: Joi.string().email().required()
                })
            },
            description: 'Request password reset',
            tags: ['api', 'auth']
        }
    },
    {
        method: 'POST',
        path: '/api/v1/auth/reset-password',
        handler: handlers.resetPassword,
        options: {
            validate: {
                payload: Joi.object({
                    token: Joi.string().required(),
                    password: Joi.string().min(8).required(),
                    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
                })
            },
            description: 'Reset password',
            tags: ['api', 'auth']
        }
    },
    {
        method: 'GET',
        path: '/api/v1/auth/me',
        handler: handlers.getProfile,
        options: {
            auth: 'jwt',
            description: 'Get current user profile',
            tags: ['api', 'auth']
        }
    },
    {
        method: 'PUT',
        path: '/api/v1/auth/me',
        handler: handlers.updateProfile,
        options: {
            auth: 'jwt',
            validate: {
                payload: Joi.object({
                    name: Joi.string(),
                    email: Joi.string().email(),
                    currentPassword: Joi.string().when('newPassword', {
                        is: Joi.exist(),
                        then: Joi.required()
                    }),
                    newPassword: Joi.string().min(8),
                    confirmPassword: Joi.string().valid(Joi.ref('newPassword'))
                })
            },
            description: 'Update user profile',
            tags: ['api', 'auth']
        }
    }
];

module.exports = routes;