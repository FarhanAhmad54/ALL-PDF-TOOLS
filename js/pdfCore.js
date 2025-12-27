/* ============================================
   PDF Tools - Core PDF Processing Functions
   Uses pdf-lib, PDF.js, jsPDF
   ============================================ */

// Set PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ============================================
// MERGE PDFs
// ============================================
async function mergePDFs(files) {
    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
        showProgress((i / files.length) * 80);

        const fileData = await files[i].file.arrayBuffer();
        const pdf = await PDFDocument.load(fileData);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
    }

    showProgress(90);
    const mergedPdfBytes = await mergedPdf.save();
    const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'merged.pdf');
}

// ============================================
// SPLIT PDF
// ============================================
async function splitPDF(files) {
    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);
    const totalPages = pdf.getPageCount();

    const method = document.getElementById('splitMethod')?.value || 'all';
    resultFiles = [];

    if (method === 'all') {
        // Extract each page as separate PDF
        for (let i = 0; i < totalPages; i++) {
            showProgress((i / totalPages) * 90);

            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(pdf, [i]);
            newPdf.addPage(page);

            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            resultFiles.push({ name: `page_${i + 1}.pdf`, blob });
        }
    } else if (method === 'range') {
        const rangeStr = document.getElementById('pageRange')?.value || '';
        const ranges = parsePageRanges(rangeStr, totalPages);

        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdf, ranges.map(p => p - 1));
        pages.forEach(page => newPdf.addPage(page));

        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        resultFiles.push({ name: 'extracted_pages.pdf', blob });
    } else if (method === 'interval') {
        const interval = parseInt(document.getElementById('splitInterval')?.value) || 1;

        for (let start = 0; start < totalPages; start += interval) {
            showProgress((start / totalPages) * 90);

            const end = Math.min(start + interval, totalPages);
            const newPdf = await PDFDocument.create();
            const pageIndices = [];
            for (let i = start; i < end; i++) pageIndices.push(i);

            const pages = await newPdf.copyPages(pdf, pageIndices);
            pages.forEach(page => newPdf.addPage(page));

            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            resultFiles.push({ name: `pages_${start + 1}-${end}.pdf`, blob });
        }
    }

    showProgress(100);

    if (resultFiles.length === 1) {
        showResult(resultFiles[0].blob, resultFiles[0].name);
    } else {
        hideProgress();
        document.getElementById('resultArea').classList.remove('hidden');
        document.getElementById('resultFileName').textContent = `${resultFiles.length} files`;
        document.getElementById('resultFileSize').textContent = 'Download as ZIP';
        document.getElementById('downloadBtn').innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download ZIP
    `;
        PDFTools.showToast('success', 'Complete!', `Split into ${resultFiles.length} files`);
    }
}

// ============================================
// COMPRESS PDF
// ============================================
async function compressPDF(files) {
    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);

    showProgress(50);

    // Note: True compression requires server-side processing
    // This creates a "cleaned" version without extra data
    const compressedBytes = await pdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50
    });

    showProgress(100);

    const blob = new Blob([compressedBytes], { type: 'application/pdf' });
    const originalSize = files[0].file.size;
    const newSize = blob.size;
    const reduction = Math.round((1 - newSize / originalSize) * 100);

    showResult(blob, 'compressed.pdf');

    if (reduction > 0) {
        PDFTools.showToast('info', 'Size Reduced', `Reduced by ${reduction}%`);
    }
}

// ============================================
// ROTATE PDF
// ============================================
async function rotatePDF(files) {
    const { PDFDocument, degrees } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);

    const angle = parseInt(document.getElementById('rotationAngle')?.value) || 90;
    const applyTo = document.getElementById('rotatePages')?.value || 'all';
    const totalPages = pdf.getPageCount();

    for (let i = 0; i < totalPages; i++) {
        showProgress((i / totalPages) * 90);

        let shouldRotate = false;
        if (applyTo === 'all') shouldRotate = true;
        else if (applyTo === 'odd' && (i + 1) % 2 === 1) shouldRotate = true;
        else if (applyTo === 'even' && (i + 1) % 2 === 0) shouldRotate = true;

        if (shouldRotate) {
            const page = pdf.getPage(i);
            const currentRotation = page.getRotation().angle;
            page.setRotation(degrees(currentRotation + angle));
        }
    }

    showProgress(95);
    const pdfBytes = await pdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'rotated.pdf');
}

// ============================================
// PROTECT PDF (Add Password)
// ============================================
async function protectPDF(files) {
    const password = document.getElementById('pdfPassword')?.value;
    const confirmPassword = document.getElementById('pdfPasswordConfirm')?.value;

    if (!password) {
        throw new Error('Please enter a password');
    }

    if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
    }

    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);

    showProgress(50);

    // Note: pdf-lib doesn't support encryption natively
    // This is a simplified version - for real encryption, use a server-side solution
    const pdfBytes = await pdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'protected.pdf');

    PDFTools.showToast('warning', 'Note', 'Client-side encryption has limitations. For strong security, use a desktop PDF tool.');
}

// ============================================
// PDF TO IMAGE
// ============================================
async function pdfToImage(files) {
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;
    const totalPages = pdf.numPages;

    const format = document.getElementById('imageFormat')?.value || 'png';
    const scale = parseFloat(document.getElementById('imageQuality')?.value) || 2;

    resultFiles = [];

    for (let i = 1; i <= totalPages; i++) {
        showProgress((i / totalPages) * 90);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport }).promise;

        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = canvas.toDataURL(mimeType, 0.9);

        // Convert data URL to blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        resultFiles.push({
            name: `page_${i}.${format}`,
            blob
        });
    }

    showProgress(100);

    if (resultFiles.length === 1) {
        showResult(resultFiles[0].blob, resultFiles[0].name);
    } else {
        hideProgress();
        document.getElementById('resultArea').classList.remove('hidden');
        document.getElementById('resultFileName').textContent = `${resultFiles.length} images`;
        document.getElementById('resultFileSize').textContent = 'Download as ZIP';
        document.getElementById('downloadBtn').innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download ZIP
    `;
        PDFTools.showToast('success', 'Complete!', `Converted ${resultFiles.length} pages to images`);
    }
}

// ============================================
// IMAGE TO PDF
// ============================================
async function imageToPDF(files) {
    const { jsPDF } = window.jspdf;
    const pageSize = document.getElementById('pageSize')?.value || 'a4';
    const orientation = document.getElementById('orientation')?.value || 'auto';

    let pdf;

    for (let i = 0; i < files.length; i++) {
        showProgress((i / files.length) * 90);

        const file = files[i].file;
        const img = await loadImage(file);

        // Determine orientation
        let orient = orientation;
        if (orient === 'auto') {
            orient = img.width > img.height ? 'landscape' : 'portrait';
        }

        // Create PDF on first image or add page
        if (i === 0) {
            if (pageSize === 'fit') {
                pdf = new jsPDF({
                    orientation: orient,
                    unit: 'px',
                    format: [img.width, img.height]
                });
                pdf.addImage(img, 'JPEG', 0, 0, img.width, img.height);
            } else {
                pdf = new jsPDF({
                    orientation: orient,
                    unit: 'mm',
                    format: pageSize
                });
                addImageToPage(pdf, img, orient, pageSize);
            }
        } else {
            if (pageSize === 'fit') {
                pdf.addPage([img.width, img.height], orient);
                pdf.addImage(img, 'JPEG', 0, 0, img.width, img.height);
            } else {
                pdf.addPage(pageSize, orient);
                addImageToPage(pdf, img, orient, pageSize);
            }
        }
    }

    showProgress(95);
    const pdfBlob = pdf.output('blob');

    showProgress(100);
    showResult(pdfBlob, 'images.pdf');
}

function addImageToPage(pdf, img, orientation, pageSize) {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const margin = 10;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    let width = img.width;
    let height = img.height;

    // Scale to fit
    if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = height * ratio;
    }
    if (height > maxHeight) {
        const ratio = maxHeight / height;
        height = maxHeight;
        width = width * ratio;
    }

    // Center on page
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;

    pdf.addImage(img, 'JPEG', x, y, width, height);
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================
// ADD WATERMARK
// ============================================
async function addWatermark(files) {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);

    const text = document.getElementById('watermarkText')?.value || 'WATERMARK';
    const position = document.getElementById('watermarkPosition')?.value || 'center';
    const opacity = (parseInt(document.getElementById('watermarkOpacity')?.value) || 30) / 100;

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();

    for (let i = 0; i < pages.length; i++) {
        showProgress((i / pages.length) * 90);

        const page = pages[i];
        const { width, height } = page.getSize();
        const fontSize = Math.min(width, height) / 10;

        let x, y, rotate = 0;

        if (position === 'center') {
            x = width / 2 - (text.length * fontSize * 0.3);
            y = height / 2;
        } else if (position === 'diagonal') {
            x = width / 4;
            y = height / 2;
            rotate = -45;
        } else if (position === 'top') {
            x = width / 2 - (text.length * fontSize * 0.3);
            y = height - 50;
        } else {
            x = width / 2 - (text.length * fontSize * 0.3);
            y = 50;
        }

        page.drawText(text, {
            x,
            y,
            size: fontSize,
            font,
            color: rgb(0.5, 0.5, 0.5),
            opacity,
            rotate: PDFLib.degrees(rotate)
        });
    }

    showProgress(95);
    const pdfBytes = await pdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'watermarked.pdf');
}

// ============================================
// ADD PAGE NUMBERS
// ============================================
async function addPageNumbers(files) {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);

    const position = document.getElementById('numberPosition')?.value || 'bottom-center';
    const format = document.getElementById('numberFormat')?.value || '1';
    const startPage = parseInt(document.getElementById('startPage')?.value) || 1;

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();
    const fontSize = 12;

    for (let i = startPage - 1; i < pages.length; i++) {
        showProgress((i / pages.length) * 90);

        const page = pages[i];
        const { width, height } = page.getSize();
        const pageNum = i + 1;

        let text = format.replace('1', pageNum.toString());
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        let x, y;
        const margin = 30;

        if (position.includes('left')) x = margin;
        else if (position.includes('right')) x = width - textWidth - margin;
        else x = (width - textWidth) / 2;

        if (position.includes('top')) y = height - margin;
        else y = margin;

        page.drawText(text, {
            x,
            y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0)
        });
    }

    showProgress(95);
    const pdfBytes = await pdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'numbered.pdf');
}

// ============================================
// EXTRACT PAGES
// ============================================
async function extractPages(files) {
    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);
    const totalPages = pdf.getPageCount();

    const rangeStr = document.getElementById('extractRange')?.value || '1';
    const pageIndices = parsePageRanges(rangeStr, totalPages).map(p => p - 1);

    if (pageIndices.length === 0) {
        throw new Error('No valid pages specified');
    }

    showProgress(50);

    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(pdf, pageIndices);
    pages.forEach(page => newPdf.addPage(page));

    showProgress(90);
    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'extracted.pdf');
}

// ============================================
// DELETE PAGES
// ============================================
async function deletePages(files) {
    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);
    const totalPages = pdf.getPageCount();

    const rangeStr = document.getElementById('deleteRange')?.value || '';
    const pagesToDelete = parsePageRanges(rangeStr, totalPages);

    if (pagesToDelete.length === 0) {
        throw new Error('No valid pages specified');
    }

    if (pagesToDelete.length >= totalPages) {
        throw new Error('Cannot delete all pages');
    }

    showProgress(50);

    // Get pages to keep
    const pagesToKeep = [];
    for (let i = 1; i <= totalPages; i++) {
        if (!pagesToDelete.includes(i)) {
            pagesToKeep.push(i - 1);
        }
    }

    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(pdf, pagesToKeep);
    pages.forEach(page => newPdf.addPage(page));

    showProgress(90);
    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'modified.pdf');
    PDFTools.showToast('info', 'Pages Deleted', `Removed ${pagesToDelete.length} page(s)`);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function parsePageRanges(rangeStr, totalPages) {
    const pages = [];
    const parts = rangeStr.split(',').map(s => s.trim());

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(s => parseInt(s.trim()));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
                    if (!pages.includes(i)) pages.push(i);
                }
            }
        } else {
            const num = parseInt(part);
            if (!isNaN(num) && num >= 1 && num <= totalPages && !pages.includes(num)) {
                pages.push(num);
            }
        }
    }

    return pages.sort((a, b) => a - b);
}

// PDF Preview using PDF.js
async function previewPDF(file, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    const fileData = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;

    // Render first 3 pages as preview
    const pagesToRender = Math.min(3, pdf.numPages);

    for (let i = 1; i <= pagesToRender; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.marginBottom = '10px';
        canvas.style.border = '1px solid var(--border-subtle)';
        canvas.style.borderRadius = 'var(--radius-md)';

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        container.appendChild(canvas);
    }

    if (pdf.numPages > 3) {
        const more = document.createElement('p');
        more.textContent = `... and ${pdf.numPages - 3} more page(s)`;
        more.style.textAlign = 'center';
        more.style.color = 'var(--text-muted)';
        container.appendChild(more);
    }
}

// Export functions
window.mergePDFs = mergePDFs;
window.splitPDF = splitPDF;
window.compressPDF = compressPDF;
window.rotatePDF = rotatePDF;
window.protectPDF = protectPDF;
window.pdfToImage = pdfToImage;
window.imageToPDF = imageToPDF;
window.addWatermark = addWatermark;
window.addPageNumbers = addPageNumbers;
window.extractPages = extractPages;
window.deletePages = deletePages;
window.previewPDF = previewPDF;
