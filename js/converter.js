/* ============================================
   PDF Tools - Converter Functions
   Additional conversion utilities
   ============================================ */

// Set PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ============================================
// PDF TO TEXT
// ============================================
async function pdfToText(files) {
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;
    const totalPages = pdf.numPages;

    let fullText = '';

    for (let i = 1; i <= totalPages; i++) {
        showProgress((i / totalPages) * 90);

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');

        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    showProgress(100);

    const blob = new Blob([fullText], { type: 'text/plain' });
    showResult(blob, 'extracted_text.txt');
}

// ============================================
// TEXT TO PDF
// ============================================
async function textToPDF(files) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    showProgress(30);

    const text = await files[0].file.text();
    const lines = text.split('\n');

    const margin = 20;
    const lineHeight = 7;
    const pageHeight = 280;
    let y = margin;

    pdf.setFont('helvetica');
    pdf.setFontSize(11);

    for (let i = 0; i < lines.length; i++) {
        showProgress(30 + (i / lines.length) * 60);

        const line = lines[i];

        // Word wrap long lines
        const splitLines = pdf.splitTextToSize(line, 170);

        for (const splitLine of splitLines) {
            if (y > pageHeight) {
                pdf.addPage();
                y = margin;
            }

            pdf.text(splitLine, margin, y);
            y += lineHeight;
        }
    }

    showProgress(100);

    const pdfBlob = pdf.output('blob');
    showResult(pdfBlob, 'document.pdf');
}

// ============================================
// HTML TO PDF
// ============================================
async function htmlToPDF(files) {
    const { jsPDF } = window.jspdf;

    showProgress(30);

    const htmlContent = await files[0].file.text();

    // Create a temporary container to render HTML
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.width = '800px';
    container.style.padding = '20px';
    container.style.background = 'white';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    showProgress(50);

    // Use html2canvas if available, otherwise use basic text extraction
    if (typeof html2canvas !== 'undefined') {
        const canvas = await html2canvas(container);
        const imgData = canvas.toDataURL('image/png');

        const pdf = new jsPDF({
            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [canvas.width, canvas.height]
        });

        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);

        showProgress(100);
        document.body.removeChild(container);

        const pdfBlob = pdf.output('blob');
        showResult(pdfBlob, 'webpage.pdf');
    } else {
        // Fallback: extract text only
        const text = container.textContent || container.innerText;
        document.body.removeChild(container);

        const pdf = new jsPDF();
        const lines = pdf.splitTextToSize(text, 180);

        let y = 20;
        for (const line of lines) {
            if (y > 280) {
                pdf.addPage();
                y = 20;
            }
            pdf.text(line, 15, y);
            y += 7;
        }

        showProgress(100);

        const pdfBlob = pdf.output('blob');
        showResult(pdfBlob, 'webpage.pdf');
    }
}

// ============================================
// MARKDOWN TO PDF
// ============================================
async function markdownToPDF(files) {
    const { jsPDF } = window.jspdf;

    showProgress(20);

    const mdContent = await files[0].file.text();

    // Simple Markdown to HTML conversion
    let html = mdContent
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold and Italic
        .replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        // Code blocks
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        // Lists
        .replace(/^\- (.*$)/gim, '• $1')
        .replace(/^\d+\. (.*$)/gim, '$1')
        // Links
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)')
        // Line breaks
        .replace(/\n\n/g, '\n\n')
        .replace(/\n/g, '\n');

    showProgress(50);

    const pdf = new jsPDF();
    const lines = html.split('\n');

    let y = 20;
    pdf.setFont('helvetica');

    for (const line of lines) {
        if (y > 280) {
            pdf.addPage();
            y = 20;
        }

        // Handle headers
        if (line.includes('<h1>')) {
            pdf.setFontSize(24);
            pdf.setFont('helvetica', 'bold');
            const text = line.replace(/<\/?h1>/g, '');
            pdf.text(text, 15, y);
            y += 15;
        } else if (line.includes('<h2>')) {
            pdf.setFontSize(18);
            pdf.setFont('helvetica', 'bold');
            const text = line.replace(/<\/?h2>/g, '');
            pdf.text(text, 15, y);
            y += 12;
        } else if (line.includes('<h3>')) {
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            const text = line.replace(/<\/?h3>/g, '');
            pdf.text(text, 15, y);
            y += 10;
        } else {
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'normal');
            const text = line.replace(/<[^>]*>/g, '');
            const splitLines = pdf.splitTextToSize(text, 180);
            for (const splitLine of splitLines) {
                if (y > 280) {
                    pdf.addPage();
                    y = 20;
                }
                pdf.text(splitLine, 15, y);
                y += 7;
            }
        }
    }

    showProgress(100);

    const pdfBlob = pdf.output('blob');
    showResult(pdfBlob, 'markdown.pdf');
}

// ============================================
// PDF TO WORD (Basic - extracts text)
// ============================================
async function pdfToWord(files) {
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;
    const totalPages = pdf.numPages;

    // Create basic HTML structure for Word
    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
    .page { margin-bottom: 40px; page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  </style>
</head>
<body>
`;

    for (let i = 1; i <= totalPages; i++) {
        showProgress((i / totalPages) * 90);

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        htmlContent += `<div class="page">`;

        let lastY = null;
        for (const item of textContent.items) {
            // Detect paragraph breaks based on Y position
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 20) {
                htmlContent += '<br><br>';
            }
            htmlContent += item.str + ' ';
            lastY = item.transform[5];
        }

        htmlContent += `</div>`;
    }

    htmlContent += '</body></html>';

    showProgress(100);

    // Save as HTML (can be opened in Word)
    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-word' });
    showResult(blob, 'document.doc');

    PDFTools.showToast('info', 'Note', 'For best results, open the file in Word and save as DOCX');
}

// ============================================
// PDF TO EXCEL (Basic - extracts tables)
// ============================================
async function pdfToExcel(files) {
    const fileData = await files[0].file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;
    const totalPages = pdf.numPages;

    let csvContent = '';

    for (let i = 1; i <= totalPages; i++) {
        showProgress((i / totalPages) * 90);

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Group items by Y position to detect rows
        const rows = {};
        for (const item of textContent.items) {
            const y = Math.round(item.transform[5]);
            if (!rows[y]) rows[y] = [];
            rows[y].push({ x: item.transform[4], text: item.str });
        }

        // Sort rows by Y (top to bottom)
        const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);

        for (const y of sortedYs) {
            // Sort items in row by X position
            const rowItems = rows[y].sort((a, b) => a.x - b.x);
            const rowText = rowItems.map(item => `"${item.text.replace(/"/g, '""')}"`).join(',');
            csvContent += rowText + '\n';
        }

        csvContent += '\n'; // Page separator
    }

    showProgress(100);

    const blob = new Blob([csvContent], { type: 'text/csv' });
    showResult(blob, 'spreadsheet.csv');

    PDFTools.showToast('info', 'Note', 'Open the CSV file in Excel for best results');
}

// ============================================
// COMPRESS PDF (Optimized)
// ============================================
async function compressPDF(files) {
    const { PDFDocument } = PDFLib;

    showProgress(20);

    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData, { ignoreEncryption: true });

    showProgress(50);

    // Remove metadata to reduce size
    pdf.setTitle('');
    pdf.setAuthor('');
    pdf.setSubject('');
    pdf.setKeywords([]);
    pdf.setProducer('');
    pdf.setCreator('');

    showProgress(70);

    // Save with compression options
    const compressedBytes = await pdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 100
    });

    showProgress(100);

    const originalSize = files[0].file.size;
    const newSize = compressedBytes.length;
    const reduction = Math.round((1 - newSize / originalSize) * 100);

    const blob = new Blob([compressedBytes], { type: 'application/pdf' });
    showResult(blob, 'compressed.pdf');

    if (reduction > 0) {
        PDFTools.showToast('success', 'Compressed!', `Reduced by ${reduction}% (${PDFTools.formatFileSize(originalSize)} → ${PDFTools.formatFileSize(newSize)})`);
    } else {
        PDFTools.showToast('info', 'Note', 'File was already optimized. Minimal compression achieved.');
    }
}

// ============================================
// UNLOCK PDF
// ============================================
async function unlockPDF(files) {
    const { PDFDocument } = PDFLib;
    const password = document.getElementById('currentPassword')?.value;

    showProgress(30);

    try {
        const fileData = await files[0].file.arrayBuffer();
        const pdf = await PDFDocument.load(fileData, {
            password: password,
            ignoreEncryption: true
        });

        showProgress(70);

        const pdfBytes = await pdf.save();

        showProgress(100);

        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(blob, 'unlocked.pdf');
    } catch (error) {
        if (error.message.includes('password')) {
            throw new Error('Incorrect password. Please try again.');
        }
        throw error;
    }
}

// ============================================
// ADD BLANK PAGES
// ============================================
async function addBlankPages(files) {
    const { PDFDocument, PageSizes } = PDFLib;

    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);

    const position = document.getElementById('blankPosition')?.value || 'end';
    const count = parseInt(document.getElementById('blankCount')?.value) || 1;
    const pageSize = document.getElementById('blankSize')?.value || 'a4';

    showProgress(50);

    const sizes = {
        'a4': PageSizes.A4,
        'letter': PageSizes.Letter,
        'legal': PageSizes.Legal
    };

    const size = sizes[pageSize] || PageSizes.A4;

    for (let i = 0; i < count; i++) {
        if (position === 'start') {
            pdf.insertPage(i, size);
        } else {
            pdf.addPage(size);
        }
    }

    showProgress(90);

    const pdfBytes = await pdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'modified.pdf');

    PDFTools.showToast('success', 'Done', `Added ${count} blank page(s)`);
}

// ============================================
// DUPLICATE PAGES
// ============================================
async function duplicatePages(files) {
    const { PDFDocument } = PDFLib;

    const fileData = await files[0].file.arrayBuffer();
    const pdf = await PDFDocument.load(fileData);
    const totalPages = pdf.getPageCount();

    const rangeStr = document.getElementById('duplicateRange')?.value || '1';
    const pageNums = parsePageRanges(rangeStr, totalPages);

    showProgress(50);

    for (const pageNum of pageNums) {
        const [copiedPage] = await pdf.copyPages(pdf, [pageNum - 1]);
        pdf.insertPage(pageNum, copiedPage); // Insert after original
    }

    showProgress(90);

    const pdfBytes = await pdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'duplicated.pdf');
}

// ============================================
// REORDER PAGES
// ============================================
async function reorderPages(files) {
    const { PDFDocument } = PDFLib;

    const fileData = await files[0].file.arrayBuffer();
    const srcPdf = await PDFDocument.load(fileData);
    const totalPages = srcPdf.getPageCount();

    const orderStr = document.getElementById('pageOrder')?.value || '';
    if (!orderStr.trim()) {
        throw new Error('Please specify the new page order (e.g., 3,1,2)');
    }

    const newOrder = orderStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= totalPages);

    if (newOrder.length === 0) {
        throw new Error('Invalid page order specified');
    }

    showProgress(50);

    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(srcPdf, newOrder.map(n => n - 1));
    pages.forEach(page => newPdf.addPage(page));

    showProgress(90);

    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showProgress(100);
    showResult(blob, 'reordered.pdf');
}

// Export additional functions
window.pdfToText = pdfToText;
window.textToPDF = textToPDF;
window.htmlToPDF = htmlToPDF;
window.markdownToPDF = markdownToPDF;
window.pdfToWord = pdfToWord;
window.pdfToExcel = pdfToExcel;
window.compressPDF = compressPDF;
window.unlockPDF = unlockPDF;
window.addBlankPages = addBlankPages;
window.duplicatePages = duplicatePages;
window.reorderPages = reorderPages;
