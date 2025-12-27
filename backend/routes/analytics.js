/**
 * Analytics Routes
 * Track and retrieve website analytics
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('./auth');
const { getRequestStats } = require('../middleware/requestLogger');

// Analytics data file
const DATA_DIR = path.join(__dirname, '..', 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize analytics file
function initAnalyticsFile() {
    if (!fs.existsSync(ANALYTICS_FILE)) {
        const initialData = {
            created: new Date().toISOString(),
            dailyStats: {},
            toolUsage: {},
            pageViews: {},
            sessions: [],
            totalPageViews: 0,
            totalToolUses: 0,
            uniqueVisitors: new Set()
        };
        saveAnalytics(initialData);
    }
}
initAnalyticsFile();

// Read analytics
function getAnalytics() {
    try {
        const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
        // Convert uniqueVisitors back to Set if it's an array
        if (Array.isArray(data.uniqueVisitors)) {
            data.uniqueVisitors = new Set(data.uniqueVisitors);
        }
        return data;
    } catch (err) {
        initAnalyticsFile();
        return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
    }
}

// Save analytics
function saveAnalytics(data) {
    // Convert Set to Array for JSON storage
    const toSave = { ...data };
    if (data.uniqueVisitors instanceof Set) {
        toSave.uniqueVisitors = Array.from(data.uniqueVisitors);
    }
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(toSave, null, 2));
}

// Get today's date key
function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

// Ensure today's stats exist
function ensureTodayStats(data) {
    const today = getTodayKey();
    if (!data.dailyStats[today]) {
        data.dailyStats[today] = {
            pageViews: 0,
            toolUses: 0,
            uniqueVisitors: 0,
            filesProcessed: 0,
            bytesProcessed: 0,
            errors: 0,
            pages: {},
            tools: {}
        };
    }
    return data;
}

// POST /api/analytics/track - Track an event
router.post('/track', (req, res) => {
    const { event, data: eventData } = req.body;
    const visitorId = req.headers['x-visitor-id'] || req.ip;

    let analytics = getAnalytics();
    analytics = ensureTodayStats(analytics);
    const today = getTodayKey();

    switch (event) {
        case 'pageview':
            analytics.dailyStats[today].pageViews++;
            analytics.totalPageViews++;

            const page = eventData?.page || '/';
            if (!analytics.dailyStats[today].pages[page]) {
                analytics.dailyStats[today].pages[page] = 0;
            }
            analytics.dailyStats[today].pages[page]++;
            break;

        case 'tool_use':
            analytics.dailyStats[today].toolUses++;
            analytics.totalToolUses++;

            const tool = eventData?.tool || 'unknown';
            if (!analytics.dailyStats[today].tools[tool]) {
                analytics.dailyStats[today].tools[tool] = 0;
            }
            analytics.dailyStats[today].tools[tool]++;

            // Global tool tracking
            if (!analytics.toolUsage[tool]) {
                analytics.toolUsage[tool] = 0;
            }
            analytics.toolUsage[tool]++;
            break;

        case 'file_processed':
            analytics.dailyStats[today].filesProcessed++;
            analytics.dailyStats[today].bytesProcessed += eventData?.size || 0;
            break;

        case 'error':
            analytics.dailyStats[today].errors++;
            break;

        case 'session_start':
            // Track unique visitor
            if (!analytics.uniqueVisitors) {
                analytics.uniqueVisitors = new Set();
            }
            if (analytics.uniqueVisitors instanceof Set) {
                const wasNew = !analytics.uniqueVisitors.has(visitorId);
                analytics.uniqueVisitors.add(visitorId);
                if (wasNew) {
                    analytics.dailyStats[today].uniqueVisitors++;
                }
            }
            break;
    }

    saveAnalytics(analytics);

    res.json({ success: true });
});

// GET /api/analytics - Get analytics (protected)
router.get('/', verifyToken, (req, res) => {
    const analytics = getAnalytics();
    const requestStats = getRequestStats();
    const today = getTodayKey();

    // Calculate 7-day stats
    const last7Days = { pageViews: 0, toolUses: 0, files: 0 };
    const now = new Date();

    for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const key = date.toISOString().split('T')[0];

        if (analytics.dailyStats[key]) {
            last7Days.pageViews += analytics.dailyStats[key].pageViews || 0;
            last7Days.toolUses += analytics.dailyStats[key].toolUses || 0;
            last7Days.files += analytics.dailyStats[key].filesProcessed || 0;
        }
    }

    // Get top tools
    const topTools = Object.entries(analytics.toolUsage || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tool, count]) => ({ tool, count }));

    res.json({
        success: true,
        analytics: {
            today: analytics.dailyStats[today] || { pageViews: 0, toolUses: 0 },
            total: {
                pageViews: analytics.totalPageViews || 0,
                toolUses: analytics.totalToolUses || 0,
                uniqueVisitors: Array.isArray(analytics.uniqueVisitors)
                    ? analytics.uniqueVisitors.length
                    : analytics.uniqueVisitors?.size || 0
            },
            last7Days,
            topTools,
            dailyStats: analytics.dailyStats,
            requestStats
        }
    });
});

// GET /api/analytics/export - Export all data (protected)
router.get('/export', verifyToken, (req, res) => {
    const analytics = getAnalytics();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_${getTodayKey()}.json`);
    res.json(analytics);
});

// POST /api/analytics/import - Import data (protected)
router.post('/import', verifyToken, (req, res) => {
    const { data } = req.body;

    if (!data || !data.dailyStats) {
        return res.status(400).json({
            success: false,
            error: 'Invalid analytics data format'
        });
    }

    saveAnalytics(data);

    res.json({
        success: true,
        message: 'Analytics data imported successfully'
    });
});

// DELETE /api/analytics - Clear all data (protected)
router.delete('/', verifyToken, (req, res) => {
    const initialData = {
        created: new Date().toISOString(),
        dailyStats: {},
        toolUsage: {},
        pageViews: {},
        sessions: [],
        totalPageViews: 0,
        totalToolUses: 0,
        uniqueVisitors: []
    };

    saveAnalytics(initialData);

    res.json({
        success: true,
        message: 'All analytics data cleared'
    });
});

// Cleanup old data (keep 30 days)
function cleanupOldData() {
    const analytics = getAnalytics();
    const dates = Object.keys(analytics.dailyStats).sort();
    const maxDays = 30;

    while (dates.length > maxDays) {
        const oldDate = dates.shift();
        delete analytics.dailyStats[oldDate];
    }

    saveAnalytics(analytics);
}

// Run cleanup daily
setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

module.exports = router;
