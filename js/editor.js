/* ============================================
   PDF Tools - Editor JavaScript
   Uses Fabric.js for canvas editing, PDF.js for rendering
   ============================================ */

// Set PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Editor State
const EditorState = {
    pdfDoc: null,
    pdfBytes: null,
    currentPage: 1,
    totalPages: 0,
    zoom: 1,
    currentTool: 'select',
    canvas: null,
    undoStack: [],
    redoStack: [],
    isDrawing: false,
    annotations: {}
};

// DOM Elements
const EditorDOM = {
    fileInput: document.getElementById('fileInput'),
    dropzone: document.getElementById('dropzone'),
    emptyState: document.getElementById('emptyState'),
    canvasWrapper: document.getElementById('canvasWrapper'),
    pdfCanvas: document.getElementById('pdfCanvas'),
    fabricCanvas: document.getElementById('fabricCanvas'),
    thumbnails: document.getElementById('thumbnails'),
    fileName: document.getElementById('fileName'),
    saveStatus: document.getElementById('saveStatus'),
    pageInfo: document.getElementById('pageInfo'),
    zoomLevel: document.getElementById('zoomLevel'),
    strokeColor: document.getElementById('strokeColor'),
    fillColor: document.getElementById('fillColor'),
    strokeWidth: document.getElementById('strokeWidth'),
    opacity: document.getElementById('opacity'),
    fontSize: document.getElementById('fontSize')
};

// ============================================
// INITIALIZATION
// ============================================
function initEditor() {
    // Initialize Fabric canvas
    EditorState.canvas = new fabric.Canvas('fabricCanvas', {
        isDrawingMode: false,
        selection: true,
        preserveObjectStacking: true
    });

    // File handling
    EditorDOM.dropzone?.addEventListener('click', () => EditorDOM.fileInput?.click());

    EditorDOM.dropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        EditorDOM.dropzone.classList.add('dragover');
    });

    EditorDOM.dropzone?.addEventListener('dragleave', () => {
        EditorDOM.dropzone.classList.remove('dragover');
    });

    EditorDOM.dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        EditorDOM.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            loadPDF(e.dataTransfer.files[0]);
        }
    });

    EditorDOM.fileInput?.addEventListener('change', (e) => {
        if (e.target.files.length) {
            loadPDF(e.target.files[0]);
        }
    });

    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setTool(btn.dataset.tool);
        });
    });

    // Navigation buttons
    document.getElementById('prevPageBtn')?.addEventListener('click', () => goToPage(EditorState.currentPage - 1));
    document.getElementById('nextPageBtn')?.addEventListener('click', () => goToPage(EditorState.currentPage + 1));

    // Zoom buttons
    document.getElementById('zoomInBtn')?.addEventListener('click', () => setZoom(EditorState.zoom + 0.25));
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => setZoom(EditorState.zoom - 0.25));

    // Undo/Redo
    document.getElementById('undoBtn')?.addEventListener('click', undo);
    document.getElementById('redoBtn')?.addEventListener('click', redo);

    // Download
    document.getElementById('downloadBtn')?.addEventListener('click', downloadPDF);

    // Delete selected
    document.getElementById('deleteBtn')?.addEventListener('click', deleteSelected);

    // Property changes
    EditorDOM.strokeColor?.addEventListener('input', updateSelectedObject);
    EditorDOM.fillColor?.addEventListener('input', updateSelectedObject);
    EditorDOM.strokeWidth?.addEventListener('input', (e) => {
        document.getElementById('strokeWidthValue').textContent = e.target.value + 'px';
        updateSelectedObject();
    });
    EditorDOM.opacity?.addEventListener('input', (e) => {
        document.getElementById('opacityValue').textContent = e.target.value + '%';
        updateSelectedObject();
    });
    EditorDOM.fontSize?.addEventListener('input', updateSelectedObject);

    // Canvas events
    EditorState.canvas.on('object:added', saveState);
    EditorState.canvas.on('object:modified', saveState);
    EditorState.canvas.on('object:removed', saveState);

    EditorState.canvas.on('selection:created', showObjectProperties);
    EditorState.canvas.on('selection:updated', showObjectProperties);
    EditorState.canvas.on('selection:cleared', hideObjectProperties);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    console.log('PDF Editor initialized');
}

// ============================================
// PDF LOADING
// ============================================
async function loadPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        EditorState.pdfBytes = new Uint8Array(arrayBuffer);
        EditorState.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        EditorState.totalPages = EditorState.pdfDoc.numPages;
        EditorState.currentPage = 1;

        // Update UI
        EditorDOM.fileName.textContent = file.name;
        EditorDOM.emptyState.classList.add('hidden');
        EditorDOM.canvasWrapper.classList.remove('hidden');

        // Render first page
        await renderPage(1);

        // Generate thumbnails
        generateThumbnails();

        // Enable navigation
        updateNavigationButtons();

        PDFTools.showToast('success', 'PDF Loaded', `${EditorState.totalPages} page(s)`);
    } catch (error) {
        console.error('Error loading PDF:', error);
        PDFTools.showToast('error', 'Error', 'Failed to load PDF');
    }
}

// ============================================
// PAGE RENDERING
// ============================================
async function renderPage(pageNum) {
    const page = await EditorState.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: EditorState.zoom * 1.5 });

    // Setup PDF canvas
    const pdfCanvas = EditorDOM.pdfCanvas;
    const pdfContext = pdfCanvas.getContext('2d');
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    // Render PDF
    await page.render({
        canvasContext: pdfContext,
        viewport: viewport
    }).promise;

    // Setup Fabric canvas to match
    EditorState.canvas.setWidth(viewport.width);
    EditorState.canvas.setHeight(viewport.height);
    EditorDOM.canvasWrapper.style.width = viewport.width + 'px';
    EditorDOM.canvasWrapper.style.height = viewport.height + 'px';

    // Load annotations for this page
    loadPageAnnotations(pageNum);

    // Update page info
    EditorDOM.pageInfo.textContent = `${pageNum} / ${EditorState.totalPages}`;
    updateNavigationButtons();
}

// ============================================
// THUMBNAILS
// ============================================
async function generateThumbnails() {
    EditorDOM.thumbnails.innerHTML = '';

    for (let i = 1; i <= EditorState.totalPages; i++) {
        const page = await EditorState.pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.15 });

        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'page-thumb' + (i === EditorState.currentPage ? ' active' : '');
        thumbDiv.dataset.page = i;

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        const pageNum = document.createElement('span');
        pageNum.className = 'page-thumb-number';
        pageNum.textContent = i;

        thumbDiv.appendChild(canvas);
        thumbDiv.appendChild(pageNum);
        thumbDiv.addEventListener('click', () => goToPage(i));

        EditorDOM.thumbnails.appendChild(thumbDiv);
    }
}

// ============================================
// NAVIGATION
// ============================================
function goToPage(pageNum) {
    if (pageNum < 1 || pageNum > EditorState.totalPages) return;

    // Save current annotations
    savePageAnnotations(EditorState.currentPage);

    EditorState.currentPage = pageNum;
    renderPage(pageNum);

    // Update thumbnail selection
    document.querySelectorAll('.page-thumb').forEach(thumb => {
        thumb.classList.toggle('active', parseInt(thumb.dataset.page) === pageNum);
    });
}

function updateNavigationButtons() {
    document.getElementById('prevPageBtn').disabled = EditorState.currentPage <= 1;
    document.getElementById('nextPageBtn').disabled = EditorState.currentPage >= EditorState.totalPages;
}

// ============================================
// ZOOM
// ============================================
function setZoom(level) {
    EditorState.zoom = Math.max(0.25, Math.min(3, level));
    EditorDOM.zoomLevel.textContent = Math.round(EditorState.zoom * 100) + '%';
    renderPage(EditorState.currentPage);
}

// ============================================
// TOOLS
// ============================================
function setTool(tool) {
    EditorState.currentTool = tool;

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Configure canvas based on tool
    const canvas = EditorState.canvas;
    canvas.isDrawingMode = false;
    canvas.selection = true;

    switch (tool) {
        case 'select':
            canvas.defaultCursor = 'default';
            break;

        case 'pan':
            canvas.defaultCursor = 'grab';
            canvas.selection = false;
            break;

        case 'text':
            canvas.defaultCursor = 'text';
            canvas.on('mouse:down', addText);
            break;

        case 'draw':
            canvas.isDrawingMode = true;
            canvas.freeDrawingBrush.color = EditorDOM.strokeColor.value;
            canvas.freeDrawingBrush.width = parseInt(EditorDOM.strokeWidth.value);
            break;

        case 'eraser':
            canvas.isDrawingMode = true;
            canvas.freeDrawingBrush.color = 'white';
            canvas.freeDrawingBrush.width = 20;
            break;

        case 'highlight':
            canvas.defaultCursor = 'crosshair';
            setupShapeDrawing('rect', { fill: 'rgba(255, 255, 0, 0.3)', stroke: null });
            break;

        case 'rectangle':
            canvas.defaultCursor = 'crosshair';
            setupShapeDrawing('rect');
            break;

        case 'circle':
            canvas.defaultCursor = 'crosshair';
            setupShapeDrawing('circle');
            break;

        case 'line':
            canvas.defaultCursor = 'crosshair';
            setupShapeDrawing('line');
            break;

        case 'arrow':
            canvas.defaultCursor = 'crosshair';
            setupShapeDrawing('arrow');
            break;

        case 'note':
            canvas.defaultCursor = 'crosshair';
            canvas.on('mouse:down', addStickyNote);
            break;

        case 'image':
            addImage();
            break;

        case 'signature':
            openSignatureDialog();
            break;
    }

    // Show text properties for text tool
    document.getElementById('textProps')?.classList.toggle('hidden', tool !== 'text');
}

// ============================================
// SHAPE DRAWING
// ============================================
let shapeStart = null;
let currentShape = null;

function setupShapeDrawing(type, options = {}) {
    const canvas = EditorState.canvas;

    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');

    canvas.on('mouse:down', (e) => {
        if (EditorState.currentTool === 'select') return;

        shapeStart = canvas.getPointer(e.e);
        const baseOptions = {
            left: shapeStart.x,
            top: shapeStart.y,
            stroke: EditorDOM.strokeColor.value,
            strokeWidth: parseInt(EditorDOM.strokeWidth.value),
            fill: type === 'rect' ? EditorDOM.fillColor.value : null,
            opacity: parseInt(EditorDOM.opacity.value) / 100,
            selectable: false,
            ...options
        };

        switch (type) {
            case 'rect':
                currentShape = new fabric.Rect({ ...baseOptions, width: 0, height: 0 });
                break;
            case 'circle':
                currentShape = new fabric.Ellipse({ ...baseOptions, rx: 0, ry: 0 });
                break;
            case 'line':
            case 'arrow':
                currentShape = new fabric.Line([shapeStart.x, shapeStart.y, shapeStart.x, shapeStart.y], {
                    stroke: EditorDOM.strokeColor.value,
                    strokeWidth: parseInt(EditorDOM.strokeWidth.value),
                    selectable: false
                });
                break;
        }

        if (currentShape) {
            canvas.add(currentShape);
        }
    });

    canvas.on('mouse:move', (e) => {
        if (!shapeStart || !currentShape) return;

        const pointer = canvas.getPointer(e.e);

        switch (type) {
            case 'rect':
                currentShape.set({
                    width: Math.abs(pointer.x - shapeStart.x),
                    height: Math.abs(pointer.y - shapeStart.y),
                    left: Math.min(shapeStart.x, pointer.x),
                    top: Math.min(shapeStart.y, pointer.y)
                });
                break;
            case 'circle':
                currentShape.set({
                    rx: Math.abs(pointer.x - shapeStart.x) / 2,
                    ry: Math.abs(pointer.y - shapeStart.y) / 2,
                    left: Math.min(shapeStart.x, pointer.x),
                    top: Math.min(shapeStart.y, pointer.y)
                });
                break;
            case 'line':
            case 'arrow':
                currentShape.set({ x2: pointer.x, y2: pointer.y });
                break;
        }

        canvas.renderAll();
    });

    canvas.on('mouse:up', () => {
        if (currentShape) {
            currentShape.set({ selectable: true });
            canvas.setActiveObject(currentShape);
        }
        shapeStart = null;
        currentShape = null;
    });
}

// ============================================
// TEXT
// ============================================
function addText(e) {
    if (EditorState.currentTool !== 'text') return;

    const canvas = EditorState.canvas;
    const pointer = canvas.getPointer(e.e);

    const text = new fabric.IText('Type here...', {
        left: pointer.x,
        top: pointer.y,
        fontSize: parseInt(EditorDOM.fontSize.value),
        fill: EditorDOM.strokeColor.value,
        fontFamily: 'Arial'
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();

    // Switch back to select tool
    setTool('select');
    canvas.off('mouse:down', addText);
}

// ============================================
// STICKY NOTE
// ============================================
function addStickyNote(e) {
    if (EditorState.currentTool !== 'note') return;

    const canvas = EditorState.canvas;
    const pointer = canvas.getPointer(e.e);

    const noteWidth = 150;
    const noteHeight = 100;

    const rect = new fabric.Rect({
        width: noteWidth,
        height: noteHeight,
        fill: '#fff59d',
        stroke: '#fbc02d',
        strokeWidth: 1,
        rx: 4,
        ry: 4
    });

    const text = new fabric.IText('Note...', {
        fontSize: 12,
        fill: '#333',
        fontFamily: 'Arial',
        left: 8,
        top: 8,
        width: noteWidth - 16
    });

    const group = new fabric.Group([rect, text], {
        left: pointer.x,
        top: pointer.y
    });

    canvas.add(group);
    canvas.setActiveObject(group);

    setTool('select');
    canvas.off('mouse:down', addStickyNote);
}

// ============================================
// IMAGE
// ============================================
function addImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            fabric.Image.fromURL(event.target.result, (img) => {
                // Scale image to fit
                const maxSize = 300;
                if (img.width > maxSize || img.height > maxSize) {
                    const scale = maxSize / Math.max(img.width, img.height);
                    img.scale(scale);
                }

                img.set({
                    left: 100,
                    top: 100
                });

                EditorState.canvas.add(img);
                EditorState.canvas.setActiveObject(img);
            });
        };
        reader.readAsDataURL(file);
    };
    input.click();

    setTool('select');
}

// ============================================
// SIGNATURE
// ============================================
function openSignatureDialog() {
    // Create a simple signature pad modal
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop active';
    modal.innerHTML = `
    <div class="modal active" style="width: 400px;">
      <div class="modal-header">
        <h3 class="modal-title">Draw Your Signature</h3>
        <button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()" style="padding: 4px;">✕</button>
      </div>
      <div class="modal-body">
        <canvas id="signatureCanvas" width="360" height="150" style="border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: crosshair;"></canvas>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="clearSigBtn">Clear</button>
        <button class="btn btn-primary" id="addSigBtn">Add Signature</button>
      </div>
    </div>
  `;
    document.body.appendChild(modal);

    // Setup signature canvas
    const sigCanvas = document.getElementById('signatureCanvas');
    const sigFabric = new fabric.Canvas('signatureCanvas', {
        isDrawingMode: true
    });
    sigFabric.freeDrawingBrush.color = '#000';
    sigFabric.freeDrawingBrush.width = 2;

    document.getElementById('clearSigBtn').onclick = () => sigFabric.clear();
    document.getElementById('addSigBtn').onclick = () => {
        const dataUrl = sigFabric.toDataURL();
        fabric.Image.fromURL(dataUrl, (img) => {
            img.set({ left: 100, top: 100 });
            EditorState.canvas.add(img);
            EditorState.canvas.setActiveObject(img);
        });
        modal.remove();
    };

    setTool('select');
}

// ============================================
// OBJECT PROPERTIES
// ============================================
function updateSelectedObject() {
    const obj = EditorState.canvas.getActiveObject();
    if (!obj) return;

    obj.set({
        stroke: EditorDOM.strokeColor.value,
        fill: obj.type === 'i-text' || obj.type === 'text' ? null : EditorDOM.fillColor.value,
        strokeWidth: parseInt(EditorDOM.strokeWidth.value),
        opacity: parseInt(EditorDOM.opacity.value) / 100
    });

    if (obj.type === 'i-text' || obj.type === 'text') {
        obj.set({
            fill: EditorDOM.strokeColor.value,
            fontSize: parseInt(EditorDOM.fontSize.value)
        });
    }

    EditorState.canvas.renderAll();
}

function showObjectProperties(e) {
    const obj = e.selected[0];
    if (!obj) return;

    EditorDOM.strokeColor.value = obj.stroke || '#000000';
    EditorDOM.fillColor.value = obj.fill || '#ffffff';
    EditorDOM.strokeWidth.value = obj.strokeWidth || 2;
    EditorDOM.opacity.value = (obj.opacity || 1) * 100;

    if (obj.type === 'i-text' || obj.type === 'text') {
        EditorDOM.fontSize.value = obj.fontSize || 16;
        document.getElementById('textProps')?.classList.remove('hidden');
    }

    document.getElementById('strokeWidthValue').textContent = EditorDOM.strokeWidth.value + 'px';
    document.getElementById('opacityValue').textContent = EditorDOM.opacity.value + '%';
}

function hideObjectProperties() {
    document.getElementById('textProps')?.classList.add('hidden');
}

function deleteSelected() {
    const activeObjects = EditorState.canvas.getActiveObjects();
    if (activeObjects.length) {
        activeObjects.forEach(obj => EditorState.canvas.remove(obj));
        EditorState.canvas.discardActiveObject();
        EditorState.canvas.renderAll();
    }
}

// ============================================
// UNDO/REDO
// ============================================
function saveState() {
    const json = EditorState.canvas.toJSON();
    EditorState.undoStack.push(json);
    EditorState.redoStack = [];
    updateUndoRedoButtons();
    markUnsaved();
}

function undo() {
    if (EditorState.undoStack.length <= 1) return;

    const current = EditorState.undoStack.pop();
    EditorState.redoStack.push(current);

    const previous = EditorState.undoStack[EditorState.undoStack.length - 1];
    EditorState.canvas.loadFromJSON(previous, () => {
        EditorState.canvas.renderAll();
        updateUndoRedoButtons();
    });
}

function redo() {
    if (EditorState.redoStack.length === 0) return;

    const next = EditorState.redoStack.pop();
    EditorState.undoStack.push(next);

    EditorState.canvas.loadFromJSON(next, () => {
        EditorState.canvas.renderAll();
        updateUndoRedoButtons();
    });
}

function updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = EditorState.undoStack.length <= 1;
    document.getElementById('redoBtn').disabled = EditorState.redoStack.length === 0;
}

// ============================================
// ANNOTATIONS PERSISTENCE
// ============================================
function savePageAnnotations(pageNum) {
    EditorState.annotations[pageNum] = EditorState.canvas.toJSON();
}

function loadPageAnnotations(pageNum) {
    EditorState.canvas.clear();

    if (EditorState.annotations[pageNum]) {
        EditorState.canvas.loadFromJSON(EditorState.annotations[pageNum], () => {
            EditorState.canvas.renderAll();
        });
    }
}

// ============================================
// SAVE/DOWNLOAD
// ============================================
function markUnsaved() {
    EditorDOM.saveStatus.classList.add('unsaved');
    EditorDOM.saveStatus.title = 'Unsaved changes';
}

function markSaved() {
    EditorDOM.saveStatus.classList.remove('unsaved');
    EditorDOM.saveStatus.title = 'All changes saved';
}

async function downloadPDF() {
    if (!EditorState.pdfBytes) {
        PDFTools.showToast('error', 'No PDF', 'Please load a PDF first');
        return;
    }

    try {
        // Save current page annotations
        savePageAnnotations(EditorState.currentPage);

        // For now, just download the original PDF
        // Full annotation flattening would require more complex logic
        const blob = new Blob([EditorState.pdfBytes], { type: 'application/pdf' });
        saveAs(blob, 'edited_' + EditorDOM.fileName.textContent);

        markSaved();
        PDFTools.showToast('success', 'Downloaded', 'Your PDF has been downloaded');
    } catch (error) {
        console.error('Download error:', error);
        PDFTools.showToast('error', 'Error', 'Failed to download PDF');
    }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
function handleKeyboard(e) {
    // Don't intercept when typing
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const activeObject = EditorState.canvas?.getActiveObject();
    if (activeObject && activeObject.isEditing) return;

    switch (e.key.toLowerCase()) {
        case 'v':
            setTool('select');
            break;
        case 't':
            setTool('text');
            break;
        case 'd':
            setTool('draw');
            break;
        case 'e':
            setTool('eraser');
            break;
        case 'n':
            setTool('note');
            break;
        case 'h':
            setTool('pan');
            break;
        case 'delete':
        case 'backspace':
            if (!activeObject?.isEditing) {
                e.preventDefault();
                deleteSelected();
            }
            break;
        case 'z':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            }
            break;
        case 'y':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                redo();
            }
            break;
        case 's':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                downloadPDF();
            }
            break;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditor);
} else {
    initEditor();
}
