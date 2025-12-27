/**
 * PDF Tools Admin Dashboard - Backend Connected
 * Updated JavaScript to connect with backend API
 */

// ============================================
// API CONFIGURATION
// ============================================
const API_BASE = 'http://localhost:3001/api';

// ============================================
// ADMIN STATE
// ============================================
const AdminState = {
    isLoggedIn: false,
    token: null,
    chart: null
};

// ============================================
// API HELPER
// ============================================
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Add auth token if available
    if (AdminState.token) {
        headers['Authorization'] = `Bearer ${AdminState.token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'API request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ============================================
// LOGIN HANDLING
// ============================================
async function handleLogin(event) {
    event.preventDefault();

    const password = document.getElementById('adminPassword').value;

    try {
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ password })
        });

        if (result.success) {
            AdminState.isLoggedIn = true;
            AdminState.token = result.token;

            // Store token
            localStorage.setItem('pdftools_admin_token', result.token);

            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');

            initDashboard();
        }
    } catch (error) {
        showLoginError(error.message);
    }

    return false;
}

function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    errorEl.innerHTML = `
    <div class="error-message" style="margin-top: var(--space-4);">
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${message}</span>
    </div>
  `;
    errorEl.classList.remove('hidden');
}

async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout error:', error);
    }

    AdminState.isLoggedIn = false;
    AdminState.token = null;
    localStorage.removeItem('pdftools_admin_token');

    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('adminPassword').value = '';
}

// ============================================
// DASHBOARD INITIALIZATION
// ============================================
function initDashboard() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    refreshDashboard();

    // Auto-refresh every 30 seconds
    setInterval(refreshDashboard, 30000);
}

function updateCurrentTime() {
    document.getElementById('currentTime').textContent = new Date().toLocaleString();
}

async function refreshDashboard() {
    if (!AdminState.isLoggedIn) return;

    try {
        // Fetch analytics
        const analyticsResult = await apiRequest('/analytics');
        const stats = analyticsResult.analytics;

        // Update stat cards
        document.getElementById('todayPageViews').textContent = formatNumber(stats.today?.pageViews || 0);
        document.getElementById('todayToolUses').textContent = formatNumber(stats.today?.toolUses || 0);
        document.getElementById('totalVisitors').textContent = formatNumber(stats.total?.uniqueVisitors || 0);
        document.getElementById('filesProcessed').textContent = formatNumber(stats.last7Days?.files || 0);

        // Update trends
        updateTrends(stats);

        // Update top tools
        renderTopTools(stats.topTools || []);

        // Update chart
        renderChart(stats.dailyStats || {});

        // Update page views list
        renderPageViews(stats.today?.pages || {});

        // Update daily stats table
        renderDailyStatsTable(stats.dailyStats || {});

        // Fetch security status
        const securityResult = await apiRequest('/security/status');
        updateSecurityStatus(securityResult.security);

    } catch (error) {
        console.error('Dashboard refresh error:', error);
        if (error.message.includes('token') || error.message.includes('Unauthorized')) {
            logout();
        }
    }
}

function updateTrends(stats) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const todayStats = stats.dailyStats?.[today] || { pageViews: 0, toolUses: 0 };
    const yesterdayStats = stats.dailyStats?.[yesterday] || { pageViews: 1, toolUses: 1 };

    const pageViewsChange = Math.round(((todayStats.pageViews - yesterdayStats.pageViews) / Math.max(yesterdayStats.pageViews, 1)) * 100);
    const toolUsesChange = Math.round(((todayStats.toolUses - yesterdayStats.toolUses) / Math.max(yesterdayStats.toolUses, 1)) * 100);

    updateTrendElement('pageViewsTrend', pageViewsChange);
    updateTrendElement('toolUsesTrend', toolUsesChange);
}

function updateTrendElement(id, change) {
    const el = document.getElementById(id);
    if (!el) return;

    const prefix = change >= 0 ? '+' : '';
    el.textContent = `${prefix}${change}%`;
    el.className = `stat-trend ${change >= 0 ? 'up' : 'down'}`;
}

function renderTopTools(topTools) {
    const container = document.getElementById('topToolsList');
    if (!container) return;

    if (!topTools || topTools.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">No tool usage data yet</p>';
        return;
    }

    const rankClasses = ['gold', 'silver', 'bronze', '', ''];

    container.innerHTML = topTools.map((item, i) => `
    <div class="top-tool-item">
      <span class="top-tool-rank ${rankClasses[i] || ''}">${i + 1}</span>
      <span class="top-tool-name">${formatToolName(item.tool)}</span>
      <span class="top-tool-count">${formatNumber(item.count)} uses</span>
    </div>
  `).join('');
}

function renderChart(dailyStats) {
    const canvas = document.getElementById('trafficChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chartType = document.getElementById('chartType')?.value || 'pageViews';

    const labels = [];
    const data = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const key = date.toISOString().split('T')[0];

        labels.push(date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }));
        data.push(dailyStats[key]?.[chartType] || 0);
    }

    drawBarChart(ctx, canvas, labels, data, chartType);
}

function drawBarChart(ctx, canvas, labels, data, type) {
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(...data, 1);
    const barWidth = chartWidth / labels.length * 0.6;
    const barGap = chartWidth / labels.length * 0.4;

    ctx.clearRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = '#6b7280';
        ctx.font = '11px Inter';
        ctx.textAlign = 'right';
        const value = Math.round(maxValue - (maxValue / 5) * i);
        ctx.fillText(value.toString(), padding.left - 8, y + 4);
    }

    // Draw bars
    const gradient = ctx.createLinearGradient(0, chartHeight, 0, 0);
    gradient.addColorStop(0, type === 'pageViews' ? '#60a5fa' : '#34d399');
    gradient.addColorStop(1, type === 'pageViews' ? '#3b82f6' : '#10b981');

    data.forEach((value, i) => {
        const barHeight = (value / maxValue) * chartHeight;
        const x = padding.left + (chartWidth / labels.length) * i + barGap / 2;
        const y = padding.top + chartHeight - barHeight;

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
        ctx.fill();

        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barWidth / 2, height - 10);
    });
}

function updateChart() {
    refreshDashboard();
}

function renderPageViews(pages) {
    const container = document.getElementById('pageViewsList');
    if (!container) return;

    const entries = Object.entries(pages || {}).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">No page views today</p>';
        return;
    }

    container.innerHTML = entries.map(([page, count]) => `
    <div class="activity-item">
      <span class="activity-page">${page || '/'}</span>
      <span class="activity-count">${count}</span>
    </div>
  `).join('');
}

function updateSecurityStatus(security) {
    document.getElementById('rateLimitStatus').textContent = security.status === 'secure' ? '✅ Active' : '⚠️ Warning';
    document.getElementById('requestsCount').textContent = security.recentRequests || 0;
    document.getElementById('botScore').textContent = security.blockedIPs || 0;
    document.getElementById('securityEvents').textContent = security.suspiciousRequests || 0;

    const badge = document.getElementById('securityStatus');
    if (security.status === 'warning') {
        badge.textContent = '⚠️ Threats Detected';
        badge.className = 'security-badge warning';
    } else {
        badge.textContent = '✅ Secure';
        badge.className = 'security-badge';
    }

    // Show blocked IPs
    const logContainer = document.getElementById('securityLog');
    if (logContainer && security.blockedIPList?.length > 0) {
        logContainer.innerHTML = security.blockedIPList.map(ip => `
      <div class="security-log-item">
        <span class="security-log-type">Blocked:</span>
        <span>${ip}</span>
      </div>
    `).join('');
    } else if (logContainer) {
        logContainer.innerHTML = '<p class="text-muted">No blocked IPs</p>';
    }
}

function renderDailyStatsTable(dailyStats) {
    const tbody = document.getElementById('dailyStatsTable');
    if (!tbody) return;

    const dates = Object.keys(dailyStats || {}).sort().reverse().slice(0, 14);

    if (dates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = dates.map(date => {
        const stats = dailyStats[date];
        return `
      <tr>
        <td>${formatDate(date)}</td>
        <td>${formatNumber(stats.pageViews || 0)}</td>
        <td>${formatNumber(stats.toolUses || 0)}</td>
        <td>${formatNumber(stats.filesProcessed || 0)}</td>
        <td>${formatNumber(stats.uniqueVisitors || 0)}</td>
        <td>${stats.errors || 0}</td>
      </tr>
    `;
    }).join('');
}

// ============================================
// DATA MANAGEMENT
// ============================================
async function exportAllData() {
    try {
        const result = await apiRequest('/analytics/export');
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('success', 'Export Complete', 'Analytics data downloaded');
    } catch (error) {
        showToast('error', 'Export Failed', error.message);
    }
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            await apiRequest('/analytics/import', {
                method: 'POST',
                body: JSON.stringify({ data })
            });
            showToast('success', 'Import Complete', 'Data restored successfully');
            refreshDashboard();
        } catch (error) {
            showToast('error', 'Import Failed', error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function confirmClearData() {
    document.getElementById('clearModal').classList.remove('hidden');
}

async function clearAllData() {
    const confirm = document.getElementById('deleteConfirm').value;
    if (confirm !== 'DELETE') {
        showToast('error', 'Confirmation Failed', 'Please type DELETE to confirm');
        return;
    }

    try {
        await apiRequest('/analytics', { method: 'DELETE' });
        closeModal('clearModal');
        refreshDashboard();
        showToast('success', 'Data Cleared', 'All analytics data has been deleted');
    } catch (error) {
        showToast('error', 'Clear Failed', error.message);
    }
}

function showChangePassword() {
    document.getElementById('passwordModal').classList.remove('hidden');
}

async function changePassword() {
    const current = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (newPass !== confirm) {
        showToast('error', 'Error', 'Passwords do not match');
        return;
    }

    try {
        await apiRequest('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({
                currentPassword: current,
                newPassword: newPass
            })
        });
        closeModal('passwordModal');
        showToast('success', 'Password Changed', 'Your admin password has been updated');

        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
    } catch (error) {
        showToast('error', 'Change Failed', error.message);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

function formatToolName(id) {
    const names = {
        'merge': 'Merge PDF',
        'split': 'Split PDF',
        'compress': 'Compress PDF',
        'pdf-to-word': 'PDF to Word',
        'pdf-to-image': 'PDF to Image',
        'image-to-pdf': 'Image to PDF',
        'rotate': 'Rotate Pages',
        'watermark': 'Add Watermark',
        'protect': 'Add Password',
        'unlock': 'Remove Password'
    };
    return names[id] || id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
    <div class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Check for stored token
    const storedToken = localStorage.getItem('pdftools_admin_token');

    if (storedToken) {
        AdminState.token = storedToken;

        try {
            // Verify token is still valid
            await apiRequest('/auth/verify');
            AdminState.isLoggedIn = true;
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            initDashboard();
        } catch (error) {
            // Token invalid, clear it
            localStorage.removeItem('pdftools_admin_token');
            AdminState.token = null;
        }
    }
});
