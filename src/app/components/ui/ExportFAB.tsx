import { Printer, FileText } from 'lucide-react';

interface ExportFABProps {
    onPdfExport?: () => void;
    onExcelExport?: () => void;
}

export const ExportFAB: React.FC<ExportFABProps> = ({
    onPdfExport = () => window.print(),
    onExcelExport
}) => {
    return (
        <div className="fixed bottom-8 right-8 z-[100] no-print animate-in slide-in-from-bottom-10 duration-500">
            <div className="flex items-center gap-2 p-1.5 bg-slate-900 dark:bg-white rounded-full shadow-2xl border border-slate-800 dark:border-slate-200">
                {/* PDF Action */}
                <button
                    onClick={onPdfExport}
                    className="group relative flex items-center gap-2 px-4 py-3 bg-transparent text-white dark:text-slate-900 rounded-full hover:bg-slate-800 dark:hover:bg-slate-100 transition-all duration-300"
                    title="Export PDF (Drucken)"
                >
                    <Printer className="w-5 h-5" />
                    <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-500 ease-in-out font-black text-xs uppercase tracking-widest">
                        PDF
                    </span>
                </button>

                {/* Divider if Excel is available */}
                {onExcelExport && (
                    <div className="w-px h-6 bg-slate-700 dark:bg-slate-200 mx-1" />
                )}

                {/* Excel Action */}
                {onExcelExport && (
                    <button
                        onClick={onExcelExport}
                        className="group relative flex items-center gap-2 px-4 py-3 bg-transparent text-white dark:text-slate-900 rounded-full hover:bg-slate-800 dark:hover:bg-slate-100 transition-all duration-300"
                        title="Export Excel (Download)"
                    >
                        <FileText className="w-5 h-5 text-emerald-400 dark:text-emerald-600" />
                        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-500 ease-in-out font-black text-xs uppercase tracking-widest">
                            Excel
                        </span>
                    </button>
                )}

                {/* Visual Accent / Glow */}
                <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-2xl -z-10 pointer-events-none" />
            </div>
        </div>
    );
};
