/* ============================================
   PDF Tools - Viewer JavaScript
   Advanced PDF reading with study tools
   ============================================ */

// Set PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ============================================
// VIEWER STATE
// ============================================
const ViewerState = {
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1,
    viewMode: 'single', // single, continuous, double, book, horizontal, sidebyside
    readingMode: 'normal', // normal, night, sepia, dark, focus

    // Bookmarks & Notes
    bookmarks: [],
    notes: [],

    // Reading Progress
    startTime: null,
    readingSeconds: 0,
    timerInterval: null,
    pagesRead: new Set(),

    // Recent Files
    recentFiles: [],

    // Tools
    rulerActive: false,
    magnifierActive: false,
    lineHelperActive: false,
    autoScrollActive: false,
    autoScrollSpeed: 50,

    // Search
    searchMatches: [],
    currentMatch: 0
};

// ============================================
// DOM ELEMENTS
// ============================================
const ViewerDOM = {
    fileInput: document.getElementById('fileInput'),
    emptyState: document.getElementById('emptyState'),
    pdfContainer: document.getElementById('pdfContainer'),
    pdfPages: document.getElementById('pdfPages'),
    fileName: document.getElementById('fileName'),
    pageInput: document.getElementById('pageInput'),
    totalPages: document.getElementById('totalPages'),
    zoomSelect: document.getElementById('zoomSelect'),
    thumbnailsGrid: document.getElementById('thumbnailsGrid'),
    bookmarksList: document.getElementById('bookmarksList'),
    notesList: document.getElementById('notesList'),
    sidebar: document.getElementById('sidebar'),
    viewerMain: document.getElementById('viewerMain'),
    searchBar: document.getElementById('searchBar'),
    searchInput: document.getElementById('searchInput'),
    readingProgressBar: document.getElementById('readingProgressBar'),
    readingTime: document.getElementById('readingTime'),
    progressPercent: document.getElementById('progressPercent'),
    timerOverlay: document.getElementById('timerOverlay'),
    timerDisplay: document.getElementById('timerDisplay'),
    rulerOverlay: document.getElementById('rulerOverlay'),
    magnifier: document.getElementById('magnifier'),
    lineHelper: document.getElementById('lineHelper'),
    minimap: document.getElementById('minimap'),
    recentList: document.getElementById('recentList')
};

// ============================================
// INITIALIZATION
// ============================================
function initViewer() {
    loadFromStorage();
    renderRecentFiles();

    // File input
    document.querySelector('.dropzone')?.addEventListener('click', () => ViewerDOM.fileInput.click());
    ViewerDOM.fileInput?.addEventListener('change', handleFileSelect);

    // Drag & drop
    ViewerDOM.viewerMain?.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    });
    ViewerDOM.viewerMain?.addEventListener('dragleave', (e) => {
        e.currentTarget.classList.remove('dragover');
    });
    ViewerDOM.viewerMain?.addEventListener('drop', (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        if (e.dataTransfer.files[0]) loadPDF(e.dataTransfer.files[0]);
    });

    // Navigation
    document.getElementById('prevPage')?.addEventListener('click', () => goToPage(ViewerState.currentPage - 1));
    document.getElementById('nextPage')?.addEventListener('click', () => goToPage(ViewerState.currentPage + 1));
    ViewerDOM.pageInput?.addEventListener('change', (e) => goToPage(parseInt(e.target.value)));

    // Zoom
    document.getElementById('zoomIn')?.addEventListener('click', () => setZoom(ViewerState.scale + 0.25));
    document.getElementById('zoomOut')?.addEventListener('click', () => setZoom(ViewerState.scale - 0.25));
    ViewerDOM.zoomSelect?.addEventListener('change', handleZoomChange);

    // Sidebar toggle
    document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);

    // Sidebar tabs
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', () => switchSidebarTab(tab.dataset.tab));
    });

    // View modes
    document.querySelectorAll('#viewModeMenu .dropdown-item').forEach(item => {
        item.addEventListener('click', () => setViewMode(item.dataset.mode));
    });

    // Reading modes
    document.querySelectorAll('#readingModeMenu .dropdown-item').forEach(item => {
        item.addEventListener('click', () => setReadingMode(item.dataset.reading));
    });

    // Tools
    document.getElementById('rulerTool')?.addEventListener('click', toggleRuler);
    document.getElementById('magnifierTool')?.addEventListener('click', toggleMagnifier);
    document.getElementById('lineHelper')?.addEventListener('click', toggleLineHelper);
    document.getElementById('autoScroll')?.addEventListener('click', toggleAutoScroll);
    document.getElementById('timerTool')?.addEventListener('click', toggleTimer);
    document.getElementById('wordCount')?.addEventListener('click', showWordCount);
    document.getElementById('extractText')?.addEventListener('click', extractText);
    document.getElementById('extractMetadata')?.addEventListener('click', showMetadata);

    // Bookmarks
    document.getElementById('bookmarkBtn')?.addEventListener('click', addBookmark);

    // Notes
    document.getElementById('addNoteBtn')?.addEventListener('click', openNoteModal);
    document.getElementById('saveNoteBtn')?.addEventListener('click', saveNote);

    // Search
    document.getElementById('searchToggle')?.addEventListener('click', toggleSearch);
    document.getElementById('searchClose')?.addEventListener('click', () => ViewerDOM.searchBar.classList.add('hidden'));
    ViewerDOM.searchInput?.addEventListener('input', debounce(performSearch, 300));
    document.getElementById('searchPrev')?.addEventListener('click', () => navigateSearch(-1));
    document.getElementById('searchNext')?.addEventListener('click', () => navigateSearch(1));

    // Fullscreen
    document.getElementById('fullscreenBtn')?.addEventListener('click', toggleFullscreen);

    // Timer controls
    document.getElementById('timerPause')?.addEventListener('click', toggleTimerPause);
    document.getElementById('timerStop')?.addEventListener('click', stopTimer);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Scroll tracking for reading progress
    ViewerDOM.viewerMain?.addEventListener('scroll', debounce(updateReadingProgress, 100));

    // Magnifier follow
    document.addEventListener('mousemove', handleMagnifier);

    // Line helper follow
    document.addEventListener('mousemove', handleLineHelper);

    console.log('PDF Viewer initialized');
}

// ============================================
// PDF LOADING
// ============================================
function handleFileSelect(e) {
    if (e.target.files[0]) {
        loadPDF(e.target.files[0]);
    }
}

async function loadPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        ViewerState.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        ViewerState.totalPages = ViewerState.pdfDoc.numPages;
        ViewerState.currentPage = 1;
        ViewerState.pagesRead.clear();

        // Update UI
        ViewerDOM.fileName.textContent = file.name;
        ViewerDOM.totalPages.textContent = ViewerState.totalPages;
        ViewerDOM.pageInput.max = ViewerState.totalPages;
        ViewerDOM.emptyState.classList.add('hidden');
        ViewerDOM.pdfContainer.classList.remove('hidden');

        // Add to recent files
        addToRecentFiles(file.name);

        // Render pages
        await renderPages();

        // Generate thumbnails
        generateThumbnails();

        // Start reading timer
        startReadingTimer();

        // Load saved bookmarks/notes for this file
        loadFileData(file.name);

        PDFTools?.showToast?.('success', 'PDF Loaded', `${ViewerState.totalPages} pages`);
    } catch (error) {
        console.error('Error loading PDF:', error);
        PDFTools?.showToast?.('error', 'Error', 'Failed to load PDF');
    }
}

// ============================================
// RENDERING
// ============================================
async function renderPages() {
    ViewerDOM.pdfPages.innerHTML = '';
    ViewerDOM.pdfPages.className = 'pdf-pages ' + ViewerState.viewMode;

    const pagesToRender = ViewerState.viewMode === 'single' ?
        [ViewerState.currentPage] :
        Array.from({ length: ViewerState.totalPages }, (_, i) => i + 1);

    for (const pageNum of pagesToRender) {
        await renderPage(pageNum);
    }

    if (ViewerState.viewMode !== 'single') {
        scrollToPage(ViewerState.currentPage);
    }
}

async function renderPage(pageNum) {
    const page = await ViewerState.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: ViewerState.scale * 1.5 });

    const pageDiv = document.createElement('div');
    pageDiv.className = 'pdf-page';
    pageDiv.dataset.page = pageNum;

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;

    pageDiv.appendChild(canvas);
    ViewerDOM.pdfPages.appendChild(pageDiv);

    // Add to pages read
    ViewerState.pagesRead.add(pageNum);
}

async function generateThumbnails() {
    ViewerDOM.thumbnailsGrid.innerHTML = '';

    for (let i = 1; i <= ViewerState.totalPages; i++) {
        const page = await ViewerState.pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });

        const item = document.createElement('div');
        item.className = 'thumbnail-item' + (i === ViewerState.currentPage ? ' active' : '');
        item.dataset.page = i;

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        const label = document.createElement('span');
        label.textContent = `Page ${i}`;

        item.appendChild(canvas);
        item.appendChild(label);
        item.addEventListener('click', () => goToPage(i));

        ViewerDOM.thumbnailsGrid.appendChild(item);
    }
}

// ============================================
// NAVIGATION
// ============================================
function goToPage(pageNum) {
    if (pageNum < 1 || pageNum > ViewerState.totalPages) return;

    ViewerState.currentPage = pageNum;
    ViewerDOM.pageInput.value = pageNum;

    // Update thumbnail selection
    document.querySelectorAll('.thumbnail-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.dataset.page) === pageNum);
    });

    if (ViewerState.viewMode === 'single') {
        renderPages();
    } else {
        scrollToPage(pageNum);
    }

    updateReadingProgress();
}

function scrollToPage(pageNum) {
    const pageEl = document.querySelector(`.pdf-page[data-page="${pageNum}"]`);
    pageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// ZOOM
// ============================================
function setZoom(scale) {
    ViewerState.scale = Math.max(0.25, Math.min(3, scale));
    ViewerDOM.zoomSelect.value = ViewerState.scale;
    renderPages();
}

function handleZoomChange(e) {
    const value = e.target.value;
    if (value === 'fit-width' || value === 'fit-page') {
        const container = ViewerDOM.viewerMain;
        const page = ViewerState.pdfDoc?.getPage?.(1);
        if (page) {
            page.then(p => {
                const viewport = p.getViewport({ scale: 1 });
                if (value === 'fit-width') {
                    ViewerState.scale = (container.clientWidth - 40) / viewport.width;
                } else {
                    ViewerState.scale = Math.min(
                        (container.clientWidth - 40) / viewport.width,
                        (container.clientHeight - 40) / viewport.height
                    );
                }
                renderPages();
            });
        }
    } else {
        setZoom(parseFloat(value));
    }
}

// ============================================
// VIEW MODES
// ============================================
function setViewMode(mode) {
    ViewerState.viewMode = mode;

    document.querySelectorAll('#viewModeMenu .dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.mode === mode);
    });

    renderPages();
}

// ============================================
// READING MODES
// ============================================
function setReadingMode(mode) {
    ViewerState.readingMode = mode;
    document.body.dataset.reading = mode;

    document.querySelectorAll('#readingModeMenu .dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.reading === mode);
    });
}

// ============================================
// SIDEBAR
// ============================================
function toggleSidebar() {
    ViewerDOM.sidebar.classList.toggle('collapsed');
    document.getElementById('sidebarToggle').classList.toggle('active');
}

function switchSidebarTab(tab) {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.toggle('active', p.id === tab + 'Panel'));
}

// ============================================
// BOOKMARKS
// ============================================
function addBookmark() {
    const pageNum = ViewerState.currentPage;

    if (ViewerState.bookmarks.some(b => b.page === pageNum)) {
        PDFTools?.showToast?.('info', 'Exists', 'Page already bookmarked');
        return;
    }

    ViewerState.bookmarks.push({
        id: Date.now(),
        page: pageNum,
        title: `Page ${pageNum}`,
        date: new Date().toISOString()
    });

    renderBookmarks();
    saveToStorage();
    PDFTools?.showToast?.('success', 'Bookmarked', `Page ${pageNum} bookmarked`);
}

function removeBookmark(id) {
    ViewerState.bookmarks = ViewerState.bookmarks.filter(b => b.id !== id);
    renderBookmarks();
    saveToStorage();
}

function renderBookmarks() {
    if (ViewerState.bookmarks.length === 0) {
        ViewerDOM.bookmarksList.innerHTML = '<p class="empty-message">No bookmarks yet</p>';
        return;
    }

    ViewerDOM.bookmarksList.innerHTML = ViewerState.bookmarks.map(b => `
    <div class="bookmark-item" onclick="goToPage(${b.page})">
      <span>${b.title}</span>
      <span class="page">Page ${b.page}</span>
      <span class="delete-btn" onclick="event.stopPropagation(); removeBookmark(${b.id})">✕</span>
    </div>
  `).join('');
}

// ============================================
// NOTES
// ============================================
function openNoteModal() {
    document.getElementById('notePageNum').textContent = ViewerState.currentPage;
    document.getElementById('noteText').value = '';
    document.getElementById('noteModal').classList.remove('hidden');
}

function saveNote() {
    const text = document.getElementById('noteText').value.trim();
    if (!text) return;

    ViewerState.notes.push({
        id: Date.now(),
        page: ViewerState.currentPage,
        text,
        date: new Date().toISOString()
    });

    renderNotes();
    saveToStorage();
    closeModal('noteModal');
    PDFTools?.showToast?.('success', 'Saved', 'Note added');
}

function removeNote(id) {
    ViewerState.notes = ViewerState.notes.filter(n => n.id !== id);
    renderNotes();
    saveToStorage();
}

function renderNotes() {
    if (ViewerState.notes.length === 0) {
        ViewerDOM.notesList.innerHTML = '<p class="empty-message">No notes yet</p>';
        return;
    }

    ViewerDOM.notesList.innerHTML = ViewerState.notes.map(n => `
    <div class="note-item" onclick="goToPage(${n.page})">
      <div class="note-header">
        <span>Page ${n.page}</span>
        <span onclick="event.stopPropagation(); removeNote(${n.id})" style="cursor:pointer">✕</span>
      </div>
      <p>${n.text}</p>
    </div>
  `).join('');
}

// ============================================
// READING TIMER
// ============================================
function startReadingTimer() {
    ViewerState.startTime = Date.now();
    ViewerState.readingSeconds = 0;
    updateTimerDisplay();

    if (ViewerState.timerInterval) clearInterval(ViewerState.timerInterval);
    ViewerState.timerInterval = setInterval(() => {
        ViewerState.readingSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const hours = Math.floor(ViewerState.readingSeconds / 3600);
    const mins = Math.floor((ViewerState.readingSeconds % 3600) / 60);
    const secs = ViewerState.readingSeconds % 60;

    const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    ViewerDOM.timerDisplay.textContent = timeStr;
    ViewerDOM.readingTime.textContent = `${mins}m reading`;
}

function toggleTimer() {
    ViewerDOM.timerOverlay.classList.toggle('hidden');
}

function toggleTimerPause() {
    const btn = document.getElementById('timerPause');
    if (ViewerState.timerInterval) {
        clearInterval(ViewerState.timerInterval);
        ViewerState.timerInterval = null;
        btn.textContent = '▶';
    } else {
        ViewerState.timerInterval = setInterval(() => {
            ViewerState.readingSeconds++;
            updateTimerDisplay();
        }, 1000);
        btn.textContent = '⏸';
    }
}

function stopTimer() {
    clearInterval(ViewerState.timerInterval);
    ViewerState.timerInterval = null;
    ViewerState.readingSeconds = 0;
    updateTimerDisplay();
    ViewerDOM.timerOverlay.classList.add('hidden');
}

// ============================================
// READING PROGRESS
// ============================================
function updateReadingProgress() {
    const progress = (ViewerState.pagesRead.size / ViewerState.totalPages) * 100;
    ViewerDOM.readingProgressBar.style.width = progress + '%';
    ViewerDOM.progressPercent.textContent = Math.round(progress) + '%';
}

// ============================================
// READING TOOLS
// ============================================
function toggleRuler() {
    ViewerState.rulerActive = !ViewerState.rulerActive;
    ViewerDOM.rulerOverlay.classList.toggle('hidden', !ViewerState.rulerActive);
    document.getElementById('rulerTool').classList.toggle('active', ViewerState.rulerActive);
}

function toggleMagnifier() {
    ViewerState.magnifierActive = !ViewerState.magnifierActive;
    ViewerDOM.magnifier.classList.toggle('hidden', !ViewerState.magnifierActive);
    document.getElementById('magnifierTool').classList.toggle('active', ViewerState.magnifierActive);
}

function handleMagnifier(e) {
    if (!ViewerState.magnifierActive) return;

    ViewerDOM.magnifier.style.left = (e.clientX - 75) + 'px';
    ViewerDOM.magnifier.style.top = (e.clientY - 75) + 'px';

    // Get canvas content at mouse position and magnify
    const pageCanvas = document.querySelector('.pdf-page canvas');
    if (pageCanvas) {
        const magnifierCanvas = document.getElementById('magnifierCanvas');
        const ctx = magnifierCanvas.getContext('2d');
        const rect = pageCanvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (pageCanvas.width / rect.width);
        const y = (e.clientY - rect.top) * (pageCanvas.height / rect.height);

        magnifierCanvas.width = 150;
        magnifierCanvas.height = 150;
        ctx.drawImage(pageCanvas, x - 37, y - 37, 75, 75, 0, 0, 150, 150);
    }
}

function toggleLineHelper() {
    ViewerState.lineHelperActive = !ViewerState.lineHelperActive;
    ViewerDOM.lineHelper.classList.toggle('hidden', !ViewerState.lineHelperActive);
    document.getElementById('lineHelper').classList.toggle('active', ViewerState.lineHelperActive);
}

function handleLineHelper(e) {
    if (!ViewerState.lineHelperActive) return;
    ViewerDOM.lineHelper.style.top = (e.clientY - 15) + 'px';
}

function toggleAutoScroll() {
    ViewerState.autoScrollActive = !ViewerState.autoScrollActive;
    document.getElementById('autoScroll').classList.toggle('active', ViewerState.autoScrollActive);

    if (ViewerState.autoScrollActive) {
        startAutoScroll();
    }
}

function startAutoScroll() {
    if (!ViewerState.autoScrollActive) return;

    ViewerDOM.viewerMain.scrollBy(0, 1);
    requestAnimationFrame(() => {
        setTimeout(startAutoScroll, 100 - ViewerState.autoScrollSpeed);
    });
}

// ============================================
// TEXT & METADATA EXTRACTION
// ============================================
async function showWordCount() {
    if (!ViewerState.pdfDoc) return;

    let totalWords = 0;
    let totalChars = 0;

    for (let i = 1; i <= ViewerState.totalPages; i++) {
        const page = await ViewerState.pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        totalWords += text.split(/\s+/).filter(w => w).length;
        totalChars += text.length;
    }

    PDFTools?.showToast?.('info', 'Word Count', `${totalWords.toLocaleString()} words, ${totalChars.toLocaleString()} characters`);
}

async function extractText() {
    if (!ViewerState.pdfDoc) return;

    let fullText = '';

    for (let i = 1; i <= ViewerState.totalPages; i++) {
        const page = await ViewerState.pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        fullText += `--- Page ${i} ---\n`;
        fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
    }

    // Download as text file
    const blob = new Blob([fullText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted_text.txt';
    a.click();

    PDFTools?.showToast?.('success', 'Extracted', 'Text file downloaded');
}

async function showMetadata() {
    if (!ViewerState.pdfDoc) return;

    const metadata = await ViewerState.pdfDoc.getMetadata();
    const info = metadata.info || {};

    const content = `
    <table style="width: 100%; font-size: var(--text-sm);">
      <tr><td><strong>Title:</strong></td><td>${info.Title || 'N/A'}</td></tr>
      <tr><td><strong>Author:</strong></td><td>${info.Author || 'N/A'}</td></tr>
      <tr><td><strong>Subject:</strong></td><td>${info.Subject || 'N/A'}</td></tr>
      <tr><td><strong>Creator:</strong></td><td>${info.Creator || 'N/A'}</td></tr>
      <tr><td><strong>Producer:</strong></td><td>${info.Producer || 'N/A'}</td></tr>
      <tr><td><strong>Created:</strong></td><td>${info.CreationDate || 'N/A'}</td></tr>
      <tr><td><strong>Modified:</strong></td><td>${info.ModDate || 'N/A'}</td></tr>
      <tr><td><strong>Pages:</strong></td><td>${ViewerState.totalPages}</td></tr>
      <tr><td><strong>PDF Version:</strong></td><td>${metadata.contentDispositionFilename || 'Unknown'}</td></tr>
    </table>
  `;

    document.getElementById('metadataContent').innerHTML = content;
    document.getElementById('metadataModal').classList.remove('hidden');
}

// ============================================
// SEARCH
// ============================================
function toggleSearch() {
    ViewerDOM.searchBar.classList.toggle('hidden');
    if (!ViewerDOM.searchBar.classList.contains('hidden')) {
        ViewerDOM.searchInput.focus();
    }
}

async function performSearch() {
    const query = ViewerDOM.searchInput.value.toLowerCase();
    if (!query || !ViewerState.pdfDoc) {
        document.getElementById('searchResults').textContent = '0 of 0';
        return;
    }

    ViewerState.searchMatches = [];

    for (let i = 1; i <= ViewerState.totalPages; i++) {
        const page = await ViewerState.pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ').toLowerCase();

        if (text.includes(query)) {
            ViewerState.searchMatches.push(i);
        }
    }

    ViewerState.currentMatch = 0;
    updateSearchResults();

    if (ViewerState.searchMatches.length > 0) {
        goToPage(ViewerState.searchMatches[0]);
    }
}

function navigateSearch(direction) {
    if (ViewerState.searchMatches.length === 0) return;

    ViewerState.currentMatch += direction;
    if (ViewerState.currentMatch < 0) ViewerState.currentMatch = ViewerState.searchMatches.length - 1;
    if (ViewerState.currentMatch >= ViewerState.searchMatches.length) ViewerState.currentMatch = 0;

    updateSearchResults();
    goToPage(ViewerState.searchMatches[ViewerState.currentMatch]);
}

function updateSearchResults() {
    const total = ViewerState.searchMatches.length;
    const current = total > 0 ? ViewerState.currentMatch + 1 : 0;
    document.getElementById('searchResults').textContent = `${current} of ${total}`;
}

// ============================================
// FULLSCREEN
// ============================================
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// ============================================
// STORAGE
// ============================================
function saveToStorage() {
    localStorage.setItem('pdfViewer_bookmarks', JSON.stringify(ViewerState.bookmarks));
    localStorage.setItem('pdfViewer_notes', JSON.stringify(ViewerState.notes));
    localStorage.setItem('pdfViewer_recent', JSON.stringify(ViewerState.recentFiles));
}

function loadFromStorage() {
    try {
        ViewerState.bookmarks = JSON.parse(localStorage.getItem('pdfViewer_bookmarks')) || [];
        ViewerState.notes = JSON.parse(localStorage.getItem('pdfViewer_notes')) || [];
        ViewerState.recentFiles = JSON.parse(localStorage.getItem('pdfViewer_recent')) || [];
    } catch (e) {
        console.error('Error loading storage:', e);
    }
}

function loadFileData(fileName) {
    // In a real app, would load file-specific bookmarks/notes
    renderBookmarks();
    renderNotes();
}

function addToRecentFiles(fileName) {
    ViewerState.recentFiles = ViewerState.recentFiles.filter(f => f !== fileName);
    ViewerState.recentFiles.unshift(fileName);
    ViewerState.recentFiles = ViewerState.recentFiles.slice(0, 10);
    saveToStorage();
    renderRecentFiles();
}

function renderRecentFiles() {
    if (ViewerState.recentFiles.length === 0) {
        ViewerDOM.recentList.innerHTML = '<p class="empty-message">No recent files</p>';
        return;
    }

    ViewerDOM.recentList.innerHTML = ViewerState.recentFiles.map(file => `
    <div class="recent-item">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>${file}</span>
    </div>
  `).join('');
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
function handleKeyboard(e) {
    // Skip if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
            e.preventDefault();
            goToPage(ViewerState.currentPage - 1);
            break;
        case 'ArrowRight':
        case 'ArrowDown':
            e.preventDefault();
            goToPage(ViewerState.currentPage + 1);
            break;
        case 'Home':
            e.preventDefault();
            goToPage(1);
            break;
        case 'End':
            e.preventDefault();
            goToPage(ViewerState.totalPages);
            break;
        case '+':
        case '=':
            e.preventDefault();
            setZoom(ViewerState.scale + 0.25);
            break;
        case '-':
            e.preventDefault();
            setZoom(ViewerState.scale - 0.25);
            break;
        case 'f':
            if (e.ctrlKey) {
                e.preventDefault();
                toggleSearch();
            }
            break;
        case 'b':
            if (e.ctrlKey) {
                e.preventDefault();
                addBookmark();
            }
            break;
        case 'F11':
            e.preventDefault();
            toggleFullscreen();
            break;
        case 'Escape':
            closeAllModals();
            break;
    }
}

// ============================================
// UTILITIES
// ============================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
    ViewerDOM.searchBar.classList.add('hidden');
}

// Make functions globally available
window.goToPage = goToPage;
window.removeBookmark = removeBookmark;
window.removeNote = removeNote;
window.closeModal = closeModal;

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initViewer);
} else {
    initViewer();
}
