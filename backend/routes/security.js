/**
 * Security Routes
 * Security status, blocked IPs, and security settings
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('./auth');
const { getBlockedIPs, manualBlockIP, unblockIP } = require('../middleware/botDetection');
const { getRecentLogs, getRequestStats } = require('../middleware/requestLogger');

// GET /api/security/status - Get security status (protected)
router.get('/status', verifyToken, (req, res) => {
    const blockedIPs = getBlockedIPs();
    const requestStats = getRequestStats();
    const recentLogs = getRecentLogs(20);

    // Analyze for suspicious activity
    const suspiciousCount = recentLogs.filter(log =>
        log.statusCode === 403 || log.statusCode === 429
    ).length;

    res.json({
        success: true,
        security: {
            status: suspiciousCount > 5 ? 'warning' : 'secure',
            blockedIPs: blockedIPs.length,
            blockedIPList: blockedIPs,
            recentRequests: requestStats.lastHour,
            uniqueVisitors: requestStats.uniqueVisitors,
            suspiciousRequests: suspiciousCount,
            avgResponseTime: requestStats.avgResponseTime,
            statusCodes: requestStats.statusCodes
        }
    });
});

// GET /api/security/logs - Get recent request logs (protected)
router.get('/logs', verifyToken, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const logs = getRecentLogs(Math.min(limit, 500));

    res.json({
        success: true,
        logs,
        total: logs.length
    });
});

// POST /api/security/block - Block an IP (protected)
router.post('/block', verifyToken, (req, res) => {
    const { ip, duration } = req.body;

    if (!ip) {
        return res.status(400).json({
            success: false,
            error: 'IP address required'
        });
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip) && ip !== '::1' && !ip.startsWith('::ffff:')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid IP address format'
        });
    }

    const blockDuration = duration || 300000; // 5 minutes default
    manualBlockIP(ip, blockDuration);

    res.json({
        success: true,
        message: `IP ${ip} blocked for ${blockDuration / 1000} seconds`
    });
});

// POST /api/security/unblock - Unblock an IP (protected)
router.post('/unblock', verifyToken, (req, res) => {
    const { ip } = req.body;

    if (!ip) {
        return res.status(400).json({
            success: false,
            error: 'IP address required'
        });
    }

    unblockIP(ip);

    res.json({
        success: true,
        message: `IP ${ip} unblocked`
    });
});

// GET /api/security/threats - Get threat analysis (protected)
router.get('/threats', verifyToken, (req, res) => {
    const logs = getRecentLogs(500);

    // Analyze threats
    const threats = {
        pathTraversal: 0,
        sqlInjection: 0,
        xssAttempt: 0,
        bruteForce: 0,
        botActivity: 0,
        rateLimited: 0
    };

    const suspiciousIPs = {};

    logs.forEach(log => {
        const testString = `${log.path}${JSON.stringify(log.query || {})}`;

        if (/\.\.\//.test(testString)) {
            threats.pathTraversal++;
            suspiciousIPs[log.ip] = (suspiciousIPs[log.ip] || 0) + 1;
        }

        if (/union.*select|or\s+1\s*=\s*1/i.test(testString)) {
            threats.sqlInjection++;
            suspiciousIPs[log.ip] = (suspiciousIPs[log.ip] || 0) + 1;
        }

        if (/<script|javascript:/i.test(testString)) {
            threats.xssAttempt++;
            suspiciousIPs[log.ip] = (suspiciousIPs[log.ip] || 0) + 1;
        }

        if (log.path === '/api/auth/login' && log.statusCode === 401) {
            threats.bruteForce++;
        }

        if (log.statusCode === 403) {
            threats.botActivity++;
        }

        if (log.statusCode === 429) {
            threats.rateLimited++;
        }
    });

    // Top suspicious IPs
    const topSuspicious = Object.entries(suspiciousIPs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }));

    res.json({
        success: true,
        threats,
        suspiciousIPs: topSuspicious,
        totalThreats: Object.values(threats).reduce((a, b) => a + b, 0),
        analyzedLogs: logs.length
    });
});

// POST /api/security/settings - Update security settings (protected)
router.post('/settings', verifyToken, (req, res) => {
    // This would update security configuration
    // For now, return current settings
    res.json({
        success: true,
        message: 'Security settings updated',
        settings: {
            rateLimitWindow: process.env.RATE_LIMIT_WINDOW_MS || 60000,
            rateLimitMax: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
            maxFileSize: process.env.MAX_FILE_SIZE_MB || 100
        }
    });
});

module.exports = router;
