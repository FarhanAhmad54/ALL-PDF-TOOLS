/**
 * Error Handler Middleware
 * Centralized error handling for all routes
 */

const errorHandler = (err, req, res, next) => {
    console.error('Error:', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        ip: req.ip
    });

    // Validation errors
    if (err.type === 'validation') {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            details: err.errors
        });
    }

    // Authentication errors
    if (err.name === 'UnauthorizedError' || err.status === 401) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized access'
        });
    }

    // Rate limit errors
    if (err.status === 429) {
        return res.status(429).json({
            success: false,
            error: 'Too many requests',
            retryAfter: err.retryAfter || 60
        });
    }

    // File upload errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            error: 'File too large'
        });
    }

    // Default server error
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
};

module.exports = { errorHandler };
