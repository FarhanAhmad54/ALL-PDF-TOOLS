/**
 * Request Logger Middleware
 * Logs all incoming requests and stores for analytics
 */

const fs = require('fs');
const path = require('path');

// In-memory log storage
const requestLogs = [];
const MAX_LOGS = 10000;

// Log file path
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'requests.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const requestLogger = (req, res, next) => {
    const startTime = Date.now();

    // Get request info
    const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        referer: req.headers['referer'] || null,
        requestId: req.headers['x-request-id'] || generateRequestId()
    };

    // Add request ID to response headers
    res.set('X-Request-ID', logEntry.requestId);

    // Log response on finish
    res.on('finish', () => {
        logEntry.statusCode = res.statusCode;
        logEntry.responseTime = Date.now() - startTime;
        logEntry.contentLength = res.get('content-length') || 0;

        // Store in memory
        requestLogs.push(logEntry);
        if (requestLogs.length > MAX_LOGS) {
            requestLogs.shift();
        }

        // Write to file (async, non-blocking)
        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFile(LOG_FILE, logLine, (err) => {
            if (err) console.error('Log write error:', err.message);
        });

        // Log suspicious requests
        if (isSuspicious(logEntry)) {
            console.warn('⚠️ Suspicious request:', logEntry);
        }
    });

    next();
};

// Generate unique request ID
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Check for suspicious patterns
function isSuspicious(log) {
    const suspiciousPatterns = [
        /\.\.\//,           // Path traversal
        /\<script/i,        // XSS attempt
        /union.*select/i,   // SQL injection
        /eval\(/i,          // Code injection
        /\.php$/i,          // PHP file access
        /\.exe$/i,          // Executable access
        /admin.*password/i, // Admin probe
        /wp-admin/i,        // WordPress probe
        /phpmyadmin/i       // PHPMyAdmin probe
    ];

    const testString = `${log.path}${JSON.stringify(log.query)}${log.userAgent}`;
    return suspiciousPatterns.some(pattern => pattern.test(testString));
}

// Get recent logs
const getRecentLogs = (limit = 100) => {
    return requestLogs.slice(-limit).reverse();
};

// Get logs by path
const getLogsByPath = (pathPattern, limit = 50) => {
    return requestLogs
        .filter(log => log.path.includes(pathPattern))
        .slice(-limit)
        .reverse();
};

// Get stats
const getRequestStats = () => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const recentLogs = requestLogs.filter(log =>
        new Date(log.timestamp).getTime() > oneHourAgo
    );

    const todayLogs = requestLogs.filter(log =>
        new Date(log.timestamp).getTime() > oneDayAgo
    );

    // Group by path
    const pathCounts = {};
    todayLogs.forEach(log => {
        pathCounts[log.path] = (pathCounts[log.path] || 0) + 1;
    });

    // Group by status code
    const statusCounts = {};
    todayLogs.forEach(log => {
        statusCounts[log.statusCode] = (statusCounts[log.statusCode] || 0) + 1;
    });

    // Unique IPs
    const uniqueIPs = new Set(todayLogs.map(log => log.ip));

    return {
        totalRequests: requestLogs.length,
        lastHour: recentLogs.length,
        lastDay: todayLogs.length,
        uniqueVisitors: uniqueIPs.size,
        topPaths: Object.entries(pathCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10),
        statusCodes: statusCounts,
        avgResponseTime: todayLogs.length > 0
            ? Math.round(todayLogs.reduce((sum, log) => sum + (log.responseTime || 0), 0) / todayLogs.length)
            : 0
    };
};

module.exports = {
    requestLogger,
    getRecentLogs,
    getLogsByPath,
    getRequestStats
};
