import { useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useTranslation } from 'react-i18next';

interface ExportItem {
    elementId: string;
    title: string;
    subtitle?: string;
    orientation?: 'portrait' | 'landscape';
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
}

interface UseReportExportResult {
    isExporting: boolean;
    exportProgress: number;
    exportToPdf: (elementId: string, filename: string, orientation?: 'portrait' | 'landscape') => Promise<void>;
    exportPackageToPdf: (filename: string, items: ExportItem[], coverData?: CoverData, options?: ExportPackageOptions) => Promise<void>;
    exportToImage: (elementId: string, filename: string) => Promise<void>;
}

export const useReportExport = (): UseReportExportResult => {
    const { t } = useTranslation();
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
        }

        if (showFooter) {
            pdf.setFontSize(9);
            pdf.setTextColor(130, 130, 130);
            const left = options?.footerText || `${t('reports.generated_on')}: ${new Date().toLocaleDateString()}`;
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
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const exportPackageToPdf = async (filename: string, items: ExportItem[], coverData?: CoverData, options?: ExportPackageOptions) => {
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
                        console.warn('Cover logo could not be loaded for PDF export. The host likely blocks cross-origin image access.', logoError);
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

            pdf.save(`${filename}.pdf`);
        } catch (error) {
            console.error('Batch Export failed:', error);
            alert(t('reports.export_failed', 'Export failed.'));
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
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    return { isExporting, exportProgress, exportToPdf, exportPackageToPdf, exportToImage };
};
