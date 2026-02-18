import { useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface UseReportExportResult {
    isExporting: boolean;
    exportToPdf: (elementId: string, filename: string, orientation?: 'portrait' | 'landscape') => Promise<void>;
    exportToImage: (elementId: string, filename: string) => Promise<void>;
}

export const useReportExport = (): UseReportExportResult => {
    const [isExporting, setIsExporting] = useState(false);

    const exportToPdf = async (elementId: string, filename: string, orientation: 'portrait' | 'landscape' = 'landscape') => {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`Element with id ${elementId} not found`);
            return;
        }

        setIsExporting(true);

        try {
            // Wait a moment for any rendering to finish
            await new Promise(resolve => setTimeout(resolve, 500));

            // Clone the element to render it fully expanded (without scrollbars)
            const clone = element.cloneNode(true) as HTMLElement;

            // Style the clone to ensure full visibility and simple positioning
            clone.style.position = 'fixed';
            clone.style.top = '0';
            clone.style.left = '200vw'; // Position strictly off-screen to the right
            clone.style.width = `${element.scrollWidth}px`;
            // Unset height to allow auto-expansion
            clone.style.height = 'auto';
            clone.style.minHeight = `${element.scrollHeight}px`;
            clone.style.overflow = 'visible';
            clone.style.zIndex = '-1';
            clone.style.padding = '20px'; // Add padding to prevent clipping of shadows/edges
            clone.style.backgroundColor = '#ffffff';
            clone.style.boxSizing = 'border-box';
            clone.style.margin = '0';

            // Remove any potential scrollbars from children in the clone
            const scrollables = clone.querySelectorAll('.overflow-auto, .overflow-y-auto, .overflow-x-auto');
            scrollables.forEach(el => {
                (el as HTMLElement).style.overflow = 'visible';
                (el as HTMLElement).style.height = 'auto';
            });

            document.body.appendChild(clone);

            const canvas = await html2canvas(clone, {
                scale: 2, // Higher scale for better quality
                useCORS: true, // Enable cross-origin images
                logging: false,
                backgroundColor: '#ffffff', // Ensure white background
                width: clone.offsetWidth, // Use rendered offsetWidth (includes padding)
                height: clone.offsetHeight, // Use rendered offsetHeight
                scrollX: 0, // Reset scroll position for capture
                scrollY: 0,
                x: 0, // Explicitly capture from 0,0 relative to the element (which is at left: 200vw, but h2c handles element context)
                y: 0
            });

            // Cleanup
            document.body.removeChild(clone);

            const imgData = canvas.toDataURL('image/png');

            // Calculate PDF dimensions
            const pdf = new jsPDF({
                orientation: orientation,
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            // Fit image to PDF page
            const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);

            const finalWidth = imgWidth * ratio;
            const finalHeight = imgHeight * ratio;

            // Center image
            const x = (pdfWidth - finalWidth) / 2;
            const y = (pdfHeight - finalHeight) / 2;

            pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
            pdf.save(`${filename}.pdf`);

        } catch (error) {
            console.error('Export failed:', error);
            alert('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
        } finally {
            setIsExporting(false);
        }
    };

    const exportToImage = async (elementId: string, filename: string) => {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`Element with id ${elementId} not found`);
            return;
        }

        setIsExporting(true);

        try {
            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

        } catch (error) {
            console.error('Export failed:', error);
            alert('Export fehlgeschlagen.');
        } finally {
            setIsExporting(false);
        }
    };

    return { isExporting, exportToPdf, exportToImage };
};
