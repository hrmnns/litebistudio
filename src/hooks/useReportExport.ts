import { useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useTranslation } from 'react-i18next';
import { createLogger } from '../lib/logger';
import { appDialog } from '../lib/appDialog';

interface ExportItem {
    elementId: string;
    title: string;
    subtitle?: string;
    orientation?: 'portrait' | 'landscape';
    status?: 'ok' | 'warning' | 'critical' | 'info';
    threshold?: string;
}

interface CoverData {
    title: string;
    subtitle?: string;
    author?: string;
    logoUrl?: string;
    themeColor?: string;
}

interface ExportPackageOptions {
    showHeader?: boolean;
    showFooter?: boolean;
    headerText?: string;
    footerText?: string;
    footerMode?: 'all' | 'content_only';
    dataAsOf?: string;
    includeAuditAppendix?: boolean;
}

interface ExportAuditMeta {
    packName: string;
    generatedAt?: string;
    dataAsOf?: string;
    sqlSources?: Array<{ source: string; sql: string }>;
}

interface UseReportExportResult {
    isExporting: boolean;
    exportProgress: number;
    exportToPdf: (elementId: string, filename: string, orientation?: 'portrait' | 'landscape') => Promise<void>;
    exportPackageToPdf: (filename: string, items: ExportItem[], coverData?: CoverData, options?: ExportPackageOptions, auditMeta?: ExportAuditMeta) => Promise<void>;
    exportPackageToHtml: (filename: string, items: ExportItem[], coverData?: CoverData, options?: ExportPackageOptions, auditMeta?: ExportAuditMeta) => Promise<void>;
    exportPackageToPpt: (filename: string, items: ExportItem[], coverData?: CoverData, options?: ExportPackageOptions, auditMeta?: ExportAuditMeta) => Promise<void>;
    exportToImage: (elementId: string, filename: string) => Promise<void>;
}

export const useReportExport = (): UseReportExportResult => {
    const { t } = useTranslation();
    const logger = createLogger('ReportExport');
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    const hexToRgb = (hex: string): [number, number, number] => {
        const clean = hex.replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [30, 41, 59];
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        return [r, g, b];
    };

    const blobToDataUrl = (blob: Blob): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read image blob'));
            reader.readAsDataURL(blob);
        });

    const getImageFormat = (mimeType: string, url: string): 'PNG' | 'JPEG' | 'WEBP' => {
        const mime = mimeType.toLowerCase();
        if (mime.includes('jpeg') || mime.includes('jpg')) return 'JPEG';
        if (mime.includes('webp')) return 'WEBP';
        if (mime.includes('png')) return 'PNG';

        const lowerUrl = url.toLowerCase();
        if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) return 'JPEG';
        if (lowerUrl.endsWith('.webp')) return 'WEBP';
        return 'PNG';
    };

    const loadImageForPdf = async (url: string): Promise<{ data: string; format: 'PNG' | 'JPEG' | 'WEBP' }> => {
        if (url.startsWith('data:image/')) {
            const format = url.includes('image/jpeg') || url.includes('image/jpg')
                ? 'JPEG'
                : url.includes('image/webp')
                    ? 'WEBP'
                    : 'PNG';
            return { data: url, format };
        }

        // Remote URLs require CORS-enabled hosts to be readable in browser context.
        const response = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
        if (!response.ok) {
            throw new Error(`Image request failed with status ${response.status}`);
        }
        const blob = await response.blob();
        const format = getImageFormat(blob.type, url);
        const data = await blobToDataUrl(blob);
        return { data, format };
    };

    const drawHeaderFooter = (
        pdf: jsPDF,
        item: ExportItem,
        pageNumber: number,
        totalPages: number,
        options?: ExportPackageOptions
    ) => {
        const showHeader = options?.showHeader ?? true;
        const showFooter = options?.showFooter ?? true;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        if (showHeader) {
            pdf.setFontSize(10);
            pdf.setTextColor(120, 120, 120);
            pdf.text(options?.headerText || item.title, 10, 10);
            pdf.line(10, 12, pageWidth - 10, 12);
            if (item.status && item.status !== 'info') {
                const statusLabel = item.status.toUpperCase();
                pdf.setFontSize(8);
                const badgeColor = item.status === 'critical' ? [220, 38, 38] : item.status === 'warning' ? [217, 119, 6] : [5, 150, 105];
                pdf.setTextColor(badgeColor[0], badgeColor[1], badgeColor[2]);
                pdf.text(statusLabel, pageWidth - 10, 10, { align: 'right' });
            }
        }

        if (showFooter) {
            pdf.setFontSize(9);
            pdf.setTextColor(130, 130, 130);
            const asOf = options?.dataAsOf?.trim();
            const left = options?.footerText || (asOf ? `${t('reports.data_as_of', 'Data as of')}: ${asOf}` : `${t('reports.generated_on')}: ${new Date().toLocaleDateString()}`);
            pdf.text(left, 10, pageHeight - 8);
            const right = `${pageNumber}/${totalPages}`;
            pdf.text(right, pageWidth - 10, pageHeight - 8, { align: 'right' });
        }
    };

    const captureElement = async (elementId: string, cloneWidth?: number): Promise<{ imgData: string; width: number; height: number } | null> => {
        const element = document.getElementById(elementId);
        if (!element) return null;

        const clone = element.cloneNode(true) as HTMLElement;
        clone.style.position = 'fixed';
        clone.style.top = '0';
        clone.style.left = '500vw'; // Very far away
        clone.style.width = cloneWidth ? `${cloneWidth}px` : `${element.scrollWidth || 1200}px`;
        clone.style.height = 'auto';
        clone.style.minHeight = `${element.scrollHeight || 800}px`;
        clone.style.overflow = 'visible';
        clone.style.zIndex = '-100';
        clone.style.padding = '40px';
        clone.style.backgroundColor = '#ffffff';

        // Fix scrollables
        const scrollables = clone.querySelectorAll('.overflow-auto, .overflow-y-auto, .overflow-x-auto');
        scrollables.forEach(el => {
            (el as HTMLElement).style.overflow = 'visible';
            (el as HTMLElement).style.height = 'auto';
        });

        // html2canvas can clip descenders on tightly styled/truncated headers.
        // Relax text constraints in the export clone only.
        const textCandidates = clone.querySelectorAll('h1, h2, h3, h4, h5, h6, .truncate');
        textCandidates.forEach(el => {
            const node = el as HTMLElement;
            node.style.overflow = 'visible';
            node.style.textOverflow = 'clip';
            node.style.lineHeight = '1.35';
            node.style.paddingBottom = '2px';
        });

        document.body.appendChild(clone);

        // Wait for rendering
        await new Promise(resolve => setTimeout(resolve, 800));
        // Ensure webfonts are loaded before rasterizing text into canvas.
        if ('fonts' in document) {
            await (document as Document & { fonts: FontFaceSet }).fonts.ready;
        }

        const canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: clone.offsetWidth,
            height: clone.offsetHeight
        });

        document.body.removeChild(clone);

        return {
            imgData: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height
        };
    };

    const exportToPdf = async (elementId: string, filename: string, orientation: 'portrait' | 'landscape' = 'landscape') => {
        setIsExporting(true);
        setExportProgress(0);
        try {
            const captured = await captureElement(elementId);
            if (!captured) return;

            const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const ratio = Math.min(pdfWidth / (captured.width / 2), pdfHeight / (captured.height / 2));
            const finalWidth = (captured.width / 2) * ratio;
            const finalHeight = (captured.height / 2) * ratio;

            pdf.addImage(captured.imgData, 'PNG', (pdfWidth - finalWidth) / 2, (pdfHeight - finalHeight) / 2, finalWidth, finalHeight);
            pdf.save(`${filename}.pdf`);
        } catch (error) {
            logger.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const exportPackageToPdf = async (filename: string, items: ExportItem[], coverData?: CoverData, options?: ExportPackageOptions, auditMeta?: ExportAuditMeta) => {
        setIsExporting(true);
        setExportProgress(0);
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        try {
            // 1. Cover Page
            if (coverData) {
                const [r, g, b] = coverData.themeColor ? hexToRgb(coverData.themeColor) : [30, 41, 59];
                pdf.setFillColor(r, g, b);
                pdf.rect(0, 0, 210, 297, 'F');

                pdf.setTextColor(255, 255, 255);
                pdf.setFontSize(32);
                pdf.text(coverData.title, 20, 100);

                if (coverData.subtitle) {
                    pdf.setFontSize(16);
                    pdf.setTextColor(148, 163, 184); // Slate-400
                    pdf.text(coverData.subtitle, 20, 115);
                }

                pdf.setFontSize(12);
                pdf.setTextColor(100, 116, 139); // Slate-500
                pdf.text(`${t('reports.generated_on')}: ${new Date().toLocaleDateString()}`, 20, 260);
                if (coverData.author) pdf.text(`${t('reports.author_prefix')}: ${coverData.author}`, 20, 267);
                if (coverData.logoUrl) {
                    try {
                        const logo = await loadImageForPdf(coverData.logoUrl);
                        const logoSize = 30;
                        const rightMargin = 20;
                        const logoX = 210 - rightMargin - logoSize;
                        pdf.addImage(logo.data, logo.format, logoX, 25, logoSize, logoSize);
                    } catch (logoError) {
                        logger.warn('Cover logo could not be loaded for PDF export. The host likely blocks cross-origin image access.', logoError);
                    }
                }

                pdf.addPage();
            }

            // 2. Capture items
            const contentStartPage = coverData ? 2 : 1;
            const totalPages = (coverData ? 1 : 0) + items.length;
            for (let i = 0; i < items.length; i++) {
                setExportProgress(Math.round(((i + 1) / items.length) * 100));
                const item = items[i];
                const captured = await captureElement(item.elementId, item.orientation === 'landscape' ? 1400 : 1000);

                if (captured) {
                    const orientation = item.orientation || 'portrait';
                    if (i > 0 || coverData) pdf.addPage(undefined, orientation);

                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();

                    if ((options?.footerMode ?? 'all') === 'all' || (options?.footerMode ?? 'all') === 'content_only') {
                        drawHeaderFooter(pdf, item, contentStartPage + i, totalPages, options);
                    }

                    const topOffset = options?.showHeader === false ? 12 : 20;
                    const bottomPadding = options?.showFooter === false ? 12 : 18;
                    const ratio = Math.min((pdfWidth - 20) / (captured.width / 2), (pdfHeight - (topOffset + bottomPadding)) / (captured.height / 2));
                    const finalWidth = (captured.width / 2) * ratio;
                    const finalHeight = (captured.height / 2) * ratio;

                    pdf.addImage(captured.imgData, 'PNG', (pdfWidth - finalWidth) / 2, topOffset, finalWidth, finalHeight);
                }
            }

            if (options?.includeAuditAppendix) {
                pdf.addPage();
                pdf.setFontSize(18);
                pdf.setTextColor(30, 41, 59);
                pdf.text(t('reports.audit_appendix_title', 'Audit Appendix'), 14, 18);
                pdf.setFontSize(10);
                pdf.setTextColor(71, 85, 105);
                const lines: string[] = [];
                lines.push(`${t('reports.pack_name', 'Package')}: ${auditMeta?.packName || filename}`);
                lines.push(`${t('reports.generated_on')}: ${auditMeta?.generatedAt || new Date().toISOString()}`);
                if (auditMeta?.dataAsOf || options?.dataAsOf) {
                    lines.push(`${t('reports.data_as_of', 'Data as of')}: ${auditMeta?.dataAsOf || options?.dataAsOf}`);
                }
                lines.push(`${t('reports.pages', 'Pages')}: ${items.length}`);
                lines.push('');
                lines.push(`${t('reports.audit_sql_sources', 'SQL Sources')}:`);
                const sources = auditMeta?.sqlSources || [];
                if (!sources.length) {
                    lines.push(`- ${t('common.no_data', 'No data')}`);
                } else {
                    sources.forEach((entry) => {
                        lines.push(`- ${entry.source}`);
                        const sqlSingleLine = entry.sql.replace(/\s+/g, ' ').trim();
                        lines.push(`  ${sqlSingleLine.slice(0, 1800)}`);
                    });
                }
                const wrapped = pdf.splitTextToSize(lines.join('\n'), 180);
                pdf.text(wrapped, 14, 28);
            }

            pdf.save(`${filename}.pdf`);
        } catch (error) {
            logger.error('Batch Export failed:', error);
            await appDialog.error(t('reports.export_failed', 'Export failed.'));
        } finally {
            setIsExporting(false);
            setExportProgress(0);
        }
    };

    const exportPackageToHtml = async (filename: string, items: ExportItem[], coverData?: CoverData, options?: ExportPackageOptions, auditMeta?: ExportAuditMeta) => {
        setIsExporting(true);
        setExportProgress(0);
        try {
            const pages: Array<{ title: string; image: string; status?: ExportItem['status']; threshold?: string; subtitle?: string }> = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const captured = await captureElement(item.elementId, item.orientation === 'landscape' ? 1400 : 1000);
                if (captured) {
                    pages.push({ title: item.title, image: captured.imgData, status: item.status, threshold: item.threshold, subtitle: item.subtitle });
                }
                setExportProgress(Math.round(((i + 1) / Math.max(items.length, 1)) * 100));
            }

            const esc = (value: string): string =>
                value
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

            const generatedAt = new Date().toLocaleString();
            const headerText = options?.headerText?.trim() || coverData?.title || filename;
            const footerText = options?.footerText?.trim() || `${t('reports.generated_on')}: ${generatedAt}`;
            const pagesNav = pages
                .map((page, index) => `<button class="nav-btn${index === 0 ? ' active' : ''}" data-page="${index}">${index + 1}. ${esc(page.title)}</button>`)
                .join('');
            const pagesHtml = pages
                .map((page, index) => `
                <section class="report-page${index === 0 ? ' active' : ''}" data-page="${index}">
                    ${(options?.showHeader ?? true) ? `<header class="page-header">${esc(headerText)}</header>` : ''}
                    ${(page.status || page.threshold || page.subtitle) ? `<div class="page-context">
                        ${page.status ? `<span class="status status-${page.status}">${esc(page.status.toUpperCase())}</span>` : ''}
                        ${page.threshold ? `<span class="threshold">${esc(page.threshold)}</span>` : ''}
                        ${page.subtitle ? `<span class="comment">${esc(page.subtitle)}</span>` : ''}
                    </div>` : ''}
                    <img src="${page.image}" alt="${esc(page.title)}" class="page-image" />
                    ${(options?.showFooter ?? true) ? `<footer class="page-footer"><span>${esc(footerText)}</span><span>${index + 1}/${Math.max(pages.length, 1)}</span></footer>` : ''}
                </section>
                `)
                .join('');

            const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(filename)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
    .shell { display: grid; grid-template-columns: 280px minmax(0,1fr); min-height: 100vh; }
    .sidebar { border-right: 1px solid #334155; padding: 16px; background: #111827; }
    .title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #94a3b8; margin: 0 0 12px; }
    .nav { display: grid; gap: 8px; }
    .nav-btn { text-align: left; border: 1px solid #334155; background: #0f172a; color: #cbd5e1; border-radius: 8px; padding: 10px; cursor: pointer; font-size: 13px; }
    .nav-btn.active { border-color: #2563eb; background: #1e3a8a33; color: #dbeafe; }
    .content { padding: 20px; background: radial-gradient(circle at top right, #1e293b 0%, #0f172a 60%); }
    .report-page { display: none; max-width: 1200px; margin: 0 auto; background: #ffffff; color: #0f172a; border-radius: 10px; overflow: hidden; box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
    .report-page.active { display: block; }
    .page-header, .page-footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; font-size: 12px; color: #475569; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .page-footer { border-top: 1px solid #e2e8f0; border-bottom: 0; }
    .page-context { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
    .page-image { display: block; width: 100%; height: auto; }
    .status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid #cbd5e1; }
    .status-ok { color: #065f46; background: #d1fae5; border-color: #6ee7b7; }
    .status-warning { color: #92400e; background: #fef3c7; border-color: #fcd34d; }
    .status-critical { color: #991b1b; background: #fee2e2; border-color: #fca5a5; }
    .status-info { color: #1e3a8a; background: #dbeafe; border-color: #93c5fd; }
    .threshold, .comment { font-size: 11px; color: #475569; }
    @media (max-width: 920px) { .shell { grid-template-columns: 1fr; } .sidebar { border-right: 0; border-bottom: 1px solid #334155; } }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <h1 class="title">${esc(coverData?.title || filename)}</h1>
      <p class="meta">${esc(coverData?.subtitle || '')}</p>
      <p class="meta">${esc(`${t('reports.generated_on')}: ${generatedAt}`)}</p>
      ${(auditMeta?.dataAsOf || options?.dataAsOf) ? `<p class="meta">${esc(`${t('reports.data_as_of', 'Data as of')}: ${auditMeta?.dataAsOf || options?.dataAsOf || ''}`)}</p>` : ''}
      ${options?.includeAuditAppendix ? `<p class="meta">${esc(`${t('reports.audit_sql_sources', 'SQL Sources')}: ${(auditMeta?.sqlSources || []).length}`)}</p>` : ''}
      <nav class="nav">${pagesNav || `<span class="meta">${esc(t('common.no_data'))}</span>`}</nav>
    </aside>
    <main class="content">${pagesHtml || ''}</main>
  </div>
  <script>
    const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
    const pages = Array.from(document.querySelectorAll('.report-page'));
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-page');
        navButtons.forEach((b) => b.classList.toggle('active', b === btn));
        pages.forEach((p) => p.classList.toggle('active', p.getAttribute('data-page') === target));
      });
    });
  </script>
</body>
</html>`;

            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const link = document.createElement('a');
            const safeName = filename.trim().replace(/[<>:"/\\|?*]/g, '_') || 'report-package';
            link.download = `${safeName}.html`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) {
            logger.error('HTML export failed:', error);
            await appDialog.error(t('reports.export_failed', 'Export failed.'));
        } finally {
            setIsExporting(false);
            setExportProgress(0);
        }
    };

    const exportPackageToPpt = async (filename: string, items: ExportItem[], coverData?: CoverData, options?: ExportPackageOptions, auditMeta?: ExportAuditMeta) => {
        setIsExporting(true);
        setExportProgress(0);
        try {
            const slides: Array<{ title: string; image: string; status?: ExportItem['status']; threshold?: string }> = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const captured = await captureElement(item.elementId, item.orientation === 'landscape' ? 1400 : 1000);
                if (captured) {
                    slides.push({ title: item.title, image: captured.imgData, status: item.status, threshold: item.threshold });
                }
                setExportProgress(Math.round(((i + 1) / Math.max(items.length, 1)) * 100));
            }

            const esc = (value: string): string =>
                value
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

            const generatedAt = new Date().toLocaleString();
            const footerText = options?.footerText?.trim() || `${t('reports.generated_on')}: ${generatedAt}`;
            const coverTitle = coverData?.title || filename;
            const coverSubtitle = coverData?.subtitle || '';
            const coverAuthor = coverData?.author || '';

            const slideHtml = slides.map((slide, index) => `
                <div class="slide">
                    ${(options?.showHeader ?? true) ? `<div class="header">${esc(slide.title)}</div>` : ''}
                    ${(slide.status || slide.threshold) ? `<div class="context">${slide.status ? esc(slide.status.toUpperCase()) : ''}${slide.threshold ? ` · ${esc(slide.threshold)}` : ''}</div>` : ''}
                    <div class="content"><img src="${slide.image}" alt="${esc(slide.title)}" /></div>
                    ${(options?.showFooter ?? true) ? `<div class="footer"><span>${esc(footerText)}</span><span>${index + 1}/${Math.max(slides.length, 1)}</span></div>` : ''}
                </div>
            `).join('');

            const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(filename)}</title>
  <style>
    @page { size: 13.333in 7.5in; margin: 0; }
    html, body { margin: 0; padding: 0; font-family: Segoe UI, Arial, sans-serif; background: #0f172a; }
    .slide { width: 13.333in; height: 7.5in; background: #ffffff; page-break-after: always; display: flex; flex-direction: column; }
    .slide:last-child { page-break-after: auto; }
    .cover { justify-content: center; background: #1e293b; color: #ffffff; padding: 0.7in; box-sizing: border-box; }
    .cover h1 { margin: 0 0 0.2in; font-size: 42px; }
    .cover p { margin: 0.08in 0; color: #cbd5e1; font-size: 18px; }
    .header, .footer { height: 0.42in; padding: 0 0.35in; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #475569; background: #f8fafc; }
    .context { min-height: 0.28in; padding: 0.04in 0.35in; font-size: 11px; color: #334155; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 0.2in; box-sizing: border-box; background: #ffffff; }
    .content img { max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <div class="slide cover">
    <h1>${esc(coverTitle)}</h1>
    ${coverSubtitle ? `<p>${esc(coverSubtitle)}</p>` : ''}
    ${coverAuthor ? `<p>${esc(coverAuthor)}</p>` : ''}
    <p>${esc(`${t('reports.generated_on')}: ${generatedAt}`)}</p>
    ${(auditMeta?.dataAsOf || options?.dataAsOf) ? `<p>${esc(`${t('reports.data_as_of', 'Data as of')}: ${auditMeta?.dataAsOf || options?.dataAsOf || ''}`)}</p>` : ''}
  </div>
  ${slideHtml}
  ${options?.includeAuditAppendix ? `<div class="slide"><div class="header">${esc(t('reports.audit_appendix_title', 'Audit Appendix'))}</div><div class="content" style="align-items:flex-start; justify-content:flex-start;"><pre style="font-family: Consolas, monospace; font-size: 10px; color: #334155; white-space: pre-wrap;">${esc((auditMeta?.sqlSources || []).map((s) => `${s.source}\n${s.sql}`).join('\n\n') || t('common.no_data', 'No data'))}</pre></div></div>` : ''}
</body>
</html>`;

            const blob = new Blob([html], { type: 'application/vnd.ms-powerpoint' });
            const link = document.createElement('a');
            const safeName = filename.trim().replace(/[<>:"/\\|?*]/g, '_') || 'report-package';
            link.download = `${safeName}.ppt`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) {
            logger.error('PPT export failed:', error);
            await appDialog.error(t('reports.export_failed', 'Export failed.'));
        } finally {
            setIsExporting(false);
            setExportProgress(0);
        }
    };

    const exportToImage = async (elementId: string, filename: string) => {
        setIsExporting(true);
        try {
            const element = document.getElementById(elementId);
            if (!element) return;
            await new Promise(resolve => setTimeout(resolve, 500));
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (error) {
            logger.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    return { isExporting, exportProgress, exportToPdf, exportPackageToPdf, exportPackageToHtml, exportPackageToPpt, exportToImage };
};
