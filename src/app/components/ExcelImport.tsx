import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, CheckCircle2 as Check, AlertCircle, RefreshCw, Layers, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { DbRow } from '../../types';
import { ColumnMapper, type MappingConfig } from './ColumnMapper';
import { applyTransform } from '../../lib/transformers';
import { useLocalStorage } from '../../hooks/useLocalStorage';

export interface ImportConfig {
    key: string;
    entityLabel: string;
    schema: unknown;
    validate: (data: DbRow[]) => boolean;
    getValidationErrors: (data: DbRow[]) => string[];
    importFn: (data: DbRow[]) => Promise<void>;
    clearFn?: () => Promise<void>;
}

interface ExcelImportProps {
    config?: ImportConfig;
    onImportComplete?: () => void;
}

interface TargetSchema {
    properties: Record<string, { description?: string; type?: string }>;
    required?: string[];
}

export const ExcelImport: React.FC<ExcelImportProps> = ({ config, onImportComplete }) => {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');
    const [isMappingOpen, setIsMappingOpen] = useState(false);
    const [pendingData, setPendingData] = useState<DbRow[] | null>(null);
    const [pendingSourceColumns, setPendingSourceColumns] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [savedMappings, setSavedMappings] = useLocalStorage<Record<string, Record<string, MappingConfig>>>('excel_mappings_v2', {});

    const getTargetSchema = useCallback((): TargetSchema | null => {
        if (!config?.schema || typeof config.schema !== 'object') return null;
        const maybeSchema = config.schema as Partial<TargetSchema>;
        if (!maybeSchema.properties || typeof maybeSchema.properties !== 'object') return null;
        return {
            properties: maybeSchema.properties,
            required: Array.isArray(maybeSchema.required) ? maybeSchema.required : []
        };
    }, [config]);

    const applyMappingToRows = useCallback((rows: DbRow[], mapping: Record<string, MappingConfig>, schema: TargetSchema): DbRow[] => {
        const targetFields = Object.keys(schema.properties);
        const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

        return rows.map((row) => {
            const mappedRow: DbRow = {};

            targetFields.forEach((targetField) => {
                const cfg = mapping[targetField];
                if (!cfg?.sourceColumn) return;

                let value: unknown;

                if (cfg.sourceColumn === '__CONSTANT__') {
                    value = cfg.constantValue ?? '';
                } else {
                    const primary = row[cfg.sourceColumn];
                    const secondary = cfg.secondaryColumn ? row[cfg.secondaryColumn] : undefined;

                    switch (cfg.operation) {
                        case 'coalesce':
                            value = !isEmpty(primary) ? primary : secondary;
                            break;
                        case 'concat': {
                            const parts = [primary, secondary]
                                .filter((part) => !isEmpty(part))
                                .map((part) => String(part));
                            value = parts.join(cfg.separator ?? ' ');
                            break;
                        }
                        case 'direct':
                        default:
                            value = primary;
                            break;
                    }
                }

                if (cfg.transformId) {
                    value = applyTransform(value, cfg.transformId, targetField);
                }

                mappedRow[targetField] = value;
            });

            return mappedRow;
        });
    }, []);

    const executeImport = useCallback(async (rowsToImport: DbRow[]) => {
        if (!config) return;

        if (rowsToImport.length === 0) {
            setError(t('datasource.excel_import.no_valid_data'));
            return;
        }

        if (importMode === 'overwrite' && config.clearFn) {
            await config.clearFn();
        }

        await config.importFn(rowsToImport);

        setSuccess(t('datasource.excel_import.success_msg', { count: rowsToImport.length }));
        if (onImportComplete) onImportComplete();

        // Trigger global sync for counters
        window.dispatchEvent(new Event('db-updated'));
    }, [config, importMode, onImportComplete, t]);

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
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as DbRow[];

            if (jsonData.length === 0) {
                setError(t('datasource.excel_import.no_data'));
                return;
            }

            const sourceColumns = Object.keys(jsonData[0] ?? {});
            const targetSchema = getTargetSchema();

            if (targetSchema) {
                setPendingData(jsonData);
                setPendingSourceColumns(sourceColumns);
                setIsMappingOpen(true);
                return;
            }

            await executeImport(jsonData);

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setError(t('datasource.excel_import.error_reading', { error: message }));
        } finally {
            setIsProcessing(false);
        }
    }, [config, executeImport, getTargetSchema, t]);

    const handleMappingConfirm = useCallback(async (mapping: Record<string, MappingConfig>) => {
        if (!config || !pendingData) return;

        const targetSchema = getTargetSchema();
        if (!targetSchema) return;

        setIsMappingOpen(false);
        setIsProcessing(true);
        setError(null);
        setSuccess(null);

        try {
            const mappedRows = applyMappingToRows(pendingData, mapping, targetSchema);
            setSavedMappings((prev) => ({ ...prev, [config.key]: mapping }));
            await executeImport(mappedRows);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setError(t('datasource.excel_import.import_failed', { error: message }));
        } finally {
            setPendingData(null);
            setPendingSourceColumns([]);
            setIsProcessing(false);
        }
    }, [applyMappingToRows, config, executeImport, getTargetSchema, pendingData, setSavedMappings, t]);

    const handleMappingCancel = useCallback(() => {
        setIsMappingOpen(false);
        setPendingData(null);
        setPendingSourceColumns([]);
    }, []);

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
                <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl flex items-start gap-3 text-red-600 text-xs animate-in slide-in-from-top-2 relative">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-black uppercase tracking-widest text-[10px] mb-1">{t('common.error')}</p>
                        <p className="font-medium leading-relaxed">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {success && (
                <div className="p-4 bg-emerald-50 border-2 border-emerald-100 rounded-2xl flex items-start gap-3 text-emerald-600 text-xs animate-in slide-in-from-top-2 relative">
                    <Check className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-black uppercase tracking-widest text-[10px] mb-1">{t('common.success')}</p>
                        <p className="font-medium leading-relaxed">{success}</p>
                    </div>
                    <button onClick={() => setSuccess(null)} className="p-1 hover:bg-emerald-100 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {isMappingOpen && config && getTargetSchema() && (
                <ColumnMapper
                    sourceColumns={pendingSourceColumns}
                    targetSchema={getTargetSchema()!}
                    initialMapping={savedMappings[config.key]}
                    onConfirm={(mapping) => { void handleMappingConfirm(mapping); }}
                    onCancel={handleMappingCancel}
                />
            )}
        </div>
    );
};
