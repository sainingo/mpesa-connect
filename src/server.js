// src/server.js
'use strict';

const Hapi = require('@hapi/hapi');
const Jwt = require('@hapi/jwt');
const Joi = require("joi");
const dotenv = require('dotenv');
const { logger } = require('../src/core/utils/logger');

// Load environment variables
dotenv.config();

const init = async () => {
    const server = Hapi.server({
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
        routes: {
            cors: {
                origin: ['*'],
                headers: ['Accept', 'Authorization', 'Content-Type', 'If-None-Match'],
                credentials: true
            }
        }
    });

    // Register plugins
    await registerPlugins(server);

    // ✅ Register JWT before routes
    await server.register(Jwt);
    server.validator(Joi);

    server.auth.strategy('jwt', 'jwt', {
        keys: process.env.JWT_SECRET,
        verify: {
            aud: false,
            iss: false,
            sub: false,
            nbf: true,
            exp: true,
        },
        validate: (artifacts, request, h) => {
            if (!artifacts.decoded || !artifacts.decoded.payload.userId) {
                return { isValid: false };
            }
            return {
                isValid: true,
                credentials: { userId: artifacts.decoded.payload.userId }, // Extract userId
            };
        },
    });

    server.auth.default('jwt');

    // ✅ Now register routes after authentication is set up
    await registerRoutes(server);

    // Error handling
    server.ext('onPreResponse', (request, h) => {
        const response = request.response;
        if (!response.isBoom) {
            return h.continue;
        }

        logger.error(`Error: ${response.message}`, { stack: response.stack });

        // Custom error transformation
        const error = response.output.payload;
        error.success = false;

        return h.response(error).code(error.statusCode);
    });

    await server.start();
    logger.info(`Server running on ${server.info.uri}`);

    return server;
};


const registerPlugins = async (server) => {
    // Register plugins here
    await server.register([
        require('@hapi/inert'),
        require('@hapi/vision')
    ]);
};

const registerRoutes = async (server) => {
    // Register API routes
    server.route({
        method: 'GET',
        path: '/',
        options: {
            auth: false,
        },
        handler: (request, h) => {
            return { 
                status: 'success',
                message: 'MPESA Connect API is running' 
            };
        }
    });

    // Import and register other route groups
    const authRoutes = require('../src/api/v1/auth/routes');
    const c2bRoutes = require('../src/api/v1/c2b/routes');
    const b2cRoutes = require('../src/api/v1/b2c/routes');
    const stkRoutes = require('../src/api/v1/stk/routes');
    
    server.route([
        ...authRoutes,
        ...c2bRoutes,
        ...b2cRoutes,
        ...stkRoutes
    ]);
};

process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`, { stack: err.stack });
    process.exit(1);
});

// For testing purposes, don't automatically start the server
if (!module.parent) {
    init();
}

module.exports = { init };