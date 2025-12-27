/* ============================================
   PDF Tools - Security System
   Rate limiting, bot detection, spam prevention
   ============================================ */

// ============================================
// SECURITY CONFIGURATION
// ============================================
const SecurityConfig = {
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    MAX_REQUESTS_PER_WINDOW: 30, // 30 actions per minute
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    ALLOWED_FILE_TYPES: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
    CAPTCHA_THRESHOLD: 10, // Show captcha after 10 rapid actions
    BLOCK_DURATION: 300000, // 5 minute block
    HONEYPOT_FIELD_NAME: 'website_url_confirm' // Hidden field name
};

// ============================================
// RATE LIMITER
// ============================================
const RateLimiter = {
    requests: [],
    blocked: false,
    blockedUntil: null,

    // Check if action is allowed
    checkLimit() {
        const now = Date.now();

        // Check if currently blocked
        if (this.blocked) {
            if (now < this.blockedUntil) {
                return {
                    allowed: false,
                    reason: 'blocked',
                    retryAfter: Math.ceil((this.blockedUntil - now) / 1000)
                };
            } else {
                this.blocked = false;
                this.blockedUntil = null;
                this.requests = [];
            }
        }

        // Clean old requests
        this.requests = this.requests.filter(
            time => now - time < SecurityConfig.RATE_LIMIT_WINDOW
        );

        // Check rate limit
        if (this.requests.length >= SecurityConfig.MAX_REQUESTS_PER_WINDOW) {
            this.blocked = true;
            this.blockedUntil = now + SecurityConfig.BLOCK_DURATION;

            Security.logSecurityEvent('rate_limit_exceeded', {
                requests: this.requests.length,
                window: SecurityConfig.RATE_LIMIT_WINDOW
            });

            return {
                allowed: false,
                reason: 'rate_limited',
                retryAfter: Math.ceil(SecurityConfig.BLOCK_DURATION / 1000)
            };
        }

        // Record this request
        this.requests.push(now);

        return {
            allowed: true,
            remaining: SecurityConfig.MAX_REQUESTS_PER_WINDOW - this.requests.length
        };
    },

    // Get current status
    getStatus() {
        const now = Date.now();
        this.requests = this.requests.filter(
            time => now - time < SecurityConfig.RATE_LIMIT_WINDOW
        );

        return {
            requestsInWindow: this.requests.length,
            maxRequests: SecurityConfig.MAX_REQUESTS_PER_WINDOW,
            blocked: this.blocked,
            blockedUntil: this.blockedUntil
        };
    },

    // Reset limiter
    reset() {
        this.requests = [];
        this.blocked = false;
        this.blockedUntil = null;
    }
};

// ============================================
// BOT DETECTION
// ============================================
const BotDetector = {
    score: 0,
    checks: {
        mouseMovement: false,
        keyboardActivity: false,
        scrollActivity: false,
        touchActivity: false,
        timeOnPage: false,
        sessionValid: false
    },

    // Initialize detection
    init() {
        const startTime = Date.now();

        // Mouse movement detection
        let mouseMoves = 0;
        document.addEventListener('mousemove', () => {
            mouseMoves++;
            if (mouseMoves > 5) {
                this.checks.mouseMovement = true;
                this.updateScore();
            }
        }, { once: false, passive: true });

        // Keyboard activity
        document.addEventListener('keydown', () => {
            this.checks.keyboardActivity = true;
            this.updateScore();
        }, { once: true, passive: true });

        // Scroll activity
        document.addEventListener('scroll', () => {
            this.checks.scrollActivity = true;
            this.updateScore();
        }, { once: true, passive: true });

        // Touch activity (mobile)
        document.addEventListener('touchstart', () => {
            this.checks.touchActivity = true;
            this.updateScore();
        }, { once: true, passive: true });

        // Time on page (5+ seconds = human)
        setTimeout(() => {
            this.checks.timeOnPage = true;
            this.updateScore();
        }, 5000);

        // Session validation
        if (sessionStorage.getItem('pdftools_session_id')) {
            this.checks.sessionValid = true;
            this.updateScore();
        }
    },

    // Update bot score
    updateScore() {
        let score = 0;
        if (this.checks.mouseMovement) score += 20;
        if (this.checks.keyboardActivity) score += 15;
        if (this.checks.scrollActivity) score += 15;
        if (this.checks.touchActivity) score += 20;
        if (this.checks.timeOnPage) score += 20;
        if (this.checks.sessionValid) score += 10;

        this.score = score;
    },

    // Check if likely human
    isHuman() {
        return this.score >= 35;
    },

    // Get confidence level
    getConfidence() {
        if (this.score >= 70) return 'high';
        if (this.score >= 40) return 'medium';
        return 'low';
    }
};

// ============================================
// HONEYPOT PROTECTION
// ============================================
const Honeypot = {
    // Create honeypot field
    createField() {
        const field = document.createElement('input');
        field.type = 'text';
        field.name = SecurityConfig.HONEYPOT_FIELD_NAME;
        field.id = SecurityConfig.HONEYPOT_FIELD_NAME;
        field.autocomplete = 'off';
        field.tabIndex = -1;
        field.style.cssText = `
      position: absolute;
      left: -9999px;
      top: -9999px;
      opacity: 0;
      pointer-events: none;
      height: 0;
      width: 0;
    `;
        return field;
    },

    // Check if honeypot was filled (bot)
    isTriggered() {
        const field = document.getElementById(SecurityConfig.HONEYPOT_FIELD_NAME);
        if (field && field.value) {
            Security.logSecurityEvent('honeypot_triggered', {});
            return true;
        }
        return false;
    }
};

// ============================================
// INPUT SANITIZATION
// ============================================
const Sanitizer = {
    // Sanitize text input
    text(input) {
        if (typeof input !== 'string') return '';
        return input
            .replace(/[<>]/g, '') // Remove < and >
            .replace(/javascript:/gi, '') // Remove javascript:
            .replace(/on\w+\s*=/gi, '') // Remove event handlers
            .trim()
            .slice(0, 1000); // Limit length
    },

    // Sanitize filename
    filename(input) {
        if (typeof input !== 'string') return 'file';
        return input
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(0, 255);
    },

    // Sanitize URL
    url(input) {
        if (typeof input !== 'string') return '';
        try {
            const url = new URL(input);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                return '';
            }
            return url.href;
        } catch {
            return '';
        }
    },

    // Sanitize HTML (remove all tags)
    html(input) {
        if (typeof input !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }
};

// ============================================
// FILE VALIDATION
// ============================================
const FileValidator = {
    // Validate file
    validate(file) {
        const errors = [];

        // Check if file exists
        if (!file) {
            errors.push({ code: 'no_file', message: 'No file selected' });
            return { valid: false, errors };
        }

        // Check file size
        if (file.size > SecurityConfig.MAX_FILE_SIZE) {
            errors.push({
                code: 'file_too_large',
                message: `File too large. Maximum size is ${Math.round(SecurityConfig.MAX_FILE_SIZE / 1024 / 1024)}MB`
            });
        }

        // Check file type
        if (file.type && !SecurityConfig.ALLOWED_FILE_TYPES.includes(file.type)) {
            // Also check by extension for files without MIME type
            const ext = file.name.split('.').pop().toLowerCase();
            const allowedExts = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
            if (!allowedExts.includes(ext)) {
                errors.push({
                    code: 'invalid_type',
                    message: 'File type not allowed'
                });
            }
        }

        // Check for suspicious filename
        if (/\.(exe|bat|cmd|sh|php|js|html)$/i.test(file.name)) {
            errors.push({
                code: 'suspicious_filename',
                message: 'Suspicious file extension detected'
            });
            Security.logSecurityEvent('suspicious_file', { filename: file.name });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    // Validate multiple files
    validateMultiple(files) {
        const results = [];
        for (const file of files) {
            results.push({
                file: file.name,
                ...this.validate(file)
            });
        }
        return results;
    }
};

// ============================================
// SIMPLE CAPTCHA
// ============================================
const SimpleCaptcha = {
    currentAnswer: null,

    // Generate math captcha
    generate() {
        const a = Math.floor(Math.random() * 10) + 1;
        const b = Math.floor(Math.random() * 10) + 1;
        const operators = ['+', '-'];
        const op = operators[Math.floor(Math.random() * operators.length)];

        let answer;
        if (op === '+') {
            answer = a + b;
        } else {
            answer = a - b;
        }

        this.currentAnswer = answer;

        return {
            question: `What is ${a} ${op} ${b}?`,
            answer
        };
    },

    // Verify answer
    verify(userAnswer) {
        const correct = parseInt(userAnswer) === this.currentAnswer;
        if (!correct) {
            Security.logSecurityEvent('captcha_failed', {});
        }
        return correct;
    },

    // Show captcha modal
    showModal(onSuccess, onCancel) {
        const captcha = this.generate();

        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.id = 'captchaModal';
        modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>🤖 Quick Verification</h3>
        </div>
        <div class="modal-body text-center">
          <p class="mb-4">Please solve this simple math problem to continue:</p>
          <p class="text-xl font-bold mb-4">${captcha.question}</p>
          <input type="number" id="captchaInput" class="input" style="width: 100px; text-align: center; font-size: 1.5rem;" autofocus>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="captchaCancel">Cancel</button>
          <button class="btn btn-primary" id="captchaSubmit">Verify</button>
        </div>
      </div>
    `;
        document.body.appendChild(modal);

        // Handle submit
        const submit = () => {
            const answer = document.getElementById('captchaInput').value;
            if (this.verify(answer)) {
                modal.remove();
                onSuccess?.();
            } else {
                const input = document.getElementById('captchaInput');
                input.classList.add('error');
                input.value = '';
                input.placeholder = 'Try again';
                // Generate new captcha
                const newCaptcha = this.generate();
                modal.querySelector('.text-xl').textContent = newCaptcha.question;
            }
        };

        document.getElementById('captchaSubmit').addEventListener('click', submit);
        document.getElementById('captchaInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submit();
        });
        document.getElementById('captchaCancel').addEventListener('click', () => {
            modal.remove();
            onCancel?.();
        });
    }
};

// ============================================
// MAIN SECURITY OBJECT
// ============================================
const Security = {
    initialized: false,
    securityLog: [],

    // Initialize all security features
    init() {
        if (this.initialized) return;

        BotDetector.init();
        this.addHoneypotFields();
        this.setupCSPReporting();

        this.initialized = true;
        console.log('Security system initialized');
    },

    // Add honeypot fields to forms
    addHoneypotFields() {
        document.querySelectorAll('form').forEach(form => {
            if (!form.querySelector(`#${SecurityConfig.HONEYPOT_FIELD_NAME}`)) {
                form.appendChild(Honeypot.createField());
            }
        });
    },

    // Setup CSP-like violation reporting
    setupCSPReporting() {
        // Monitor for script errors that might indicate XSS
        window.addEventListener('error', (e) => {
            if (e.filename && !e.filename.includes(window.location.origin)) {
                this.logSecurityEvent('external_script_error', {
                    filename: e.filename,
                    message: e.message
                });
            }
        });
    },

    // Check if action should proceed
    checkAction(actionType) {
        // Check rate limit
        const rateCheck = RateLimiter.checkLimit();
        if (!rateCheck.allowed) {
            return rateCheck;
        }

        // Check honeypot
        if (Honeypot.isTriggered()) {
            return {
                allowed: false,
                reason: 'bot_detected',
                retryAfter: 300
            };
        }

        // Check bot score for sensitive actions
        const sensitiveActions = ['bulk_process', 'export_all', 'delete_all'];
        if (sensitiveActions.includes(actionType) && !BotDetector.isHuman()) {
            return {
                allowed: false,
                reason: 'verification_required',
                requiresCaptcha: true
            };
        }

        return { allowed: true };
    },

    // Perform action with security checks
    performAction(actionType, callback) {
        const check = this.checkAction(actionType);

        if (!check.allowed) {
            if (check.requiresCaptcha) {
                SimpleCaptcha.showModal(callback);
                return;
            }

            this.showSecurityError(check.reason, check.retryAfter);
            return;
        }

        callback();
    },

    // Show security error
    showSecurityError(reason, retryAfter) {
        const messages = {
            blocked: `Too many requests. Please wait ${retryAfter} seconds.`,
            rate_limited: `Slow down! Please wait ${retryAfter} seconds before trying again.`,
            bot_detected: 'Suspicious activity detected. Please try again later.',
            verification_required: 'Please complete verification to continue.'
        };

        PDFTools?.showToast?.('error', 'Security Alert', messages[reason] || 'Action blocked.');
    },

    // Log security event
    logSecurityEvent(type, details) {
        const event = {
            type,
            details,
            timestamp: new Date().toISOString(),
            page: window.location.pathname
        };

        this.securityLog.push(event);

        // Keep only last 100 events
        if (this.securityLog.length > 100) {
            this.securityLog.shift();
        }

        // Store in session
        try {
            sessionStorage.setItem('security_log', JSON.stringify(this.securityLog));
        } catch { }

        console.warn('Security event:', event);
    },

    // Get security log
    getSecurityLog() {
        return this.securityLog;
    },

    // Validate and sanitize file upload
    validateFile(file) {
        return FileValidator.validate(file);
    },

    // Sanitize input
    sanitize: Sanitizer,

    // Get security status
    getStatus() {
        return {
            rateLimit: RateLimiter.getStatus(),
            botScore: BotDetector.score,
            botConfidence: BotDetector.getConfidence(),
            isHuman: BotDetector.isHuman(),
            securityEvents: this.securityLog.length
        };
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Security.init());
} else {
    Security.init();
}

// Export
window.Security = Security;
window.RateLimiter = RateLimiter;
window.BotDetector = BotDetector;
window.Sanitizer = Sanitizer;
window.FileValidator = FileValidator;
window.SimpleCaptcha = SimpleCaptcha;
