// src/api/v1/auth/handlers.js
'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Boom = require('@hapi/boom');
const User = require('../../../models/user');
const { logger } = require('../../../core/utils/logger');

const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
    
    const refreshToken = jwt.sign(
        { id: user._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
    
    return { accessToken, refreshToken };
};

exports.register = async (request, h) => {
    try {
        const { name, email, password } = request.payload;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return Boom.conflict('Email already registered');
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword
        });
        
        await user.save();
        
        // Generate tokens
        const tokens = generateTokens(user);
        
        return h.response({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            },
            tokens
        }).code(201);
    } catch (error) {
        logger.error('Error in register handler', { error: error.message });
        return Boom.badImplementation('Error registering user');
    }
};

exports.login = async (request, h) => {
    try {
        const { email, password } = request.payload;
        
        // Find user by email
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return Boom.unauthorized('Invalid credentials');
        }
        
        // Check if user is active
        if (!user.isActive) {
            return Boom.forbidden('Account is disabled');
        }
        
        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return Boom.unauthorized('Invalid credentials');
        }
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        // Generate tokens
        const tokens = generateTokens(user);
        
        return h.response({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            tokens
        });
    } catch (error) {
        logger.error('Error in login handler', { error: error.message });
        return Boom.badImplementation('Error logging in');
    }
};

exports.refreshToken = async (request, h) => {
    try {
        const { refreshToken } = request.payload;
        
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        // Find user by ID
        const user = await User.findById(decoded.id);
        if (!user) {
            return Boom.unauthorized('Invalid token');
        }
        
        // Check if user is active
        if (!user.isActive) {
            return Boom.forbidden('Account is disabled');
        }
        
        // Generate new tokens
        const tokens = generateTokens(user);
        
        return h.response({
            success: true,
            tokens
        });
    } catch (error) {
        logger.error('Error in refreshToken handler', { error: error.message });
        return Boom.unauthorized('Invalid or expired token');
    }
};

exports.forgotPassword = async (request, h) => {
    try {
        const { email } = request.payload;
        
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal if email exists or not
            return h.response({
                success: true,
                message: 'If your email is registered, you will receive a password reset link'
            });
        }
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        
        await user.save();
        
        // Send email with reset link
        // Note: Implement email service integration here
        logger.info('Password reset requested', { email });
        
        return h.response({
            success: true,
            message: 'If your email is registered, you will receive a password reset link'
        });
    } catch (error) {
        logger.error('Error in forgotPassword handler', { error: error.message });
        return Boom.badImplementation('Error processing your request');
    }
};

exports.resetPassword = async (request, h) => {
    try {
        const { token, password } = request.payload;
        
        // Find user by reset token
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return Boom.badRequest('Invalid or expired token');
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();
        
        return h.response({
            success: true,
            message: 'Password reset successful'
        });
    } catch (error) {
        logger.error('Error in resetPassword handler', { error: error.message });
        return Boom.badImplementation('Error resetting password');
    }
};

exports.getProfile = async (request, h) => {
    try {
        const user = await User.findById(request.auth.credentials.id);
        if (!user) {
            return Boom.notFound('User not found');
        }
        
        return h.response({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                mpesaConfig: {
                    environment: user.mpesaConfig?.environment,
                    shortCode: user.mpesaConfig?.shortCode,
                    initiatorName: user.mpesaConfig?.initiatorName,
                    callbackBaseUrl: user.mpesaConfig?.callbackBaseUrl
                },
                webhookConfig: {
                    endpoints: user.webhookConfig?.endpoints
                },
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        logger.error('Error in getProfile handler', { error: error.message });
        return Boom.badImplementation('Error fetching profile');
    }
};

exports.updateProfile = async (request, h) => {
    try {
        const { name, email, currentPassword, newPassword } = request.payload;
        
        const user = await User.findById(request.auth.credentials.id).select('+password');
        if (!user) {
            return Boom.notFound('User not found');
        }
        
        // Update basic info
        if (name) user.name = name;
        
        // Update email if provided and different
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return Boom.conflict('Email already in use');
            }
            user.email = email;
        }
        
        // Update password if provided
        if (newPassword) {
            // Verify current password
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return Boom.unauthorized('Current password is incorrect');
            }
            
            // Hash new password
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
        }
        
        await user.save();
        
        return h.response({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        logger.error('Error in updateProfile handler', { error: error.message });
        return Boom.badImplementation('Error updating profile');
    }
};