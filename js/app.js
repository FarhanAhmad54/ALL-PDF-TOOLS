/* ============================================
   PDF Tools - Main Application JavaScript
   ============================================ */

// App State
const AppState = {
  theme: localStorage.getItem('theme') || 'light',
  language: localStorage.getItem('language') || 'en',
  files: [],
  currentTool: null,
  undoStack: [],
  redoStack: []
};

// DOM Elements
const DOM = {
  header: document.getElementById('header'),
  themeToggle: document.getElementById('themeToggle'),
  navToggle: document.getElementById('navToggle'),
  mobileNav: document.getElementById('mobileNav'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  toastContainer: document.getElementById('toastContainer')
};

// ============================================
// THEME MANAGEMENT
// ============================================
function initTheme() {
  // Check for system preference
  if (!localStorage.getItem('theme')) {
    AppState.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(AppState.theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  AppState.theme = theme;
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const newTheme = AppState.theme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
}

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
  // Header scroll effect
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 50) {
      DOM.header?.classList.add('scrolled');
    } else {
      DOM.header?.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  });

  // Mobile navigation toggle
  DOM.navToggle?.addEventListener('click', () => {
    DOM.navToggle.classList.toggle('active');
    DOM.mobileNav?.classList.toggle('active');
  });

  // Close mobile nav on link click
  document.querySelectorAll('.mobile-nav .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      DOM.navToggle?.classList.remove('active');
      DOM.mobileNav?.classList.remove('active');
    });
  });
}

// ============================================
// FILE HANDLING
// ============================================
function initDropzone() {
  if (!DOM.dropzone) return;

  // Click to select
  DOM.dropzone.addEventListener('click', () => {
    DOM.fileInput?.click();
  });

  // File input change
  DOM.fileInput?.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  // Drag and drop
  DOM.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.dropzone.classList.add('dragover');
  });

  DOM.dropzone.addEventListener('dragleave', () => {
    DOM.dropzone.classList.remove('dragover');
  });

  DOM.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.dropzone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
}

function handleFiles(fileList) {
  const files = Array.from(fileList);
  
  files.forEach(file => {
    // Validate file
    if (!isValidFile(file)) {
      showToast('error', 'Invalid File', `${file.name} is not a supported file type.`);
      return;
    }

    // Check file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      showToast('error', 'File Too Large', `${file.name} exceeds the 100MB limit.`);
      return;
    }

    AppState.files.push({
      id: generateId(),
      file: file,
      name: file.name,
      size: file.size,
      type: file.type,
      addedAt: new Date()
    });
  });

  if (AppState.files.length > 0) {
    showToast('success', 'Files Added', `${files.length} file(s) ready for processing.`);
    // Redirect to appropriate tool or show file list
    updateFileList();
  }
}

function isValidFile(file) {
  const validTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/html',
    'text/markdown'
  ];

  const validExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.html', '.md', '.epub'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();

  return validTypes.includes(file.type) || validExtensions.includes(ext);
}

function updateFileList() {
  const fileListContainer = document.getElementById('fileList');
  if (!fileListContainer) return;

  if (AppState.files.length === 0) {
    fileListContainer.innerHTML = '<p class="text-center text-muted">No files added yet</p>';
    return;
  }

  fileListContainer.innerHTML = AppState.files.map(f => `
    <div class="file-item" data-id="${f.id}">
      <div class="file-icon">
        ${getFileIcon(f.type)}
      </div>
      <div class="file-info">
        <div class="file-name">${f.name}</div>
        <div class="file-meta">
          <span>${formatFileSize(f.size)}</span>
          <span>${getFileTypeLabel(f.type)}</span>
        </div>
      </div>
      <div class="file-actions">
        <button class="file-action" onclick="removeFile('${f.id}')" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function removeFile(id) {
  AppState.files = AppState.files.filter(f => f.id !== id);
  updateFileList();
  showToast('info', 'File Removed', 'File has been removed from the list.');
}

function clearAllFiles() {
  AppState.files = [];
  updateFileList();
  if (DOM.fileInput) DOM.fileInput.value = '';
  showToast('info', 'All Files Cleared', 'All files have been removed.');
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(type, title, message, duration = 5000) {
  if (!DOM.toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
  };

  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${icons[type]}
    </svg>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  DOM.toastContainer.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Add slideOutRight animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOutRight {
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
`;
document.head.appendChild(style);

// ============================================
// UTILITY FUNCTIONS
// ============================================
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileTypeLabel(mimeType) {
  const types = {
    'application/pdf': 'PDF',
    'image/png': 'PNG Image',
    'image/jpeg': 'JPEG Image',
    'image/jpg': 'JPG Image',
    'image/gif': 'GIF Image',
    'image/webp': 'WebP Image',
    'application/msword': 'Word Document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
    'application/vnd.ms-excel': 'Excel Spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
    'application/vnd.ms-powerpoint': 'PowerPoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
    'text/plain': 'Text File',
    'text/html': 'HTML File',
    'text/markdown': 'Markdown File'
  };
  return types[mimeType] || 'File';
}

function getFileIcon(mimeType) {
  if (mimeType === 'application/pdf') {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }
  if (mimeType.startsWith('image/')) {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  }
  return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + O: Open file
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      DOM.fileInput?.click();
    }

    // Ctrl/Cmd + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }

    // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }

    // Ctrl/Cmd + S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentWork();
    }

    // Escape: Close modals
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

function undo() {
  if (AppState.undoStack.length === 0) return;
  const action = AppState.undoStack.pop();
  AppState.redoStack.push(action);
  // Apply undo logic based on action type
  showToast('info', 'Undo', 'Action undone.');
}

function redo() {
  if (AppState.redoStack.length === 0) return;
  const action = AppState.redoStack.pop();
  AppState.undoStack.push(action);
  // Apply redo logic based on action type
  showToast('info', 'Redo', 'Action redone.');
}

function saveCurrentWork() {
  showToast('success', 'Saved', 'Your work has been saved.');
}

// ============================================
// MODAL MANAGEMENT
// ============================================
function openModal(modalId) {
  const backdrop = document.querySelector('.modal-backdrop');
  const modal = document.getElementById(modalId);
  
  if (backdrop) backdrop.classList.add('active');
  if (modal) modal.classList.add('active');
  
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const backdrop = document.querySelector('.modal-backdrop');
  const modal = document.getElementById(modalId);
  
  if (backdrop) backdrop.classList.remove('active');
  if (modal) modal.classList.remove('active');
  
  document.body.style.overflow = '';
}

function closeAllModals() {
  document.querySelectorAll('.modal.active').forEach(modal => {
    modal.classList.remove('active');
  });
  document.querySelectorAll('.modal-backdrop.active').forEach(backdrop => {
    backdrop.classList.remove('active');
  });
  document.body.style.overflow = '';
}

// ============================================
// PROGRESS BAR
// ============================================
function showProgress(containerId, progress) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let progressBar = container.querySelector('.progress-bar');
  if (!progressBar) {
    container.innerHTML = `
      <div class="progress">
        <div class="progress-bar" style="width: ${progress}%"></div>
      </div>
    `;
    progressBar = container.querySelector('.progress-bar');
  }
  
  progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

function hideProgress(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = '';
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
  initTheme();
  initNavigation();
  initDropzone();
  initKeyboardShortcuts();

  // Theme toggle click handler
  DOM.themeToggle?.addEventListener('click', toggleTheme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  console.log('PDF Tools initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for use in other modules
window.PDFTools = {
  AppState,
  showToast,
  showProgress,
  hideProgress,
  openModal,
  closeModal,
  handleFiles,
  clearAllFiles,
  formatFileSize,
  generateId
};
