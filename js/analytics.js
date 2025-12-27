/* ============================================
   PDF Tools - Analytics & Storage System
   Track usage, store daily data, local storage
   ============================================ */

// ============================================
// ANALYTICS STORAGE
// ============================================
const Analytics = {
    STORAGE_KEY: 'pdftools_analytics',
    MAX_DAYS: 30, // Keep 30 days of data

    // Initialize analytics
    init() {
        this.ensureStorage();
        this.trackPageView();
        this.startSession();
    },

    // Ensure storage structure exists
    ensureStorage() {
        const data = this.getData();
        if (!data) {
            this.setData({
                created: new Date().toISOString(),
                dailyStats: {},
                toolUsage: {},
                sessions: [],
                totalPageViews: 0,
                totalToolUses: 0,
                uniqueVisits: 0
            });
        }
        this.cleanOldData();
    },

    // Get all analytics data
    getData() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY));
        } catch {
            return null;
        }
    },

    // Save analytics data
    setData(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Analytics storage error:', e);
        }
    },

    // Get today's date key
    getTodayKey() {
        return new Date().toISOString().split('T')[0];
    },

    // Track page view
    trackPageView() {
        const data = this.getData();
        const today = this.getTodayKey();
        const page = window.location.pathname;

        // Initialize today if needed
        if (!data.dailyStats[today]) {
            data.dailyStats[today] = {
                pageViews: 0,
                toolUses: 0,
                uniqueVisitors: 0,
                pages: {},
                tools: {},
                errors: 0,
                avgSessionDuration: 0,
                bounceRate: 0
            };
        }

        // Increment page views
        data.dailyStats[today].pageViews++;
        data.totalPageViews++;

        // Track specific page
        if (!data.dailyStats[today].pages[page]) {
            data.dailyStats[today].pages[page] = 0;
        }
        data.dailyStats[today].pages[page]++;

        this.setData(data);
    },

    // Track tool usage
    trackToolUsage(toolId) {
        const data = this.getData();
        const today = this.getTodayKey();

        // Initialize today if needed
        if (!data.dailyStats[today]) {
            data.dailyStats[today] = {
                pageViews: 0,
                toolUses: 0,
                uniqueVisitors: 0,
                pages: {},
                tools: {},
                errors: 0
            };
        }

        // Increment tool usage
        data.dailyStats[today].toolUses++;
        data.totalToolUses++;

        // Track specific tool
        if (!data.dailyStats[today].tools[toolId]) {
            data.dailyStats[today].tools[toolId] = 0;
        }
        data.dailyStats[today].tools[toolId]++;

        // Global tool tracking
        if (!data.toolUsage[toolId]) {
            data.toolUsage[toolId] = 0;
        }
        data.toolUsage[toolId]++;

        this.setData(data);
    },

    // Track file processing
    trackFileProcessed(toolId, fileSize, success = true) {
        const data = this.getData();
        const today = this.getTodayKey();

        if (!data.dailyStats[today].filesProcessed) {
            data.dailyStats[today].filesProcessed = 0;
            data.dailyStats[today].bytesProcessed = 0;
        }

        data.dailyStats[today].filesProcessed++;
        data.dailyStats[today].bytesProcessed += fileSize;

        if (!success) {
            data.dailyStats[today].errors++;
        }

        this.setData(data);
    },

    // Start session tracking
    startSession() {
        const sessionId = 'session_' + Date.now();
        const data = this.getData();

        // Check if new unique visitor
        const visitorId = localStorage.getItem('pdftools_visitor_id');
        if (!visitorId) {
            const newVisitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('pdftools_visitor_id', newVisitorId);
            data.uniqueVisits++;

            const today = this.getTodayKey();
            if (data.dailyStats[today]) {
                data.dailyStats[today].uniqueVisitors++;
            }
        }

        // Track session
        sessionStorage.setItem('pdftools_session_id', sessionId);
        sessionStorage.setItem('pdftools_session_start', Date.now().toString());

        this.setData(data);

        // Track session end on page unload
        window.addEventListener('beforeunload', () => this.endSession());
    },

    // End session
    endSession() {
        const start = parseInt(sessionStorage.getItem('pdftools_session_start'));
        if (start) {
            const duration = Date.now() - start;
            const data = this.getData();
            const today = this.getTodayKey();

            if (!data.dailyStats[today].sessionDurations) {
                data.dailyStats[today].sessionDurations = [];
            }
            data.dailyStats[today].sessionDurations.push(duration);

            this.setData(data);
        }
    },

    // Track error
    trackError(errorType, message) {
        const data = this.getData();
        const today = this.getTodayKey();

        if (!data.dailyStats[today].errorTypes) {
            data.dailyStats[today].errorTypes = {};
        }
        if (!data.dailyStats[today].errorTypes[errorType]) {
            data.dailyStats[today].errorTypes[errorType] = 0;
        }
        data.dailyStats[today].errorTypes[errorType]++;
        data.dailyStats[today].errors++;

        this.setData(data);
    },

    // Clean old data (keep only MAX_DAYS)
    cleanOldData() {
        const data = this.getData();
        const dates = Object.keys(data.dailyStats).sort();

        while (dates.length > this.MAX_DAYS) {
            const oldDate = dates.shift();
            delete data.dailyStats[oldDate];
        }

        this.setData(data);
    },

    // Get statistics for dashboard
    getStats() {
        const data = this.getData();
        const today = this.getTodayKey();
        const todayStats = data.dailyStats[today] || { pageViews: 0, toolUses: 0 };

        // Calculate 7-day stats
        const last7Days = this.getLast7DaysStats();

        return {
            today: todayStats,
            total: {
                pageViews: data.totalPageViews,
                toolUses: data.totalToolUses,
                uniqueVisits: data.uniqueVisits
            },
            last7Days,
            topTools: this.getTopTools(data.toolUsage),
            dailyStats: data.dailyStats
        };
    },

    // Get last 7 days stats
    getLast7DaysStats() {
        const data = this.getData();
        const stats = { pageViews: 0, toolUses: 0, files: 0 };
        const now = new Date();

        for (let i = 0; i < 7; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const key = date.toISOString().split('T')[0];

            if (data.dailyStats[key]) {
                stats.pageViews += data.dailyStats[key].pageViews || 0;
                stats.toolUses += data.dailyStats[key].toolUses || 0;
                stats.files += data.dailyStats[key].filesProcessed || 0;
            }
        }

        return stats;
    },

    // Get top tools
    getTopTools(toolUsage, limit = 5) {
        return Object.entries(toolUsage || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([tool, count]) => ({ tool, count }));
    },

    // Export data for backup
    exportData() {
        const data = this.getData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pdftools_analytics_${this.getTodayKey()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // Import data from backup
    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.dailyStats && data.toolUsage) {
                this.setData(data);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    },

    // Clear all data
    clearData() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.ensureStorage();
    }
};

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Analytics.init());
} else {
    Analytics.init();
}

// Export
window.Analytics = Analytics;
