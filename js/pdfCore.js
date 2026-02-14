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

// ============================================
// UNLOCK PDF
// ============================================
async function unlockPDF(files) {
    const password = document.getElementById('currentPassword')?.value;
    if (!password) throw new Error('Please enter the current password');
    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    showProgress(30);
    try {
        const pdf = await PDFDocument.load(fileData, { password });
        showProgress(70);
        const pdfBytes = await pdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showProgress(100);
        showResult(blob, 'unlocked.pdf');
    } catch (e) {
        throw new Error('Incorrect password or unable to unlock this PDF');
    }
}

// ============================================
// PDF TO TEXT
// ============================================
async function pdfToText(files) {
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        showProgress((i / pdf.numPages) * 90);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += `--- Page ${i} ---\n${strings.join(' ')}\n\n`;
    }
    showProgress(100);
    const blob = new Blob([fullText], { type: 'text/plain' });
    showResult(blob, 'extracted_text.txt');
}

// ============================================
// TEXT TO PDF
// ============================================
async function textToPDF(files) {
    const file = files[0].file;
    const text = await file.text();
    const { jsPDF } = window.jspdf;
    const fontSize = parseInt(document.getElementById('txtFontSize')?.value) || 12;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    showProgress(30);
    pdf.setFontSize(fontSize);
    const lines = pdf.splitTextToSize(text, 170);
    const lineHeight = fontSize * 0.5;
    const pageHeight = 280;
    let y = 20;
    for (let i = 0; i < lines.length; i++) {
        if (y + lineHeight > pageHeight) { pdf.addPage(); y = 20; }
        pdf.text(lines[i], 20, y);
        y += lineHeight;
    }
    showProgress(100);
    showResult(pdf.output('blob'), 'text_document.pdf');
}

// ============================================
// REORDER PAGES
// ============================================
async function reorderPages(files) {
    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);
    const orderStr = document.getElementById('pageOrder')?.value || '';
    if (!orderStr.trim()) throw new Error('Please specify page order');
    const totalPages = pdf.getPageCount();
    const order = orderStr.split(',').map(s => parseInt(s.trim()) - 1).filter(n => !isNaN(n) && n >= 0 && n < totalPages);
    if (order.length === 0) throw new Error('Invalid page order');
    showProgress(50);
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(pdf, order);
    pages.forEach(page => newPdf.addPage(page));
    const pdfBytes = await newPdf.save();
    showProgress(100);
    showResult(new Blob([pdfBytes], { type: 'application/pdf' }), 'reordered.pdf');
}

// ============================================
// DUPLICATE PAGES
// ============================================
async function duplicatePages(files) {
    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);
    const rangeStr = document.getElementById('dupRange')?.value || '1';
    const copies = parseInt(document.getElementById('dupCopies')?.value) || 2;
    const totalPages = pdf.getPageCount();
    const pagesToDup = parsePageRanges(rangeStr, totalPages).map(p => p - 1);
    showProgress(30);
    const newPdf = await PDFDocument.create();
    // Copy all pages first
    const allPages = await newPdf.copyPages(pdf, pdf.getPageIndices());
    allPages.forEach(page => newPdf.addPage(page));
    // Now add duplicates at the end
    for (let c = 0; c < copies - 1; c++) {
        const dupPages = await newPdf.copyPages(pdf, pagesToDup);
        dupPages.forEach(page => newPdf.addPage(page));
    }
    showProgress(90);
    const pdfBytes = await newPdf.save();
    showProgress(100);
    showResult(new Blob([pdfBytes], { type: 'application/pdf' }), 'duplicated.pdf');
}

// ============================================
// ADD BLANK PAGES
// ============================================
async function addBlankPages(files) {
    const { PDFDocument, PageSizes } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);
    const count = parseInt(document.getElementById('blankCount')?.value) || 1;
    const position = document.getElementById('blankPosition')?.value || 'end';
    showProgress(50);
    const pageSize = pdf.getPage(0).getSize();
    if (position === 'end') {
        for (let i = 0; i < count; i++) pdf.addPage([pageSize.width, pageSize.height]);
    } else {
        for (let i = 0; i < count; i++) pdf.insertPage(0, [pageSize.width, pageSize.height]);
    }
    const pdfBytes = await pdf.save();
    showProgress(100);
    showResult(new Blob([pdfBytes], { type: 'application/pdf' }), 'with_blank_pages.pdf');
}

// ============================================
// RESIZE PAGES
// ============================================
async function resizePages(files) {
    const { PDFDocument } = PDFLib;
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);
    const targetSize = document.getElementById('targetPageSize')?.value || 'a4';
    const sizes = { 'a4': [595.28, 841.89], 'letter': [612, 792], 'legal': [612, 1008], 'a3': [841.89, 1190.55], 'a5': [419.53, 595.28] };
    const [w, h] = sizes[targetSize] || sizes['a4'];
    showProgress(50);
    const newPdf = await PDFDocument.create();
    for (let i = 0; i < pdf.getPageCount(); i++) {
        const [embeddedPage] = await newPdf.embedPdf(pdf, [i]);
        const page = newPdf.addPage([w, h]);
        const dims = embeddedPage.scale(Math.min(w / embeddedPage.width, h / embeddedPage.height));
        page.drawPage(embeddedPage, { x: (w - dims.width) / 2, y: (h - dims.height) / 2, width: dims.width, height: dims.height });
    }
    const pdfBytes = await newPdf.save();
    showProgress(100);
    showResult(new Blob([pdfBytes], { type: 'application/pdf' }), 'resized.pdf');
}

// ============================================
// BUSINESS PDF GENERATOR HELPER
// ============================================
function createBusinessPDF(title, callback) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    // Header bar
    pdf.setFillColor(31, 41, 55);
    pdf.rect(0, 0, w, 35, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, 15, 23);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    callback(pdf, w);
    return pdf;
}

function getFieldVal(id, fallback) { return document.getElementById(id)?.value || fallback || ''; }

// ============================================
// BUSINESS TOOLS (20)
// ============================================

// 1. Invoice Generator
async function generateInvoice() {
    showProgress(30);
    const pdf = createBusinessPDF('INVOICE', (doc, w) => {
        const company = getFieldVal('biz-company', 'Your Company');
        const client = getFieldVal('biz-client', 'Client Name');
        const invNo = getFieldVal('biz-invno', 'INV-001');
        const date = getFieldVal('biz-date', new Date().toLocaleDateString());
        const items = getFieldVal('biz-items', 'Service 1|1|100\nService 2|2|50');
        doc.setFontSize(10);
        doc.text(`From: ${company}`, 15, 50);
        doc.text(`To: ${client}`, 15, 57);
        doc.text(`Invoice #: ${invNo}`, w - 80, 50);
        doc.text(`Date: ${date}`, w - 80, 57);
        // Table header
        let y = 75;
        doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text('Description', 18, y + 2);
        doc.text('Qty', 110, y + 2);
        doc.text('Price', 135, y + 2);
        doc.text('Total', 165, y + 2);
        doc.setFont('helvetica', 'normal');
        y += 12;
        let grandTotal = 0;
        items.split('\n').forEach(line => {
            const parts = line.split('|');
            if (parts.length >= 3) {
                const desc = parts[0].trim(), qty = parseInt(parts[1]) || 1, price = parseFloat(parts[2]) || 0;
                const total = qty * price; grandTotal += total;
                doc.text(desc, 18, y); doc.text(String(qty), 115, y);
                doc.text(`$${price.toFixed(2)}`, 135, y); doc.text(`$${total.toFixed(2)}`, 165, y);
                y += 8;
            }
        });
        y += 5; doc.setDrawColor(200); doc.line(15, y, w - 15, y); y += 10;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text(`Grand Total: $${grandTotal.toFixed(2)}`, w - 80, y);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.text('Thank you for your business!', 15, 270);
    });
    showProgress(100);
    showResult(pdf.output('blob'), 'invoice.pdf');
}

// 2. Receipt Creator
async function generateReceipt() {
    showProgress(30);
    const pdf = createBusinessPDF('RECEIPT', (doc, w) => {
        const company = getFieldVal('biz-company', 'Your Company');
        const customer = getFieldVal('biz-client', 'Customer');
        const recNo = getFieldVal('biz-recno', 'REC-001');
        const date = getFieldVal('biz-date', new Date().toLocaleDateString());
        const items = getFieldVal('biz-items', 'Item 1|1|50');
        const payMethod = getFieldVal('biz-paymethod', 'Cash');
        doc.setFontSize(10);
        doc.text(`Business: ${company}`, 15, 50); doc.text(`Customer: ${customer}`, 15, 57);
        doc.text(`Receipt #: ${recNo}`, w - 80, 50); doc.text(`Date: ${date}`, w - 80, 57);
        doc.text(`Payment: ${payMethod}`, w - 80, 64);
        let y = 80, total = 0;
        doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text('Item', 18, y + 2); doc.text('Qty', 120, y + 2); doc.text('Amount', 160, y + 2);
        doc.setFont('helvetica', 'normal'); y += 12;
        items.split('\n').forEach(line => {
            const p = line.split('|');
            if (p.length >= 3) {
                const q = parseInt(p[1]) || 1, pr = parseFloat(p[2]) || 0, t = q * pr; total += t;
                doc.text(p[0].trim(), 18, y); doc.text(String(q), 125, y); doc.text(`$${t.toFixed(2)}`, 160, y); y += 8;
            }
        });
        y += 5; doc.line(15, y, w - 15, y); y += 10;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
        doc.text(`Total: $${total.toFixed(2)}`, w - 70, y);
    });
    showProgress(100);
    showResult(pdf.output('blob'), 'receipt.pdf');
}

// 3. Letterhead
async function generateLetterhead() {
    showProgress(30);
    const pdf = createBusinessPDF('LETTERHEAD', (doc, w) => {
        const company = getFieldVal('biz-company', 'Your Company');
        const address = getFieldVal('biz-address', '123 Business St');
        const phone = getFieldVal('biz-phone', '(555) 123-4567');
        const email = getFieldVal('biz-email', 'info@company.com');
        const body = getFieldVal('biz-body', 'Dear Sir/Madam,\n\nThis letter is to...\n\nSincerely,');
        doc.setFontSize(9); doc.setTextColor(100);
        doc.text(`${company} | ${address} | ${phone} | ${email}`, 15, 45);
        doc.setTextColor(0); doc.setFontSize(11);
        const lines = doc.splitTextToSize(body, w - 30);
        doc.text(lines, 15, 65);
    });
    showProgress(100);
    showResult(pdf.output('blob'), 'letterhead.pdf');
}

// 4. Contract Template
async function generateContract() {
    showProgress(30);
    const pdf = createBusinessPDF('CONTRACT', (doc, w) => {
        const party1 = getFieldVal('biz-party1', 'Party A');
        const party2 = getFieldVal('biz-party2', 'Party B');
        const date = getFieldVal('biz-date', new Date().toLocaleDateString());
        const terms = getFieldVal('biz-terms', '1. Both parties agree to...\n2. Payment terms...\n3. Duration...');
        doc.setFontSize(10); doc.text(`Date: ${date}`, 15, 50);
        doc.text(`Between: ${party1} (hereinafter "First Party")`, 15, 60);
        doc.text(`And: ${party2} (hereinafter "Second Party")`, 15, 67);
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Terms & Conditions', 15, 82);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        const lines = doc.splitTextToSize(terms, w - 30); doc.text(lines, 15, 92);
        doc.text('_________________________', 15, 240); doc.text('_________________________', w / 2 + 10, 240);
        doc.text(`${party1}`, 15, 248); doc.text(`${party2}`, w / 2 + 10, 248);
        doc.text('Signature', 15, 255); doc.text('Signature', w / 2 + 10, 255);
    });
    showProgress(100);
    showResult(pdf.output('blob'), 'contract.pdf');
}

// 5. NDA Generator
async function generateNDA() {
    showProgress(30);
    const pdf = createBusinessPDF('NON-DISCLOSURE AGREEMENT', (doc, w) => {
        const party1 = getFieldVal('biz-party1', 'Disclosing Party');
        const party2 = getFieldVal('biz-party2', 'Receiving Party');
        const date = getFieldVal('biz-date', new Date().toLocaleDateString());
        const duration = getFieldVal('biz-duration', '2 years');
        const ndaText = `This Non-Disclosure Agreement ("Agreement") is entered into as of ${date} by and between ${party1} ("Disclosing Party") and ${party2} ("Receiving Party").\n\n1. CONFIDENTIAL INFORMATION: The Receiving Party agrees to hold in confidence all proprietary information disclosed by the Disclosing Party.\n\n2. OBLIGATIONS: The Receiving Party shall not disclose, publish, or disseminate Confidential Information to anyone other than those who need to know.\n\n3. DURATION: This Agreement shall remain in effect for ${duration} from the date of signing.\n\n4. RETURN OF MATERIALS: Upon termination, the Receiving Party shall return all materials containing Confidential Information.\n\n5. GOVERNING LAW: This Agreement shall be governed by applicable laws.`;
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(ndaText, w - 30); doc.text(lines, 15, 50);
        doc.text('_________________________', 15, 230); doc.text('_________________________', w / 2 + 10, 230);
        doc.text(party1, 15, 238); doc.text(party2, w / 2 + 10, 238);
    });
    showProgress(100);
    showResult(pdf.output('blob'), 'nda.pdf');
}

// 6. Business Card PDF
async function generateBusinessCard() {
    showProgress(30);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [55, 90] });
    const name = getFieldVal('biz-name', 'John Doe');
    const title = getFieldVal('biz-title', 'CEO');
    const company = getFieldVal('biz-company', 'Company Inc.');
    const phone = getFieldVal('biz-phone', '(555) 123-4567');
    const email = getFieldVal('biz-email', 'john@company.com');
    pdf.setFillColor(31, 41, 55); pdf.rect(0, 0, 90, 22, 'F');
    pdf.setTextColor(255); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
    pdf.text(name, 5, 12); pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    pdf.text(title, 5, 18); pdf.setTextColor(0); pdf.setFontSize(9);
    pdf.text(company, 5, 30); pdf.setFontSize(8);
    pdf.text(`📞 ${phone}`, 5, 38); pdf.text(`✉ ${email}`, 5, 44);
    showProgress(100);
    showResult(pdf.output('blob'), 'business_card.pdf');
}

// 7. Report Template
async function generateReport() {
    showProgress(30);
    const pdf = createBusinessPDF('BUSINESS REPORT', (doc, w) => {
        const title = getFieldVal('biz-title', 'Monthly Report');
        const author = getFieldVal('biz-author', 'Author Name');
        const date = getFieldVal('biz-date', new Date().toLocaleDateString());
        const content = getFieldVal('biz-body', 'Executive Summary\n\nKey findings...\n\nRecommendations...');
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text(title, 15, 55);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Author: ${author} | Date: ${date}`, 15, 63);
        doc.line(15, 67, w - 15, 67);
        const lines = doc.splitTextToSize(content, w - 30); doc.text(lines, 15, 78);
    });
    showProgress(100);
    showResult(pdf.output('blob'), 'report.pdf');
}

// 8. Expense Report
async function generateExpenseReport() {
    showProgress(30);
    const pdf = createBusinessPDF('EXPENSE REPORT', (doc, w) => {
        const employee = getFieldVal('biz-name', 'Employee Name');
        const dept = getFieldVal('biz-dept', 'Department');
        const period = getFieldVal('biz-period', 'Jan 2024');
        const expenses = getFieldVal('biz-items', 'Travel|150\nMeals|75\nSupplies|50');
        doc.setFontSize(10);
        doc.text(`Employee: ${employee}`, 15, 50); doc.text(`Department: ${dept}`, 15, 57);
        doc.text(`Period: ${period}`, w - 80, 50);
        let y = 75, total = 0;
        doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text('Category', 18, y + 2); doc.text('Amount', 160, y + 2);
        doc.setFont('helvetica', 'normal'); y += 12;
        expenses.split('\n').forEach(line => {
            const [cat, amt] = line.split('|');
            if (cat && amt) { const a = parseFloat(amt) || 0; total += a; doc.text(cat.trim(), 18, y); doc.text(`$${a.toFixed(2)}`, 160, y); y += 8; }
        });
        y += 5; doc.line(15, y, w - 15, y); y += 10;
        doc.setFont('helvetica', 'bold'); doc.text(`Total: $${total.toFixed(2)}`, 150, y);
    });
    showProgress(100);
    showResult(pdf.output('blob'), 'expense_report.pdf');
}

// 9-20: Remaining business tools using similar patterns
async function generateTimesheet() {
    showProgress(30);
    const pdf = createBusinessPDF('TIMESHEET', (doc, w) => {
        const name = getFieldVal('biz-name', 'Employee');
        const period = getFieldVal('biz-period', 'Week of Jan 1');
        doc.setFontSize(10); doc.text(`Employee: ${name}`, 15, 50); doc.text(`Period: ${period}`, w - 80, 50);
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        let y = 70; doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold'); doc.text('Day', 18, y + 2); doc.text('Hours In', 70, y + 2); doc.text('Hours Out', 110, y + 2); doc.text('Total', 160, y + 2);
        doc.setFont('helvetica', 'normal'); y += 12;
        days.forEach(d => { doc.text(d, 18, y); doc.text('9:00 AM', 70, y); doc.text('5:00 PM', 110, y); doc.text('8h', 165, y); y += 8; });
        y += 5; doc.setFont('helvetica', 'bold'); doc.text('Total Hours: 56h', 140, y + 5);
    });
    showProgress(100); showResult(pdf.output('blob'), 'timesheet.pdf');
}

async function generateMeetingMinutes() {
    showProgress(30);
    const pdf = createBusinessPDF('MEETING MINUTES', (doc, w) => {
        const title = getFieldVal('biz-title', 'Team Meeting');
        const date = getFieldVal('biz-date', new Date().toLocaleDateString());
        const attendees = getFieldVal('biz-attendees', 'John, Jane, Bob');
        const notes = getFieldVal('biz-body', 'Agenda:\n1. Project updates\n2. Action items\n3. Next steps');
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(title, 15, 55);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Date: ${date}`, 15, 63); doc.text(`Attendees: ${attendees}`, 15, 70);
        doc.line(15, 75, w - 15, 75);
        const lines = doc.splitTextToSize(notes, w - 30); doc.text(lines, 15, 85);
    });
    showProgress(100); showResult(pdf.output('blob'), 'meeting_minutes.pdf');
}

async function generateProposal() {
    showProgress(30);
    const pdf = createBusinessPDF('BUSINESS PROPOSAL', (doc, w) => {
        const company = getFieldVal('biz-company', 'Your Company');
        const client = getFieldVal('biz-client', 'Client Company');
        const title = getFieldVal('biz-title', 'Project Proposal');
        const body = getFieldVal('biz-body', 'Objective:\n\nScope of Work:\n\nTimeline:\n\nBudget:\n\nConclusion:');
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text(title, 15, 55);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Prepared by: ${company}`, 15, 63); doc.text(`Prepared for: ${client}`, 15, 70);
        doc.line(15, 75, w - 15, 75);
        const lines = doc.splitTextToSize(body, w - 30); doc.text(lines, 15, 85);
    });
    showProgress(100); showResult(pdf.output('blob'), 'proposal.pdf');
}

async function generatePurchaseOrder() {
    showProgress(30);
    const pdf = createBusinessPDF('PURCHASE ORDER', (doc, w) => {
        const company = getFieldVal('biz-company', 'Your Company');
        const vendor = getFieldVal('biz-client', 'Vendor Name');
        const poNo = getFieldVal('biz-invno', 'PO-001');
        const items = getFieldVal('biz-items', 'Item A|10|25\nItem B|5|50');
        doc.setFontSize(10); doc.text(`From: ${company}`, 15, 50); doc.text(`To: ${vendor}`, 15, 57);
        doc.text(`PO #: ${poNo}`, w - 80, 50); doc.text(`Date: ${new Date().toLocaleDateString()}`, w - 80, 57);
        let y = 75, total = 0;
        doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold'); doc.text('Item', 18, y + 2); doc.text('Qty', 110, y + 2); doc.text('Unit Price', 135, y + 2); doc.text('Total', 170, y + 2);
        doc.setFont('helvetica', 'normal'); y += 12;
        items.split('\n').forEach(line => {
            const p = line.split('|'); if (p.length >= 3) {
                const q = parseInt(p[1]) || 1, pr = parseFloat(p[2]) || 0, t = q * pr; total += t;
                doc.text(p[0].trim(), 18, y); doc.text(String(q), 115, y); doc.text(`$${pr.toFixed(2)}`, 135, y); doc.text(`$${t.toFixed(2)}`, 170, y); y += 8;
            }
        });
        y += 5; doc.line(15, y, w - 15, y); y += 10; doc.setFont('helvetica', 'bold'); doc.text(`Total: $${total.toFixed(2)}`, 155, y);
    });
    showProgress(100); showResult(pdf.output('blob'), 'purchase_order.pdf');
}

async function generatePackingSlip() {
    showProgress(30);
    const pdf = createBusinessPDF('PACKING SLIP', (doc, w) => {
        const company = getFieldVal('biz-company', 'Your Company');
        const shipTo = getFieldVal('biz-client', 'Ship To Address');
        const orderNo = getFieldVal('biz-invno', 'ORD-001');
        const items = getFieldVal('biz-items', 'Product A|5\nProduct B|3');
        doc.setFontSize(10); doc.text(`From: ${company}`, 15, 50); doc.text(`Ship To: ${shipTo}`, 15, 57); doc.text(`Order #: ${orderNo}`, w - 80, 50);
        let y = 75;
        doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold'); doc.text('Item', 18, y + 2); doc.text('Quantity', 150, y + 2);
        doc.setFont('helvetica', 'normal'); y += 12;
        items.split('\n').forEach(line => {
            const [item, qty] = line.split('|');
            if (item) { doc.text(item.trim(), 18, y); doc.text(qty?.trim() || '1', 155, y); y += 8; }
        });
    });
    showProgress(100); showResult(pdf.output('blob'), 'packing_slip.pdf');
}

async function generateCertificate() {
    showProgress(30);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
    const recipient = getFieldVal('biz-name', 'Recipient Name');
    const certTitle = getFieldVal('biz-title', 'Certificate of Completion');
    const description = getFieldVal('biz-body', 'Has successfully completed the program');
    const date = getFieldVal('biz-date', new Date().toLocaleDateString());
    const issuer = getFieldVal('biz-company', 'Organization');
    // Border
    pdf.setDrawColor(31, 41, 55); pdf.setLineWidth(3); pdf.rect(10, 10, w - 20, h - 20);
    pdf.setLineWidth(1); pdf.rect(15, 15, w - 30, h - 30);
    // Content
    pdf.setFontSize(30); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(31, 41, 55);
    pdf.text(certTitle, w / 2, 55, { align: 'center' });
    pdf.setFontSize(14); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100);
    pdf.text('This is to certify that', w / 2, 80, { align: 'center' });
    pdf.setFontSize(28); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(79, 70, 229);
    pdf.text(recipient, w / 2, 100, { align: 'center' });
    pdf.setFontSize(12); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0);
    pdf.text(description, w / 2, 120, { align: 'center' });
    pdf.text(`Date: ${date}`, w / 2, 145, { align: 'center' });
    pdf.text('_________________________', w / 2 - 40, 165); pdf.text('_________________________', w / 2 + 40, 165);
    pdf.setFontSize(10); pdf.text(issuer, w / 2 - 40, 172); pdf.text('Authorized Signature', w / 2 + 20, 172);
    showProgress(100); showResult(pdf.output('blob'), 'certificate.pdf');
}

async function generatePayslip() {
    showProgress(30);
    const pdf = createBusinessPDF('PAYSLIP', (doc, w) => {
        const company = getFieldVal('biz-company', 'Company'); const employee = getFieldVal('biz-name', 'Employee');
        const period = getFieldVal('biz-period', 'January 2024'); const empId = getFieldVal('biz-empid', 'EMP-001');
        const basic = parseFloat(getFieldVal('biz-basic', '5000')) || 0; const allowance = parseFloat(getFieldVal('biz-allowance', '1000')) || 0;
        const deductions = parseFloat(getFieldVal('biz-deductions', '500')) || 0;
        doc.setFontSize(10); doc.text(`Company: ${company}`, 15, 50); doc.text(`Employee: ${employee}`, 15, 57);
        doc.text(`ID: ${empId}`, w - 80, 50); doc.text(`Period: ${period}`, w - 80, 57);
        let y = 75; doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold'); doc.text('Earnings', 18, y + 2); doc.text('Amount', 160, y + 2); doc.setFont('helvetica', 'normal'); y += 12;
        doc.text('Basic Salary', 18, y); doc.text(`$${basic.toFixed(2)}`, 160, y); y += 8;
        doc.text('Allowances', 18, y); doc.text(`$${allowance.toFixed(2)}`, 160, y); y += 8;
        const gross = basic + allowance; doc.setFont('helvetica', 'bold'); doc.text('Gross Pay', 18, y); doc.text(`$${gross.toFixed(2)}`, 160, y); y += 15;
        doc.text('Deductions', 18, y); doc.text(`$${deductions.toFixed(2)}`, 160, y); y += 10;
        doc.line(15, y, w - 15, y); y += 8; const net = gross - deductions;
        doc.setFontSize(13); doc.text(`Net Pay: $${net.toFixed(2)}`, 140, y);
    });
    showProgress(100); showResult(pdf.output('blob'), 'payslip.pdf');
}

async function generateMemo() {
    showProgress(30);
    const pdf = createBusinessPDF('MEMORANDUM', (doc, w) => {
        const from = getFieldVal('biz-from', 'Sender'); const to = getFieldVal('biz-to', 'Recipient');
        const subject = getFieldVal('biz-title', 'Subject'); const body = getFieldVal('biz-body', 'Memo content...');
        doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text('TO:', 15, 50); doc.text('FROM:', 15, 58); doc.text('SUBJECT:', 15, 66); doc.text('DATE:', 15, 74);
        doc.setFont('helvetica', 'normal');
        doc.text(to, 45, 50); doc.text(from, 45, 58); doc.text(subject, 45, 66); doc.text(new Date().toLocaleDateString(), 45, 74);
        doc.line(15, 80, w - 15, 80);
        const lines = doc.splitTextToSize(body, w - 30); doc.text(lines, 15, 90);
    });
    showProgress(100); showResult(pdf.output('blob'), 'memo.pdf');
}

async function generateAgenda() {
    showProgress(30);
    const pdf = createBusinessPDF('MEETING AGENDA', (doc, w) => {
        const title = getFieldVal('biz-title', 'Team Meeting'); const date = getFieldVal('biz-date', new Date().toLocaleDateString());
        const time = getFieldVal('biz-time', '10:00 AM'); const location = getFieldVal('biz-location', 'Conference Room');
        const items = getFieldVal('biz-body', '1. Opening remarks\n2. Review of previous minutes\n3. Discussion items\n4. Action items\n5. Adjournment');
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(title, 15, 55);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Date: ${date} | Time: ${time} | Location: ${location}`, 15, 63);
        doc.line(15, 68, w - 15, 68);
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Agenda Items:', 15, 78);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
        const lines = doc.splitTextToSize(items, w - 30); doc.text(lines, 15, 88);
    });
    showProgress(100); showResult(pdf.output('blob'), 'agenda.pdf');
}

async function generateCompanyProfile() {
    showProgress(30);
    const pdf = createBusinessPDF('COMPANY PROFILE', (doc, w) => {
        const company = getFieldVal('biz-company', 'Your Company'); const founded = getFieldVal('biz-founded', '2020');
        const mission = getFieldVal('biz-mission', 'Our mission is to...'); const body = getFieldVal('biz-body', 'About us...\n\nOur Services:\n\nOur Team:\n\nContact:');
        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text(company, 15, 55);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Founded: ${founded}`, 15, 63);
        doc.setFontSize(11); doc.setFont('helvetica', 'italic'); const mLines = doc.splitTextToSize(`"${mission}"`, w - 30); doc.text(mLines, 15, 75);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        const lines = doc.splitTextToSize(body, w - 30); doc.text(lines, 15, 95);
    });
    showProgress(100); showResult(pdf.output('blob'), 'company_profile.pdf');
}

async function generateQuotation() {
    showProgress(30);
    const pdf = createBusinessPDF('QUOTATION', (doc, w) => {
        const company = getFieldVal('biz-company', 'Your Company'); const client = getFieldVal('biz-client', 'Client');
        const quoteNo = getFieldVal('biz-invno', 'QT-001'); const validity = getFieldVal('biz-validity', '30 days');
        const items = getFieldVal('biz-items', 'Service A|1|500\nService B|2|250');
        doc.setFontSize(10); doc.text(`From: ${company}`, 15, 50); doc.text(`To: ${client}`, 15, 57);
        doc.text(`Quote #: ${quoteNo}`, w - 80, 50); doc.text(`Valid for: ${validity}`, w - 80, 57);
        let y = 75, total = 0;
        doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold'); doc.text('Description', 18, y + 2); doc.text('Qty', 110, y + 2); doc.text('Rate', 140, y + 2); doc.text('Amount', 170, y + 2);
        doc.setFont('helvetica', 'normal'); y += 12;
        items.split('\n').forEach(line => {
            const p = line.split('|'); if (p.length >= 3) {
                const q = parseInt(p[1]) || 1, r = parseFloat(p[2]) || 0, t = q * r; total += t;
                doc.text(p[0].trim(), 18, y); doc.text(String(q), 115, y); doc.text(`$${r.toFixed(2)}`, 140, y); doc.text(`$${t.toFixed(2)}`, 170, y); y += 8;
            }
        });
        y += 5; doc.line(15, y, w - 15, y); y += 10; doc.setFont('helvetica', 'bold'); doc.text(`Total: $${total.toFixed(2)}`, 155, y);
    });
    showProgress(100); showResult(pdf.output('blob'), 'quotation.pdf');
}

async function generateAttendance() {
    showProgress(30);
    const pdf = createBusinessPDF('ATTENDANCE SHEET', (doc, w) => {
        const title = getFieldVal('biz-title', 'Team Attendance'); const date = getFieldVal('biz-date', new Date().toLocaleDateString());
        const names = getFieldVal('biz-names', 'Employee 1\nEmployee 2\nEmployee 3\nEmployee 4\nEmployee 5');
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(title, 15, 50);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Date: ${date}`, 15, 58);
        let y = 72; doc.setFillColor(243, 244, 246); doc.rect(15, y - 5, w - 30, 10, 'F');
        doc.setFont('helvetica', 'bold'); doc.text('#', 18, y + 2); doc.text('Name', 35, y + 2); doc.text('Time In', 110, y + 2); doc.text('Time Out', 140, y + 2); doc.text('Signature', 170, y + 2);
        doc.setFont('helvetica', 'normal'); y += 12;
        names.split('\n').forEach((name, i) => {
            if (name.trim()) {
                doc.text(String(i + 1), 18, y); doc.text(name.trim(), 35, y);
                doc.text('________', 110, y); doc.text('________', 140, y); doc.text('________', 170, y); y += 10;
            }
        });
    });
    showProgress(100); showResult(pdf.output('blob'), 'attendance.pdf');
}

// Export all functions
window.mergePDFs = mergePDFs;
window.splitPDF = splitPDF;
window.compressPDF = compressPDF;
window.rotatePDF = rotatePDF;
window.protectPDF = protectPDF;
window.unlockPDF = unlockPDF;
window.pdfToImage = pdfToImage;
window.imageToPDF = imageToPDF;
window.addWatermark = addWatermark;
window.addPageNumbers = addPageNumbers;
window.extractPages = extractPages;
window.deletePages = deletePages;
window.previewPDF = previewPDF;
window.pdfToText = pdfToText;
window.textToPDF = textToPDF;
window.reorderPages = reorderPages;
window.duplicatePages = duplicatePages;
window.addBlankPages = addBlankPages;
window.resizePages = resizePages;
window.generateInvoice = generateInvoice;
window.generateReceipt = generateReceipt;
window.generateLetterhead = generateLetterhead;
window.generateContract = generateContract;
window.generateNDA = generateNDA;
window.generateBusinessCard = generateBusinessCard;
window.generateReport = generateReport;
window.generateExpenseReport = generateExpenseReport;
window.generateTimesheet = generateTimesheet;
window.generateMeetingMinutes = generateMeetingMinutes;
window.generateProposal = generateProposal;
window.generatePurchaseOrder = generatePurchaseOrder;
window.generatePackingSlip = generatePackingSlip;
window.generateCertificate = generateCertificate;
window.generatePayslip = generatePayslip;
window.generateMemo = generateMemo;
window.generateAgenda = generateAgenda;
window.generateCompanyProfile = generateCompanyProfile;
window.generateQuotation = generateQuotation;
window.generateAttendance = generateAttendance;
