/* ============================================
   PDF Tools - UX Enhancements JavaScript
   User journeys, tooltips, guides, trust
   ============================================ */

// ============================================
// ONBOARDING / FIRST-TIME USER GUIDE
// ============================================
const OnboardingGuide = {
    steps: [
        {
            icon: '📄',
            title: 'Welcome to PDF Tools!',
            description: 'Free, private, and powerful PDF tools that work right in your browser. No uploads, no signups, no limits.',
            action: 'Get Started'
        },
        {
            icon: '⬆️',
            title: 'Step 1: Upload',
            description: 'Simply drag and drop your files, or click to browse. We support PDF, images, Word, Excel, and more.',
            action: 'Next'
        },
        {
            icon: '⚡',
            title: 'Step 2: Process',
            description: 'Choose your options and click the action button. Processing happens instantly on your device.',
            action: 'Next'
        },
        {
            icon: '⬇️',
            title: 'Step 3: Download',
            description: 'Your processed file is ready! Download it instantly or try another tool.',
            action: 'Start Using PDF Tools'
        }
    ],

    currentStep: 0,

    shouldShow() {
        return !localStorage.getItem('pdftools_onboarded');
    },

    show() {
        if (!this.shouldShow()) return;

        const overlay = document.createElement('div');
        overlay.className = 'guide-overlay';
        overlay.id = 'onboardingGuide';
        overlay.innerHTML = this.renderStep(0);
        document.body.appendChild(overlay);

        this.bindEvents();
    },

    renderStep(stepIndex) {
        const step = this.steps[stepIndex];
        const dots = this.steps.map((_, i) =>
            `<div class="guide-dot ${i === stepIndex ? 'active' : ''}"></div>`
        ).join('');

        return `
      <div class="guide-modal">
        <div class="guide-step-indicator">${dots}</div>
        <div class="guide-icon">${step.icon}</div>
        <h2 class="guide-title">${step.title}</h2>
        <p class="guide-description">${step.description}</p>
        <div class="guide-actions">
          ${stepIndex > 0 ? '<button class="btn btn-ghost" id="guidePrev">Back</button>' : ''}
          <button class="btn btn-primary" id="guideNext">${step.action}</button>
          ${stepIndex === 0 ? '<button class="btn btn-ghost" id="guideSkip">Skip Tour</button>' : ''}
        </div>
      </div>
    `;
    },

    bindEvents() {
        document.getElementById('onboardingGuide')?.addEventListener('click', (e) => {
            if (e.target.id === 'guideNext') {
                this.currentStep++;
                if (this.currentStep >= this.steps.length) {
                    this.complete();
                } else {
                    this.update();
                }
            } else if (e.target.id === 'guidePrev') {
                this.currentStep--;
                this.update();
            } else if (e.target.id === 'guideSkip') {
                this.complete();
            }
        });
    },

    update() {
        const modal = document.querySelector('.guide-modal');
        if (modal) {
            modal.outerHTML = this.renderStep(this.currentStep);
        }
    },

    complete() {
        localStorage.setItem('pdftools_onboarded', 'true');
        document.getElementById('onboardingGuide')?.remove();
        PDFTools?.showToast?.('success', 'Welcome!', 'Start by uploading a file 🎉');
    },

    reset() {
        localStorage.removeItem('pdftools_onboarded');
    }
};

// ============================================
// STEP FLOW INDICATOR
// ============================================
const StepFlow = {
    steps: ['Upload', 'Process', 'Download'],
    currentStep: 0,

    render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
      <div class="step-flow">
        ${this.steps.map((step, i) => `
          <div class="step-item ${i === this.currentStep ? 'active' : ''} ${i < this.currentStep ? 'completed' : ''}" data-step="${i}">
            <span class="step-icon">${i < this.currentStep ? '✓' : i + 1}</span>
            <span>${step}</span>
          </div>
          ${i < this.steps.length - 1 ? `<div class="step-connector ${i < this.currentStep ? 'active' : ''}"></div>` : ''}
        `).join('')}
      </div>
    `;
    },

    setStep(step) {
        this.currentStep = step;
        this.render('stepFlowContainer');
    },

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.render('stepFlowContainer');
        }
    }
};

// ============================================
// SUCCESS SCREEN
// ============================================
const SuccessScreen = {
    show(options = {}) {
        const {
            title = 'Success!',
            message = 'Your file is ready to download.',
            fileName = 'output.pdf',
            fileSize = '0 KB',
            originalSize = null,
            onDownload = null,
            onTryAnother = null
        } = options;

        const container = document.getElementById('resultArea') || document.createElement('div');

        const savings = originalSize ?
            `<div class="success-stat">
        <div class="success-stat-value">${Math.round((1 - fileSize / originalSize) * 100)}%</div>
        <div class="success-stat-label">Size Reduced</div>
      </div>` : '';

        container.innerHTML = `
      <div class="success-screen">
        <div class="success-icon">✓</div>
        <h2 class="success-title">${title}</h2>
        <p class="success-message">${message}</p>
        
        <div class="success-stats">
          <div class="success-stat">
            <div class="success-stat-value">${fileName}</div>
            <div class="success-stat-label">File Name</div>
          </div>
          <div class="success-stat">
            <div class="success-stat-value">${typeof fileSize === 'number' ? formatFileSize(fileSize) : fileSize}</div>
            <div class="success-stat-label">File Size</div>
          </div>
          ${savings}
        </div>
        
        <div class="success-actions">
          <button class="btn btn-primary btn-lg" id="successDownload">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Now
          </button>
          <button class="btn btn-secondary" id="successTryAnother">Try Another File</button>
          <p class="text-xs text-muted mt-2">Your file will be available for 30 minutes</p>
        </div>
      </div>
    `;

        container.classList.remove('hidden');

        document.getElementById('successDownload')?.addEventListener('click', onDownload);
        document.getElementById('successTryAnother')?.addEventListener('click', onTryAnother);
    }
};

// ============================================
// FRIENDLY ERROR MESSAGES
// ============================================
const ErrorMessages = {
    messages: {
        'file-too-large': {
            title: 'Oops! File too large',
            description: 'The file you selected is larger than 100MB.',
            suggestion: '💡 Try compressing the file first, or split it into smaller parts.'
        },
        'invalid-format': {
            title: 'Wrong file format',
            description: 'This tool only accepts PDF files.',
            suggestion: '💡 Make sure your file ends with .pdf, or try our Image to PDF converter.'
        },
        'processing-failed': {
            title: 'Something went wrong',
            description: 'We couldn\'t process your file this time.',
            suggestion: '💡 Try refreshing the page and uploading again. If the problem persists, the file might be corrupted.'
        },
        'encrypted-pdf': {
            title: 'This PDF is protected',
            description: 'The file is password-protected and we can\'t open it.',
            suggestion: '💡 Use our Unlock PDF tool first if you know the password.'
        },
        'no-file': {
            title: 'No file selected',
            description: 'Please upload a file to continue.',
            suggestion: '💡 Drag and drop a file onto the upload area, or click to browse.'
        }
    },

    show(type, container = 'errorContainer') {
        const error = this.messages[type] || this.messages['processing-failed'];
        const el = document.getElementById(container);

        if (el) {
            el.innerHTML = `
        <div class="error-message">
          <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div class="error-content">
            <h4>${error.title}</h4>
            <p>${error.description}</p>
            <div class="error-suggestion">${error.suggestion}</div>
          </div>
        </div>
      `;
            el.classList.remove('hidden');
        }

        return error;
    },

    hide(container = 'errorContainer') {
        const el = document.getElementById(container);
        if (el) {
            el.innerHTML = '';
            el.classList.add('hidden');
        }
    }
};

// ============================================
// TOOLTIPS
// ============================================
const Tooltips = {
    init() {
        document.querySelectorAll('[data-tooltip]').forEach(el => {
            const text = el.getAttribute('data-tooltip');
            const span = document.createElement('span');
            span.className = 'tooltip-text';
            span.textContent = text;
            el.classList.add('tooltip');
            el.appendChild(span);
        });
    }
};

// ============================================
// TRUST BADGES
// ============================================
const TrustBadges = {
    badges: [
        { icon: '🔒', text: 'SSL Secure' },
        { icon: '🛡️', text: 'Privacy First' },
        { icon: '💯', text: '100% Free' },
        { icon: '🚫', text: 'No Signup' },
        { icon: '⚡', text: 'Instant Processing' }
    ],

    render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
      <div class="trust-badges">
        ${this.badges.map(badge => `
          <div class="trust-badge">
            <span class="trust-badge-icon">${badge.icon}</span>
            <span>${badge.text}</span>
          </div>
        `).join('')}
      </div>
    `;
    }
};

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
const KeyboardShortcuts = {
    shortcuts: {
        'Ctrl+O': 'Open file',
        'Ctrl+S': 'Save/Download',
        'Ctrl+Z': 'Undo',
        'Ctrl+Y': 'Redo',
        'Escape': 'Close modal'
    },

    showHint() {
        const hint = document.createElement('div');
        hint.className = 'shortcuts-hint';
        hint.innerHTML = `Press <kbd class="kbd">?</kbd> for keyboard shortcuts`;
        document.body.appendChild(hint);

        // Remove after 5 seconds
        setTimeout(() => hint.remove(), 5000);
    },

    showModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.id = 'shortcutsModal';
        modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="modal-close" onclick="document.getElementById('shortcutsModal').remove()">✕</button>
        </div>
        <div class="modal-body">
          <table style="width: 100%;">
            ${Object.entries(this.shortcuts).map(([key, action]) => `
              <tr>
                <td><kbd class="kbd">${key}</kbd></td>
                <td>${action}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;
        document.body.appendChild(modal);
    },

    init() {
        document.addEventListener('keydown', (e) => {
            if (e.key === '?' && !e.ctrlKey && !e.altKey) {
                this.showModal();
            }
        });
    }
};

// ============================================
// ACCESSIBILITY HELPERS
// ============================================
const A11y = {
    init() {
        // Add skip link
        const skipLink = document.createElement('a');
        skipLink.className = 'skip-link';
        skipLink.href = '#main';
        skipLink.textContent = 'Skip to main content';
        document.body.insertBefore(skipLink, document.body.firstChild);

        // Announce dynamic content changes
        this.createLiveRegion();
    },

    createLiveRegion() {
        const region = document.createElement('div');
        region.id = 'a11y-announce';
        region.className = 'sr-only';
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
    },

    announce(message) {
        const region = document.getElementById('a11y-announce');
        if (region) {
            region.textContent = message;
        }
    }
};

// ============================================
// CONTEXTUAL HELP
// ============================================
const ContextualHelp = {
    tips: {
        'merge': 'Tip: Drag files to reorder them before merging.',
        'split': 'Tip: Use page ranges like "1-3, 5, 7-10" to extract specific pages.',
        'compress': 'Tip: Higher compression = smaller file, but slightly lower quality.',
        'protect': 'Tip: Use a strong password with letters, numbers, and symbols.',
        'pdf-to-image': 'Tip: Higher DPI means better quality but larger file sizes.'
    },

    show(toolId, containerId) {
        const tip = this.tips[toolId];
        if (!tip) return;

        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
        <div class="help-text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>${tip}</span>
        </div>
      `;
        }
    }
};

// ============================================
// RECENT SETTINGS MEMORY
// ============================================
const SettingsMemory = {
    save(toolId, settings) {
        const saved = this.getAll();
        saved[toolId] = settings;
        localStorage.setItem('pdftools_settings', JSON.stringify(saved));
    },

    get(toolId) {
        const saved = this.getAll();
        return saved[toolId] || null;
    },

    getAll() {
        try {
            return JSON.parse(localStorage.getItem('pdftools_settings')) || {};
        } catch {
            return {};
        }
    },

    apply(toolId) {
        const settings = this.get(toolId);
        if (!settings) return;

        Object.entries(settings).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') {
                    el.checked = value;
                } else {
                    el.value = value;
                }
            }
        });
    }
};

// ============================================
// FILE VALIDATION
// ============================================
const FileValidator = {
    maxSize: 100 * 1024 * 1024, // 100MB

    allowedTypes: {
        pdf: ['application/pdf'],
        image: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp'],
        document: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    },

    validate(file, acceptedTypes = ['pdf']) {
        const errors = [];

        // Check size
        if (file.size > this.maxSize) {
            errors.push('file-too-large');
        }

        // Check type
        const allowedMimes = acceptedTypes.flatMap(t => this.allowedTypes[t] || []);
        if (allowedMimes.length && !allowedMimes.includes(file.type)) {
            errors.push('invalid-format');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
};

// ============================================
// INITIALIZE ALL UX FEATURES
// ============================================
function initUXFeatures() {
    // Show onboarding for first-time users
    if (OnboardingGuide.shouldShow()) {
        setTimeout(() => OnboardingGuide.show(), 500);
    }

    // Initialize tooltips
    Tooltips.init();

    // Initialize keyboard shortcuts
    KeyboardShortcuts.init();

    // Initialize accessibility features
    A11y.init();

    // Render trust badges if container exists
    TrustBadges.render('trustBadges');

    // Apply saved settings for current tool
    const urlParams = new URLSearchParams(window.location.search);
    const toolId = urlParams.get('tool');
    if (toolId) {
        SettingsMemory.apply(toolId);
        ContextualHelp.show(toolId, 'helpContainer');
    }

    console.log('UX features initialized');
}

// Utility function
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Export for global use
window.OnboardingGuide = OnboardingGuide;
window.StepFlow = StepFlow;
window.SuccessScreen = SuccessScreen;
window.ErrorMessages = ErrorMessages;
window.TrustBadges = TrustBadges;
window.KeyboardShortcuts = KeyboardShortcuts;
window.A11y = A11y;
window.ContextualHelp = ContextualHelp;
window.SettingsMemory = SettingsMemory;
window.FileValidator = FileValidator;

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUXFeatures);
} else {
    initUXFeatures();
}
