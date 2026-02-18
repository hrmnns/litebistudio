import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Check, AlertCircle, PlusCircle, RotateCcw } from 'lucide-react';
import { ColumnMapper } from './ColumnMapper';
import type { MappingConfig } from './ColumnMapper';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { applyTransform } from '../../lib/transformers';
import { ImportPreview } from './ImportPreview';

// Generic Import Config Definition
export interface ImportConfig {
    key: string;
    entityLabel: string;
    schema: {
        properties: Record<string, { description?: string; type?: string }>;
        required?: string[];
    };
    validate: (data: any[]) => boolean;
    getValidationErrors: () => string[];
    importFn: (data: any[]) => Promise<void>;
    processRow?: (row: any, index: number) => any; // Post-mapping enrichment
    sheetNameKeyword?: string; // Heuristic to find sheet
    clearFn?: () => Promise<void>;
}

interface ExcelImportProps {
    onImportComplete?: () => void;
    config?: ImportConfig;
}

export const ExcelImport: React.FC<ExcelImportProps> = ({ onImportComplete, config }) => {
    const [isImporting, setIsImporting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'warning'>('idle');
    const [message, setMessage] = useState('');
    const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');

    // Mapping State
    const [mapperOpen, setMapperOpen] = useState(false);
    const [pendingFileColumns, setPendingFileColumns] = useState<string[]>([]);
    const [initialMapping, setInitialMapping] = useState<Record<string, MappingConfig> | undefined>(undefined);
    const [workbookCache, setWorkbookCache] = useState<XLSX.WorkBook | null>(null);

    // Preview State
    const [previewOpen, setPreviewOpen] = useState(false);
    const [dataToPreview, setDataToPreview] = useState<any[]>([]);

    const [savedMappings, setSavedMappings] = useLocalStorage<Record<string, Record<string, MappingConfig>>>('excel_mappings_v2', {});

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setStatus('idle');
        setMessage('Datei wird verarbeitet...');

        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = new Uint8Array(event.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    setWorkbookCache(workbook);
                    await processWorkbook(workbook);
                } catch (err: any) {
                    console.error(err);
                    setStatus('error');
                    setMessage(`Fehler beim Lesen der Datei: ${err.message}`);
                    setIsImporting(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMessage(`Datei konnte nicht geladen werden: ${err.message}`);
            setIsImporting(false);
        }
    };

    const processWorkbook = async (workbook: XLSX.WorkBook, manualMapping?: Record<string, MappingConfig>) => {
        if (!config) {
            setStatus('error');
            setMessage('Keine Import-Konfiguration vorhanden.');
            setIsImporting(false);
            return;
        }

        let targetSheetName = workbook.SheetNames[0];
        if (config.sheetNameKeyword) {
            const match = workbook.SheetNames.find(n => n.toLowerCase().includes(config.sheetNameKeyword!.toLowerCase()));
            if (match) targetSheetName = match;
        }

        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName]);
        if (!rawData || rawData.length === 0) {
            setStatus('error');
            setMessage('Keine Daten in der Datei gefunden.');
            setIsImporting(false);
            return;
        }

        const sheet = workbook.Sheets[targetSheetName];
        const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[];
        const fileColumns = (headerRow || []).filter(h => h && typeof h === 'string');

        if (manualMapping) {
            let mapped = applyMapping(rawData, manualMapping);
            mapped = convertDates(mapped);
            if (config.processRow) {
                mapped = mapped.map((row, i) => config.processRow!(row, i));
            }

            setDataToPreview(mapped);
            setPreviewOpen(true);
            setIsImporting(false);
        } else {
            const mappingKey = [...fileColumns].sort().join('|') + `_${config.key}`;
            const savedMap = savedMappings[mappingKey];
            setPendingFileColumns(fileColumns);
            setInitialMapping(savedMap);
            setMapperOpen(true);
        }
    };

    const handlePreviewConfirm = async () => {
        if (!config) return;
        setPreviewOpen(false);
        setIsImporting(true);
        setMessage('Daten werden importiert...');

        const validData = dataToPreview.filter(row => {
            // Basic type validation for number fields
            for (const [field, prop] of Object.entries(config.schema.properties)) {
                if (prop.type === 'number') {
                    const val = row[field];
                    if (val !== undefined && val !== null && val !== '' && isNaN(Number(val))) return false;
                }
            }
            // Check required fields
            if (config.schema.required) {
                for (const field of config.schema.required) {
                    if (row[field] === undefined || row[field] === null || row[field] === '') return false;
                }
            }
            return true;
        });

        if (validData.length === 0) {
            setStatus('error');
            setMessage('Keine gültigen Daten zum Importieren gefunden.');
            setIsImporting(false);
            return;
        }

        try {
            if (importMode === 'overwrite' && config.clearFn) {
                await config.clearFn();
            }
            await config.importFn(validData);
            finishImport(validData.length);
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMessage(`Import fehlgeschlagen: ${err.message}`);
            setIsImporting(false);
        }
    };

    const finishImport = (count: number) => {
        setStatus('success');
        setMessage(`Erfolgreich ${count} Datensätze importiert.`);
        window.dispatchEvent(new Event('db-updated'));
        window.dispatchEvent(new CustomEvent('db-changed', {
            detail: { type: 'insert', count }
        }));
        if (onImportComplete) onImportComplete();
        setIsImporting(false);
    };

    const convertDates = (data: any[]) => {
        return data.map(row => {
            const newRow = { ...row };
            for (const key in newRow) {
                if (newRow[key] instanceof Date) {
                    newRow[key] = newRow[key].toISOString().split('T')[0];
                } else if (typeof newRow[key] === 'string') {
                    newRow[key] = newRow[key].trim().replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
                }
            }
            return newRow;
        });
    };

    const applyMapping = (data: any[], mapping: Record<string, MappingConfig>) => {
        return data.map(row => {
            const newRow: any = {};
            const mappedSources = Object.values(mapping).map(m => m.sourceColumn);
            Object.keys(row).forEach(key => {
                if (!mappedSources.includes(key)) newRow[key] = row[key];
            });

            Object.entries(mapping).forEach(([targetField, config]) => {
                if (config.sourceColumn === '__CONSTANT__') {
                    newRow[targetField] = config.constantValue || (config.transformId ? applyTransform(null, config.transformId, targetField) : undefined);
                } else {
                    let sourceValue = row[config.sourceColumn];
                    if (config.operation === 'coalesce' && config.secondaryColumn && (!sourceValue && sourceValue !== 0)) {
                        sourceValue = row[config.secondaryColumn];
                    } else if (config.operation === 'concat' && config.secondaryColumn) {
                        sourceValue = `${sourceValue ?? ''}${config.separator ?? ' '}${row[config.secondaryColumn] ?? ''}`.trim();
                    }
                    if (sourceValue !== undefined) {
                        newRow[targetField] = config.transformId ? applyTransform(sourceValue, config.transformId, targetField) : sourceValue;
                    }
                }
            });
            return newRow;
        });
    };

    return (
        <div className="space-y-4">
            {mapperOpen && config && (
                <ColumnMapper
                    sourceColumns={pendingFileColumns}
                    targetSchema={config.schema}
                    initialMapping={initialMapping}
                    onConfirm={async (m) => {
                        setMapperOpen(false);
                        const mappingKey = [...pendingFileColumns].sort().join('|') + `_${config.key}`;
                        setSavedMappings(prev => ({ ...prev, [mappingKey]: m }));
                        if (workbookCache) await processWorkbook(workbookCache, m);
                    }}
                    onCancel={() => { setMapperOpen(false); setIsImporting(false); }}
                />
            )}

            {previewOpen && config && (
                <ImportPreview
                    data={dataToPreview}
                    schema={config.schema}
                    isImporting={isImporting}
                    onConfirm={handlePreviewConfirm}
                    onCancel={() => { setPreviewOpen(false); setIsImporting(false); }}
                />
            )}

            <div className="flex flex-col gap-4">
                <div className="flex justify-center">
                    <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <button onClick={() => setImportMode('append')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${importMode === 'append' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                            <PlusCircle className="w-3.5 h-3.5" /> Hinzufügen
                        </button>
                        <button onClick={() => setImportMode('overwrite')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${importMode === 'overwrite' ? 'bg-white dark:bg-slate-800 text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                            <RotateCcw className="w-3.5 h-3.5" /> Überschreiben
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} disabled={isImporting || !config} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" id="excel-upload" />
                    <label htmlFor="excel-upload" className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl transition-all ${isImporting ? 'bg-slate-50 border-slate-200' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/10'}`}>
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600"><Upload className="w-6 h-6" /></div>
                        <div className="text-center">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{isImporting ? 'Datei wird verarbeitet...' : 'Klicken oder Datei hierher ziehen'}</p>
                            <p className="text-xs text-slate-500 mt-1">{config ? `${config.entityLabel} importieren` : 'Keine Tabelle gewählt'}</p>
                        </div>
                    </label>
                </div>

                {status !== 'idle' && (
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${status === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/20' : 'bg-red-50 text-red-700 dark:bg-red-900/20'}`}>
                        {status === 'success' ? <Check className="w-5 h-5 mt-0.5" /> : <AlertCircle className="w-5 h-5 mt-0.5" />}
                        <div className="text-sm font-medium">{message}</div>
                    </div>
                )}
            </div>
        </div>
    );
};
