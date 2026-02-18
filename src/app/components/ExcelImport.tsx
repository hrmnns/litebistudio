import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileSpreadsheet, Check, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface ImportConfig {
    key: string;
    entityLabel: string;
    schema: any;
    validate: (data: any[]) => boolean;
    getValidationErrors: (data: any[]) => string[];
    importFn: (data: any[]) => Promise<void>;
    clearFn?: () => Promise<void>;
}

interface ExcelImportProps {
    config?: ImportConfig;
    onImportComplete?: () => void;
}

export const ExcelImport: React.FC<ExcelImportProps> = ({ config, onImportComplete }) => {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        if (!config) return;

        setIsProcessing(true);
        setError(null);
        setSuccess(null);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                setError(t('datasource.excel_import.no_data'));
                return;
            }

            // Transform data (e.g., lowercase keys to match DB if needed, or mapping)
            // Here we assume keys match column names

            if (importMode === 'overwrite' && config.clearFn) {
                await config.clearFn();
            }

            await config.importFn(jsonData);

            setSuccess(t('datasource.excel_import.success_msg', { count: jsonData.length }));
            if (onImportComplete) onImportComplete();

            // Trigger global sync for counters
            window.dispatchEvent(new Event('db-updated'));

        } catch (err: any) {
            setError(t('datasource.excel_import.error_reading', { error: err.message }));
        } finally {
            setIsProcessing(false);
        }
    }, [config, importMode, onImportComplete, t]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, [processFile]);

    if (!config) {
        return (
            <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                <p className="text-slate-400 text-sm">{t('datasource.excel_import.none_selected')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setImportMode('append')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${importMode === 'append' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                >
                    <Layers className="w-3.5 h-3.5" /> {t('datasource.excel_import.append')}
                </button>
                <button
                    onClick={() => setImportMode('overwrite')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${importMode === 'overwrite' ? 'bg-white shadow text-red-600' : 'text-slate-500'}`}
                >
                    <RefreshCw className="w-3.5 h-3.5" /> {t('datasource.excel_import.overwrite')}
                </button>
            </div>

            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                    relative group border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer text-center
                    ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'}
                    ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
                `}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                />

                <div className="flex flex-col items-center gap-3">
                    <div className={`p-3 rounded-xl transition-colors ${isDragging ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600'}`}>
                        <FileSpreadsheet className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-700">{t('datasource.smart_import.upload_label')}</p>
                        <p className="text-xs text-slate-400 mt-1">{t('datasource.excel_import.drop_hint')}</p>
                    </div>
                </div>

                {isProcessing && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-2xl backdrop-blur-[1px]">
                        <div className="flex items-center gap-3 text-blue-600">
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs font-bold">{t('datasource.excel_import.processing_file')}</span>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-xs animate-in slide-in-from-top-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-medium">{error}</span>
                </div>
            )}

            {success && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 text-emerald-600 text-xs animate-in slide-in-from-top-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span className="font-medium">{success}</span>
                </div>
            )}
        </div>
    );
};
