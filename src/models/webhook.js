// src/models/webhook.js
'use strict';

const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    },
    type: {
        type: String,
        enum: ['STK', 'C2B_CONFIRMATION', 'C2B_VALIDATION', 'B2C_RESULT', 'B2C_TIMEOUT'],
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'SENT', 'FAILED', 'RETRYING'],
        default: 'PENDING'
    },
    payload: {
        type: Object,
        required: true
    },
    destination: {
        type: String,
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    lastAttempt: Date,
    response: Object,
    errorMessage: String
}, {
    timestamps: true
});

// Indexes for faster querying
webhookSchema.index({ userId: 1, type: 1, createdAt: -1 });
webhookSchema.index({ status: 1 });
webhookSchema.index({ transactionId: 1 });

const Webhook = mongoose.model('Webhook', webhookSchema);

module.exports = Webhook;