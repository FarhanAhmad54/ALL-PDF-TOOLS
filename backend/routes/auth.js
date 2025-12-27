/**
 * Authentication Routes
 * Admin login, logout, and session management
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');

// Admin credentials storage path
const ADMIN_FILE = path.join(__dirname, '..', 'data', 'admin.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize admin file if not exists
function initAdminFile() {
    if (!fs.existsSync(ADMIN_FILE)) {
        const defaultPassword = bcrypt.hashSync('admin123', 10);
        const adminData = {
            passwordHash: defaultPassword,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginAttempts: 0,
            lockedUntil: null
        };
        fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminData, null, 2));
    }
}
initAdminFile();

// Read admin data
function getAdminData() {
    try {
        return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
    } catch (err) {
        initAdminFile();
        return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
    }
}

// Save admin data
function saveAdminData(data) {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}

// JWT verification middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access token required'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'pdftools-secret-key', (err, decoded) => {
        if (err) {
            return res.status(403).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }
        req.admin = decoded;
        next();
    });
};

// POST /api/auth/login
router.post('/login', [
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { password } = req.body;
    const adminData = getAdminData();

    // Check if account is locked
    if (adminData.lockedUntil && new Date(adminData.lockedUntil) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(adminData.lockedUntil) - new Date()) / 60000);
        return res.status(429).json({
            success: false,
            error: `Account locked. Try again in ${remainingMinutes} minutes.`
        });
    }

    // Reset lock if expired
    if (adminData.lockedUntil && new Date(adminData.lockedUntil) <= new Date()) {
        adminData.lockedUntil = null;
        adminData.loginAttempts = 0;
        saveAdminData(adminData);
    }

    // Verify password
    const isValid = await bcrypt.compare(password, adminData.passwordHash);

    if (!isValid) {
        adminData.loginAttempts = (adminData.loginAttempts || 0) + 1;

        // Lock after 5 failed attempts
        if (adminData.loginAttempts >= 5) {
            adminData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
            saveAdminData(adminData);
            return res.status(429).json({
                success: false,
                error: 'Too many failed attempts. Account locked for 15 minutes.'
            });
        }

        saveAdminData(adminData);
        return res.status(401).json({
            success: false,
            error: 'Invalid password',
            attemptsRemaining: 5 - adminData.loginAttempts
        });
    }

    // Reset login attempts on success
    adminData.loginAttempts = 0;
    adminData.lastLogin = new Date().toISOString();
    adminData.lastLoginIP = req.ip;
    saveAdminData(adminData);

    // Generate JWT token
    const token = jwt.sign(
        { role: 'admin', loginTime: Date.now() },
        process.env.JWT_SECRET || 'pdftools-secret-key',
        { expiresIn: '24h' }
    );

    res.json({
        success: true,
        message: 'Login successful',
        token,
        expiresIn: 86400 // 24 hours in seconds
    });
});

// POST /api/auth/logout
router.post('/logout', verifyToken, (req, res) => {
    // In a stateless JWT system, logout is handled client-side
    // Here we just confirm the action
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// GET /api/auth/verify
router.get('/verify', verifyToken, (req, res) => {
    res.json({
        success: true,
        admin: {
            role: req.admin.role,
            loginTime: req.admin.loginTime
        }
    });
});

// POST /api/auth/change-password
router.post('/change-password', verifyToken, [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { currentPassword, newPassword } = req.body;
    const adminData = getAdminData();

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, adminData.passwordHash);
    if (!isValid) {
        return res.status(401).json({
            success: false,
            error: 'Current password is incorrect'
        });
    }

    // Hash new password
    adminData.passwordHash = await bcrypt.hash(newPassword, 10);
    adminData.passwordChangedAt = new Date().toISOString();
    saveAdminData(adminData);

    res.json({
        success: true,
        message: 'Password changed successfully'
    });
});

// GET /api/auth/status
router.get('/status', (req, res) => {
    const adminData = getAdminData();
    res.json({
        success: true,
        status: {
            lastLogin: adminData.lastLogin,
            loginAttempts: adminData.loginAttempts,
            isLocked: adminData.lockedUntil ? new Date(adminData.lockedUntil) > new Date() : false
        }
    });
});

module.exports = router;
module.exports.verifyToken = verifyToken;
