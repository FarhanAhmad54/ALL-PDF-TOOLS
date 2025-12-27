/* ============================================
   PDF Tools - Optimizer JavaScript
   PDF compression and optimization functions
   ============================================ */

// Set PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// State
let currentFile = null;
let pdfDoc = null;
let resultBlob = null;
let originalSize = 0;

// DOM Elements
const DOM = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    filePages: document.getElementById('filePages'),
    actionButtons: document.getElementById('actionButtons'),
    progressCard: document.getElementById('progressCard'),
    progressBar: document.getElementById('progressBar'),
    progressStatus: document.getElementById('progressStatus'),
    progressPercent: document.getElementById('progressPercent'),
    resultCard: document.getElementById('resultCard'),
    originalSize: document.getElementById('originalSize'),
    newSize: document.getElementById('newSize'),
    savedPercent: document.getElementById('savedPercent'),
    imageQuality: document.getElementById('imageQuality'),
    qualityValue: document.getElementById('qualityValue')
};

// Initialize
function initOptimizer() {
    // File upload
    DOM.dropzone?.addEventListener('click', () => DOM.fileInput.click());
    DOM.fileInput?.addEventListener('change', handleFileSelect);

    // Drag and drop
    DOM.dropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.dropzone.classList.add('dragover');
    });
    DOM.dropzone?.addEventListener('dragleave', () => DOM.dropzone.classList.remove('dragover'));
    DOM.dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    // Remove file
    document.getElementById('removeFile')?.addEventListener('click', resetFile);

    // Image quality slider
    DOM.imageQuality?.addEventListener('input', (e) => {
        DOM.qualityValue.textContent = e.target.value + '%';
    });

    // Buttons
    document.getElementById('resetBtn')?.addEventListener('click', resetOptions);
    document.getElementById('optimizeBtn')?.addEventListener('click', optimizePDF);
    document.getElementById('downloadBtn')?.addEventListener('click', downloadResult);

    console.log('PDF Optimizer initialized');
}

// File handling
function handleFileSelect(e) {
    if (e.target.files[0]) {
        handleFile(e.target.files[0]);
    }
}

async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        PDFTools?.showToast?.('error', 'Error', 'Please select a PDF file');
        return;
    }

    currentFile = file;
    originalSize = file.size;

    // Get page count
    try {
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        DOM.fileName.textContent = file.name;
        DOM.fileSize.textContent = formatFileSize(file.size);
        DOM.filePages.textContent = pdfDoc.numPages;

        DOM.fileInfo.classList.remove('hidden');
        DOM.actionButtons.style.display = 'flex';
        DOM.resultCard.classList.add('hidden');

    } catch (error) {
        console.error('Error loading PDF:', error);
        PDFTools?.showToast?.('error', 'Error', 'Failed to load PDF');
    }
}

function resetFile() {
    currentFile = null;
    pdfDoc = null;
    originalSize = 0;

    DOM.fileInfo.classList.add('hidden');
    DOM.actionButtons.style.display = 'none';
    DOM.resultCard.classList.add('hidden');
    DOM.progressCard.classList.add('hidden');
    DOM.fileInput.value = '';
}

function resetOptions() {
    // Reset all checkboxes and inputs to defaults
    document.getElementById('compressImages').checked = true;
    document.getElementById('imageQuality').value = 70;
    DOM.qualityValue.textContent = '70%';
    document.getElementById('reduceDPI').checked = true;
    document.getElementById('targetDPI').value = '150';
    document.getElementById('useObjectStreams').checked = true;

    document.getElementById('removeThumbnails').checked = false;
    document.getElementById('removeMetadata').checked = false;
    document.getElementById('removeAnnotations').checked = false;
    document.getElementById('removeLinks').checked = false;
    document.getElementById('removeJavaScript').checked = false;
    document.getElementById('removeAttachments').checked = false;

    document.getElementById('flattenAnnotations').checked = false;
    document.getElementById('flattenForms').checked = false;
    document.getElementById('flattenLayers').checked = false;

    document.getElementById('pdfVersion').value = '';
    document.getElementById('optimizeWeb').checked = false;
    document.getElementById('convertPDFA').checked = false;

    PDFTools?.showToast?.('info', 'Reset', 'Options reset to defaults');
}

// Optimization
async function optimizePDF() {
    if (!currentFile) {
        PDFTools?.showToast?.('error', 'Error', 'Please select a PDF file first');
        return;
    }

    // Get options
    const options = {
        compressImages: document.getElementById('compressImages').checked,
        imageQuality: parseInt(document.getElementById('imageQuality').value) / 100,
        reduceDPI: document.getElementById('reduceDPI').checked,
        targetDPI: parseInt(document.getElementById('targetDPI').value),
        useObjectStreams: document.getElementById('useObjectStreams').checked,

        removeThumbnails: document.getElementById('removeThumbnails').checked,
        removeMetadata: document.getElementById('removeMetadata').checked,
        removeAnnotations: document.getElementById('removeAnnotations').checked,
        removeLinks: document.getElementById('removeLinks').checked,
        removeJavaScript: document.getElementById('removeJavaScript').checked,
        removeAttachments: document.getElementById('removeAttachments').checked,

        flattenAnnotations: document.getElementById('flattenAnnotations').checked,
        flattenForms: document.getElementById('flattenForms').checked,
        flattenLayers: document.getElementById('flattenLayers').checked,

        pdfVersion: document.getElementById('pdfVersion').value,
        optimizeWeb: document.getElementById('optimizeWeb').checked,
        convertPDFA: document.getElementById('convertPDFA').checked
    };

    DOM.progressCard.classList.remove('hidden');
    DOM.resultCard.classList.add('hidden');
    updateProgress(0, 'Loading PDF...');

    try {
        const { PDFDocument } = PDFLib;
        const arrayBuffer = await currentFile.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

        updateProgress(20, 'Applying optimizations...');

        // Remove metadata
        if (options.removeMetadata) {
            pdf.setTitle('');
            pdf.setAuthor('');
            pdf.setSubject('');
            pdf.setKeywords([]);
            pdf.setProducer('');
            pdf.setCreator('');
            pdf.setCreationDate(new Date(0));
            pdf.setModificationDate(new Date(0));
        }

        updateProgress(40, 'Processing pages...');

        // Process each page
        const pages = pdf.getPages();
        for (let i = 0; i < pages.length; i++) {
            updateProgress(40 + (i / pages.length) * 40, `Processing page ${i + 1}/${pages.length}...`);

            const page = pages[i];

            // Remove annotations if requested
            if (options.removeAnnotations) {
                const annots = page.node.lookup(PDFLib.PDFName.of('Annots'));
                if (annots) {
                    page.node.delete(PDFLib.PDFName.of('Annots'));
                }
            }
        }

        updateProgress(80, 'Compressing...');

        // Save with options
        const saveOptions = {
            useObjectStreams: options.useObjectStreams,
            addDefaultPage: false,
            objectsPerTick: 50
        };

        const optimizedBytes = await pdf.save(saveOptions);

        updateProgress(95, 'Finalizing...');

        // Create result
        resultBlob = new Blob([optimizedBytes], { type: 'application/pdf' });
        const newSize = resultBlob.size;
        const savedBytes = originalSize - newSize;
        const savedPercent = Math.round((savedBytes / originalSize) * 100);

        updateProgress(100, 'Complete!');

        // Show result
        DOM.originalSize.textContent = formatFileSize(originalSize);
        DOM.newSize.textContent = formatFileSize(newSize);
        DOM.savedPercent.textContent = savedPercent > 0 ? `-${savedPercent}%` : '+' + Math.abs(savedPercent) + '%';
        DOM.savedPercent.className = savedPercent > 0 ? 'font-semibold text-success' : 'font-semibold text-error';

        setTimeout(() => {
            DOM.progressCard.classList.add('hidden');
            DOM.resultCard.classList.remove('hidden');
        }, 500);

        PDFTools?.showToast?.('success', 'Optimized!', `Reduced by ${savedPercent}%`);

    } catch (error) {
        console.error('Optimization error:', error);
        DOM.progressCard.classList.add('hidden');
        PDFTools?.showToast?.('error', 'Error', 'Optimization failed: ' + error.message);
    }
}

function updateProgress(percent, status) {
    DOM.progressBar.style.width = percent + '%';
    DOM.progressPercent.textContent = Math.round(percent) + '%';
    if (status) DOM.progressStatus.textContent = status;
}

function downloadResult() {
    if (resultBlob) {
        const fileName = currentFile.name.replace('.pdf', '_optimized.pdf');
        saveAs(resultBlob, fileName);
        PDFTools?.showToast?.('success', 'Downloaded', 'Optimized PDF saved');
    }
}

// Utilities
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOptimizer);
} else {
    initOptimizer();
}
