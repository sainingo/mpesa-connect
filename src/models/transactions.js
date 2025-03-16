// src/models/transaction.js
'use strict';

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    // Common fields
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['STK', 'C2B', 'B2C'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    description: String,
    status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
        default: 'PENDING'
    },
    
    // MPESA specific fields
    mpesaReference: String,
    checkoutRequestId: String,
    merchantRequestId: String,
    conversationId: String,
    originatorConversationId: String,
    transactionId: String,
    resultCode: Number,
    resultDesc: String,
    
    // Account details
    accountReference: String,
    billRefNumber: String,
    
    // Timestamps for tracking
    mpesaTimestamp: Date,
    
    // Raw response data
    rawRequest: Object,
    rawResponse: Object,
    callbackData: Object,
    
    // Metadata
    metadata: {
        type: Object,
        default: {}
    }
}, { 
    timestamps: true 
});

// Indexes for faster querying
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ checkoutRequestId: 1 }, { sparse: true });
transactionSchema.index({ mpesaReference: 1 }, { sparse: true });
transactionSchema.index({ transactionId: 1 }, { sparse: true });
transactionSchema.index({ status: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;