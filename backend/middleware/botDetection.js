/**
 * Bot Detection Middleware
 * Identifies and handles automated/bot requests
 */

// Known bot user agents
const BOT_USER_AGENTS = [
    /bot/i,
    /spider/i,
    /crawl/i,
    /scrape/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /java\//i,
    /perl/i,
    /ruby/i,
    /phantomjs/i,
    /headless/i,
    /selenium/i,
    /puppeteer/i
];

// Good bots (search engines)
const GOOD_BOTS = [
    /googlebot/i,
    /bingbot/i,
    /slurp/i,       // Yahoo
    /duckduckbot/i,
    /baiduspider/i,
    /yandexbot/i,
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i
];

// Suspicious patterns
const SUSPICIOUS_PATTERNS = {
    rapidRequests: 20,    // Max requests per 10 seconds
    noUserAgent: true,
    noReferer: true,
    suspiciousHeaders: [
        'x-forwarded-host',
        'x-original-url',
        'x-rewrite-url'
    ]
};

// In-memory IP tracking
const ipRequestCounts = new Map();
const blockedIPs = new Set();
const BLOCK_DURATION = 300000; // 5 minutes

// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipRequestCounts) {
        if (now - data.lastRequest > 60000) {
            ipRequestCounts.delete(ip);
        }
    }
}, 60000);

const botDetection = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || '';

    // Check if IP is blocked
    if (blockedIPs.has(ip)) {
        return res.status(403).json({
            success: false,
            error: 'Access temporarily blocked',
            retryAfter: 300
        });
    }

    // Track request count
    const now = Date.now();
    if (!ipRequestCounts.has(ip)) {
        ipRequestCounts.set(ip, { count: 0, firstRequest: now, lastRequest: now });
    }

    const ipData = ipRequestCounts.get(ip);
    ipData.count++;
    ipData.lastRequest = now;

    // Check for rapid requests (within 10 seconds)
    if (now - ipData.firstRequest < 10000 && ipData.count > SUSPICIOUS_PATTERNS.rapidRequests) {
        console.warn(`⚠️ Rapid requests detected from ${ip}: ${ipData.count} requests in 10s`);
        blockIP(ip);
        return res.status(429).json({
            success: false,
            error: 'Too many requests. Please slow down.',
            retryAfter: 60
        });
    }

    // Reset counter after 10 seconds
    if (now - ipData.firstRequest > 10000) {
        ipData.count = 1;
        ipData.firstRequest = now;
    }

    // Determine bot type
    const botInfo = analyzeBotSignature(req);

    // Add bot info to request
    req.botInfo = botInfo;

    // Block bad bots
    if (botInfo.isBot && botInfo.botType === 'bad') {
        console.warn(`🤖 Bad bot blocked: ${ip} - ${userAgent}`);
        return res.status(403).json({
            success: false,
            error: 'Automated access not allowed'
        });
    }

    // Log suspicious but allow
    if (botInfo.suspiciousScore > 5) {
        console.warn(`⚠️ Suspicious request: ${ip} - Score: ${botInfo.suspiciousScore}`);
    }

    next();
};

function analyzeBotSignature(req) {
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || '';

    let suspiciousScore = 0;
    let isBot = false;
    let botType = 'unknown';

    // Check user agent
    if (!userAgent) {
        suspiciousScore += 3;
    }

    // Check for good bots
    for (const pattern of GOOD_BOTS) {
        if (pattern.test(userAgent)) {
            isBot = true;
            botType = 'good';
            return { isBot, botType, suspiciousScore: 0, name: userAgent.match(pattern)?.[0] };
        }
    }

    // Check for bad bots
    for (const pattern of BOT_USER_AGENTS) {
        if (pattern.test(userAgent)) {
            isBot = true;
            botType = 'bad';
            suspiciousScore += 5;
            break;
        }
    }

    // Check for missing referer on non-API requests
    if (!referer && !req.path.startsWith('/api/')) {
        suspiciousScore += 1;
    }

    // Check for suspicious headers
    for (const header of SUSPICIOUS_PATTERNS.suspiciousHeaders) {
        if (req.headers[header]) {
            suspiciousScore += 2;
        }
    }

    // Check for very short user agent
    if (userAgent.length < 20) {
        suspiciousScore += 2;
    }

    // Check for common browser signatures
    const hasBrowserSignature = /mozilla|chrome|safari|firefox|edge|opera/i.test(userAgent);
    if (!hasBrowserSignature && userAgent) {
        suspiciousScore += 2;
    }

    return {
        isBot,
        botType,
        suspiciousScore,
        userAgent: userAgent.substring(0, 100)
    };
}

function blockIP(ip) {
    blockedIPs.add(ip);
    setTimeout(() => {
        blockedIPs.delete(ip);
    }, BLOCK_DURATION);
}

// Get blocked IPs
const getBlockedIPs = () => Array.from(blockedIPs);

// Manually block/unblock IP
const manualBlockIP = (ip, duration = BLOCK_DURATION) => {
    blockedIPs.add(ip);
    setTimeout(() => blockedIPs.delete(ip), duration);
};

const unblockIP = (ip) => {
    blockedIPs.delete(ip);
};

module.exports = {
    botDetection,
    getBlockedIPs,
    manualBlockIP,
    unblockIP
};
