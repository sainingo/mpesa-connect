// src/models/user.js
'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    apiKey: {
        type: String,
        unique: true,
        select: false
    },
    secretKey: {
        type: String,
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    mpesaConfig: {
        environment: {
            type: String,
            enum: ['sandbox', 'production'],
            default: 'sandbox'
        },
        consumerKey: {
            type: String,
            select: false
        },
        consumerSecret: {
            type: String,
            select: false
        },
        shortCode: String,
        passKey: {
            type: String,
            select: false
        },
        initiatorName: String,
        securityCredential: {
            type: String,
            select: false
        },
        callbackBaseUrl: String
    },
    webhookConfig: {
        secret: {
            type: String,
            select: false
        },
        endpoints: {
            stkCallback: String,
            c2bConfirmation: String,
            c2bValidation: String,
            b2cResult: String
        }
    },
    lastLogin: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date
}, {
    timestamps: true
});

// Generate API key and secret key before saving
userSchema.pre('save', async function(next) {
    if (this.isNew || !this.apiKey) {
        this.apiKey = crypto.randomBytes(16).toString('hex');
        this.secretKey = crypto.randomBytes(32).toString('hex');
    }
    next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;