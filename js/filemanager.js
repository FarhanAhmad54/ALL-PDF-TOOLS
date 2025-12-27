/* ============================================
   PDF Tools - File Manager JavaScript
   Document organizing, tags, and file handling
   ============================================ */

// ============================================
// FILE MANAGER STATE
// ============================================
const FMState = {
    files: [],
    folders: [],
    tags: ['work', 'personal', 'important', 'archive'],
    selectedFiles: [],
    currentFilter: 'all',
    currentFolder: null,
    currentTag: null,
    viewMode: 'grid',
    sortBy: 'date-desc',
    searchQuery: ''
};

// ============================================
// DOM ELEMENTS
// ============================================
const FMDOM = {
    fileInput: document.getElementById('fileInput'),
    filesContainer: document.getElementById('filesContainer'),
    emptyState: document.getElementById('emptyState'),
    selectionBar: document.getElementById('selectionBar'),
    selectedCount: document.getElementById('selectedCount'),
    searchInput: document.getElementById('searchInput'),
    sortSelect: document.getElementById('sortSelect'),
    foldersList: document.getElementById('foldersList'),
    detailsPanel: document.getElementById('detailsPanel'),
    breadcrumb: document.getElementById('breadcrumb')
};

// ============================================
// INITIALIZATION
// ============================================
function initFileManager() {
    loadFromStorage();

    // File upload
    document.getElementById('uploadBtn')?.addEventListener('click', () => FMDOM.fileInput.click());
    FMDOM.fileInput?.addEventListener('change', handleFileUpload);

    // Navigation
    document.querySelectorAll('.fm-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            setFilter(item.dataset.filter);
        });
    });

    // Tags
    document.querySelectorAll('.fm-tag').forEach(tag => {
        tag.addEventListener('click', () => filterByTag(tag.dataset.tag));
    });

    // View toggle
    document.querySelectorAll('.fm-view-btn').forEach(btn => {
        btn.addEventListener('click', () => setViewMode(btn.dataset.view));
    });

    // Sort
    FMDOM.sortSelect?.addEventListener('change', (e) => {
        FMState.sortBy = e.target.value;
        renderFiles();
    });

    // Search
    FMDOM.searchInput?.addEventListener('input', debounce((e) => {
        FMState.searchQuery = e.target.value.toLowerCase();
        renderFiles();
    }, 300));

    // Folders
    document.getElementById('addFolderBtn')?.addEventListener('click', openFolderModal);
    document.getElementById('createFolderBtn')?.addEventListener('click', createFolder);

    // Selection actions
    document.getElementById('downloadSelected')?.addEventListener('click', downloadSelected);
    document.getElementById('deleteSelected')?.addEventListener('click', deleteSelected);

    // Details panel
    document.getElementById('closeDetails')?.addEventListener('click', closeDetails);
    document.getElementById('openInViewer')?.addEventListener('click', openInViewer);
    document.getElementById('openInEditor')?.addEventListener('click', openInEditor);
    document.getElementById('downloadFile')?.addEventListener('click', downloadCurrentFile);

    // Drag and drop
    FMDOM.filesContainer?.addEventListener('dragover', handleDragOver);
    FMDOM.filesContainer?.addEventListener('drop', handleDrop);

    renderFiles();
    renderFolders();
    updateCounts();

    console.log('File Manager initialized');
}

// ============================================
// FILE HANDLING
// ============================================
async function handleFileUpload(e) {
    const files = Array.from(e.target.files);

    for (const file of files) {
        if (file.type !== 'application/pdf') continue;

        const fileData = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            type: file.type,
            dateAdded: new Date().toISOString(),
            dateModified: new Date().toISOString(),
            folder: FMState.currentFolder,
            tags: [],
            starred: false,
            deleted: false,
            // Store file data as base64 for persistence
            data: await fileToBase64(file)
        };

        // Get page count
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            fileData.pages = pdf.numPages;
        } catch (e) {
            fileData.pages = 0;
        }

        FMState.files.push(fileData);
    }

    saveToStorage();
    renderFiles();
    updateCounts();

    PDFTools?.showToast?.('success', 'Uploaded', `${files.length} file(s) added`);
    e.target.value = '';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    FMDOM.fileInput.files = e.dataTransfer.files;
    handleFileUpload({ target: { files }, value: '' });
}

// ============================================
// FILTERING & SORTING
// ============================================
function setFilter(filter) {
    FMState.currentFilter = filter;
    FMState.currentFolder = null;
    FMState.currentTag = null;

    document.querySelectorAll('.fm-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.filter === filter);
    });

    document.querySelectorAll('.fm-folder-item').forEach(item => {
        item.classList.remove('active');
    });

    updateBreadcrumb();
    renderFiles();
}

function setFolder(folderId) {
    FMState.currentFilter = null;
    FMState.currentFolder = folderId;
    FMState.currentTag = null;

    document.querySelectorAll('.fm-nav-item').forEach(item => {
        item.classList.remove('active');
    });

    document.querySelectorAll('.fm-folder-item').forEach(item => {
        item.classList.toggle('active', item.dataset.folder === folderId);
    });

    updateBreadcrumb();
    renderFiles();
}

function filterByTag(tag) {
    if (FMState.currentTag === tag) {
        FMState.currentTag = null;
    } else {
        FMState.currentTag = tag;
    }

    document.querySelectorAll('.fm-tag').forEach(t => {
        t.classList.toggle('active', t.dataset.tag === FMState.currentTag);
    });

    renderFiles();
}

function getFilteredFiles() {
    let files = [...FMState.files];

    // Apply filter
    if (FMState.currentFilter === 'recent') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        files = files.filter(f => !f.deleted && new Date(f.dateAdded) >= weekAgo);
    } else if (FMState.currentFilter === 'starred') {
        files = files.filter(f => !f.deleted && f.starred);
    } else if (FMState.currentFilter === 'trash') {
        files = files.filter(f => f.deleted);
    } else if (FMState.currentFilter === 'all') {
        files = files.filter(f => !f.deleted);
    }

    // Apply folder filter
    if (FMState.currentFolder) {
        files = files.filter(f => f.folder === FMState.currentFolder);
    }

    // Apply tag filter
    if (FMState.currentTag) {
        files = files.filter(f => f.tags.includes(FMState.currentTag));
    }

    // Apply search
    if (FMState.searchQuery) {
        files = files.filter(f => f.name.toLowerCase().includes(FMState.searchQuery));
    }

    // Apply sorting
    const [sortField, sortDir] = FMState.sortBy.split('-');
    files.sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') {
            cmp = a.name.localeCompare(b.name);
        } else if (sortField === 'date') {
            cmp = new Date(a.dateAdded) - new Date(b.dateAdded);
        } else if (sortField === 'size') {
            cmp = a.size - b.size;
        }
        return sortDir === 'desc' ? -cmp : cmp;
    });

    return files;
}

// ============================================
// RENDERING
// ============================================
function renderFiles() {
    const files = getFilteredFiles();

    if (files.length === 0) {
        FMDOM.filesContainer.innerHTML = `
      <div class="fm-empty" id="emptyState">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <h3>No files found</h3>
        <p>${FMState.searchQuery ? 'Try a different search term' : 'Upload PDF files to get started'}</p>
      </div>
    `;
        return;
    }

    FMDOM.filesContainer.className = `fm-files fm-${FMState.viewMode}`;

    FMDOM.filesContainer.innerHTML = files.map(file => `
    <div class="fm-file-card ${FMState.selectedFiles.includes(file.id) ? 'selected' : ''}" 
         data-id="${file.id}"
         onclick="handleFileClick(event, '${file.id}')"
         ondblclick="openFile('${file.id}')">
      <input type="checkbox" class="fm-checkbox" 
             ${FMState.selectedFiles.includes(file.id) ? 'checked' : ''}
             onclick="event.stopPropagation(); toggleSelect('${file.id}')">
      <div class="fm-file-preview">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div class="fm-file-info">
        <div class="fm-file-name" title="${file.name}">${file.name}</div>
        <div class="fm-file-meta">
          <span>${formatFileSize(file.size)}</span>
          <span>${file.pages || 0} pages</span>
        </div>
      </div>
      <span class="fm-file-star ${file.starred ? 'active' : ''}" 
            onclick="event.stopPropagation(); toggleStar('${file.id}')"
            title="${file.starred ? 'Remove from starred' : 'Add to starred'}">
        ★
      </span>
    </div>
  `).join('');
}

function renderFolders() {
    FMDOM.foldersList.innerHTML = FMState.folders.map(folder => `
    <div class="fm-folder-item ${FMState.currentFolder === folder.id ? 'active' : ''}" 
         data-folder="${folder.id}"
         onclick="setFolder('${folder.id}')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      ${folder.name}
    </div>
  `).join('');
}

function updateCounts() {
    const allFiles = FMState.files.filter(f => !f.deleted);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    document.getElementById('allCount').textContent = allFiles.length;
    document.getElementById('recentCount').textContent = allFiles.filter(f => new Date(f.dateAdded) >= weekAgo).length;
    document.getElementById('starredCount').textContent = allFiles.filter(f => f.starred).length;
    document.getElementById('trashCount').textContent = FMState.files.filter(f => f.deleted).length;

    // Storage
    const totalSize = FMState.files.reduce((sum, f) => sum + f.size, 0);
    document.getElementById('storageUsed').textContent = formatFileSize(totalSize);
    document.getElementById('storageBar').style.width = Math.min((totalSize / (100 * 1024 * 1024)) * 100, 100) + '%';
}

function updateBreadcrumb() {
    let path = 'All Files';

    if (FMState.currentFilter === 'recent') path = 'Recent';
    else if (FMState.currentFilter === 'starred') path = 'Starred';
    else if (FMState.currentFilter === 'trash') path = 'Trash';
    else if (FMState.currentFolder) {
        const folder = FMState.folders.find(f => f.id === FMState.currentFolder);
        path = `All Files / ${folder?.name || 'Folder'}`;
    }

    FMDOM.breadcrumb.innerHTML = `<span class="fm-breadcrumb-item active">${path}</span>`;
}

// ============================================
// FILE OPERATIONS
// ============================================
function handleFileClick(e, fileId) {
    if (e.ctrlKey || e.metaKey) {
        toggleSelect(fileId);
    } else {
        showDetails(fileId);
    }
}

function toggleSelect(fileId) {
    const idx = FMState.selectedFiles.indexOf(fileId);
    if (idx > -1) {
        FMState.selectedFiles.splice(idx, 1);
    } else {
        FMState.selectedFiles.push(fileId);
    }

    FMDOM.selectionBar.classList.toggle('hidden', FMState.selectedFiles.length === 0);
    FMDOM.selectedCount.textContent = `${FMState.selectedFiles.length} selected`;

    renderFiles();
}

function toggleStar(fileId) {
    const file = FMState.files.find(f => f.id === fileId);
    if (file) {
        file.starred = !file.starred;
        saveToStorage();
        renderFiles();
        updateCounts();
    }
}

function openFile(fileId) {
    const file = FMState.files.find(f => f.id === fileId);
    if (file) {
        // Store in session and redirect to viewer
        sessionStorage.setItem('pdfToView', file.data);
        window.location.href = 'viewer.html';
    }
}

function deleteFile(fileId) {
    const file = FMState.files.find(f => f.id === fileId);
    if (file) {
        if (FMState.currentFilter === 'trash') {
            // Permanent delete
            FMState.files = FMState.files.filter(f => f.id !== fileId);
        } else {
            // Move to trash
            file.deleted = true;
            file.deletedAt = new Date().toISOString();
        }
        saveToStorage();
        renderFiles();
        updateCounts();
        closeDetails();
        PDFTools?.showToast?.('success', 'Deleted', 'File moved to trash');
    }
}

function restoreFile(fileId) {
    const file = FMState.files.find(f => f.id === fileId);
    if (file) {
        file.deleted = false;
        file.deletedAt = null;
        saveToStorage();
        renderFiles();
        updateCounts();
        PDFTools?.showToast?.('success', 'Restored', 'File restored');
    }
}

function renameFile(fileId) {
    const file = FMState.files.find(f => f.id === fileId);
    if (file) {
        FMState.renamingFile = fileId;
        document.getElementById('newFileName').value = file.name.replace('.pdf', '');
        document.getElementById('renameModal').classList.remove('hidden');
    }
}

document.getElementById('confirmRenameBtn')?.addEventListener('click', () => {
    const newName = document.getElementById('newFileName').value.trim();
    if (newName && FMState.renamingFile) {
        const file = FMState.files.find(f => f.id === FMState.renamingFile);
        if (file) {
            file.name = newName.endsWith('.pdf') ? newName : newName + '.pdf';
            file.dateModified = new Date().toISOString();
            saveToStorage();
            renderFiles();
            closeModal('renameModal');
            PDFTools?.showToast?.('success', 'Renamed', 'File renamed');
        }
    }
});

// ============================================
// BULK OPERATIONS
// ============================================
function downloadSelected() {
    FMState.selectedFiles.forEach(id => {
        const file = FMState.files.find(f => f.id === id);
        if (file) {
            downloadFile(file);
        }
    });
    clearSelection();
}

function deleteSelected() {
    FMState.selectedFiles.forEach(id => {
        deleteFile(id);
    });
    clearSelection();
}

function clearSelection() {
    FMState.selectedFiles = [];
    FMDOM.selectionBar.classList.add('hidden');
    renderFiles();
}

// ============================================
// DETAILS PANEL
// ============================================
function showDetails(fileId) {
    const file = FMState.files.find(f => f.id === fileId);
    if (!file) return;

    FMState.currentFile = file;

    document.getElementById('detailsName').textContent = file.name;
    document.getElementById('detailsSize').textContent = formatFileSize(file.size);
    document.getElementById('detailsDate').textContent = new Date(file.dateAdded).toLocaleDateString();
    document.getElementById('detailsPages').textContent = file.pages || 'Unknown';

    // Tags
    document.getElementById('fileTags').innerHTML = file.tags.map(tag => `
    <span class="fm-tag" style="--tag-color: ${getTagColor(tag)};">${tag}</span>
  `).join('') || '<span class="text-muted">No tags</span>';

    FMDOM.detailsPanel.classList.remove('hidden');
}

function closeDetails() {
    FMDOM.detailsPanel.classList.add('hidden');
    FMState.currentFile = null;
}

function openInViewer() {
    if (FMState.currentFile) {
        openFile(FMState.currentFile.id);
    }
}

function openInEditor() {
    if (FMState.currentFile) {
        sessionStorage.setItem('pdfToEdit', FMState.currentFile.data);
        window.location.href = 'editor.html';
    }
}

function downloadCurrentFile() {
    if (FMState.currentFile) {
        downloadFile(FMState.currentFile);
    }
}

function downloadFile(file) {
    const a = document.createElement('a');
    a.href = file.data;
    a.download = file.name;
    a.click();
}

// ============================================
// FOLDERS
// ============================================
function openFolderModal() {
    document.getElementById('folderName').value = '';
    document.getElementById('folderModal').classList.remove('hidden');
}

function createFolder() {
    const name = document.getElementById('folderName').value.trim();
    if (!name) return;

    FMState.folders.push({
        id: Date.now().toString(),
        name,
        dateCreated: new Date().toISOString()
    });

    saveToStorage();
    renderFolders();
    closeModal('folderModal');
    PDFTools?.showToast?.('success', 'Created', 'Folder created');
}

// ============================================
// VIEW MODE
// ============================================
function setViewMode(mode) {
    FMState.viewMode = mode;

    document.querySelectorAll('.fm-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });

    renderFiles();
}

// ============================================
// STORAGE
// ============================================
function saveToStorage() {
    try {
        localStorage.setItem('pdfFiles', JSON.stringify(FMState.files));
        localStorage.setItem('pdfFolders', JSON.stringify(FMState.folders));
    } catch (e) {
        console.error('Storage error:', e);
        PDFTools?.showToast?.('error', 'Storage Full', 'Cannot save more files to local storage');
    }
}

function loadFromStorage() {
    try {
        FMState.files = JSON.parse(localStorage.getItem('pdfFiles')) || [];
        FMState.folders = JSON.parse(localStorage.getItem('pdfFolders')) || [];
    } catch (e) {
        console.error('Error loading storage:', e);
    }
}

// ============================================
// UTILITIES
// ============================================
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getTagColor(tag) {
    const colors = {
        work: '#3b82f6',
        personal: '#10b981',
        important: '#ef4444',
        archive: '#6b7280'
    };
    return colors[tag] || '#6b7280';
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}

// Make functions global
window.handleFileClick = handleFileClick;
window.toggleSelect = toggleSelect;
window.toggleStar = toggleStar;
window.openFile = openFile;
window.setFolder = setFolder;
window.closeModal = closeModal;

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFileManager);
} else {
    initFileManager();
}
