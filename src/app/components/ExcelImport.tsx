import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Check, AlertCircle } from 'lucide-react';
import { bulkInsertKPIs, bulkInsertEvents, bulkInsertInvoiceItems, clearDatabase } from '../../lib/db';
import invoiceItemsSchema from '../../schemas/invoice-items-schema.json';
// @ts-ignore - AJV generated validator
import { validate as validateInvoiceItems } from '../../lib/validators/invoice-items-validator.js';
import { ColumnMapper } from './ColumnMapper';
import type { MappingConfig } from './ColumnMapper';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { applyTransform } from '../../lib/transformers';
import { KeySelectionModal } from './KeySelectionModal';

// Basic Import Config Definition
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
}

interface ExcelImportProps {
    onImportComplete?: () => void;
    config?: ImportConfig; // If missing, defaults to legacy Invoice Items logic
}

export const ExcelImport: React.FC<ExcelImportProps> = ({ onImportComplete, config }) => {
    const [isImporting, setIsImporting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'warning'>('idle');
    const [message, setMessage] = useState('');
    const [errors, setErrors] = useState<string[]>([]);

    // Mapping State
    const [mapperOpen, setMapperOpen] = useState(false);
    const [pendingFileColumns, setPendingFileColumns] = useState<string[]>([]);
    const [initialMapping, setInitialMapping] = useState<Record<string, MappingConfig> | undefined>(undefined);
    const [workbookCache, setWorkbookCache] = useState<XLSX.WorkBook | null>(null);
    const [mappedDataCache, setMappedDataCache] = useState<any[]>([]);

    // Key Selection State
    const [keyModalOpen, setKeyModalOpen] = useState(false);
    const [savedMappings, setSavedMappings] = useLocalStorage<Record<string, Record<string, MappingConfig>>>('excel_mappings_v2', {});

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setStatus('idle');
        setMessage('Processing file...');
        setErrors([]);

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
                    setMessage(`Import failed: ${err.message}`);
                    setIsImporting(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMessage(`File reading failed: ${err.message}`);
            setIsImporting(false);
        }
    };

    const processWorkbook = async (workbook: XLSX.WorkBook, manualMapping?: Record<string, MappingConfig>) => {
        if (config) {
            await processGenericImport(workbook, manualMapping);
        } else {
            // LEGACY MODE (Invoice Items + KPIs + Events)
            let kpis: any[] = [];
            let events: any[] = [];
            let invoiceItems: any[] = [];
            let invoiceItemsSheetName = '';

            // 1. Identify Sheets
            workbook.SheetNames.forEach(sheetName => {
                const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                if (rawData.length === 0) return;

                const lowerName = sheetName.toLowerCase();

                // Heuristics
                if (lowerName.includes('kpi')) {
                    kpis = convertDates(rawData);
                } else if (lowerName.includes('event') || lowerName.includes('operation')) {
                    events = convertDates(rawData);
                } else if (lowerName.includes('invoice') || lowerName.includes('cost') || lowerName.includes('spend') || invoiceItems.length === 0) {
                    // This is our candidate for Invoice Items
                    if (invoiceItems.length === 0) {
                        invoiceItems = rawData;
                        invoiceItemsSheetName = sheetName;
                    }
                }
            });

            // 2. Check Mapping for Invoice Items
            if (invoiceItems.length > 0 && invoiceItemsSheetName) {
                // Robustly get headers from the sheet directly
                // Object.keys(row[0]) fails if the first row has empty cells for some columns
                const sheet = workbook.Sheets[invoiceItemsSheetName];
                const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[];
                const columns = (headerRow || []).filter(h => h && typeof h === 'string'); // Filter valid headers

                let finalData = invoiceItems;

                if (manualMapping) {
                    finalData = applyMapping(invoiceItems, manualMapping);
                } else {
                    // ALWAYS trigger UI for review, even if saved mapping exists
                    const mappingKey = [...columns].sort().join('|');
                    const savedMap = savedMappings[mappingKey];

                    setPendingFileColumns(columns);
                    setInitialMapping(savedMap); // Pre-fill with saved map if available
                    setMapperOpen(true);
                    return; // Wait for user confirmation
                }

                // Enrich Data (FiscalYear) & Standardize
                finalData = finalData.map((row, index) => {
                    // Robust Period Parsing (e.g. 01.2025 -> 2025-01)
                    // This handles cases where transformer wasn't selected manually
                    if (row.Period && typeof row.Period === 'string') {
                        const pMatch = row.Period.match(/^(\d{1,2})[.-](\d{4})$/);
                        if (pMatch) {
                            row.Period = `${pMatch[2]}-${parseInt(pMatch[1], 10).toString().padStart(2, '0')}`;
                        }
                    }

                    // Ensure FiscalYear exists and is integer
                    let fiscalYear = row.FiscalYear;
                    if (fiscalYear) {
                        fiscalYear = typeof fiscalYear === 'string' ? parseInt(fiscalYear, 10) : fiscalYear;
                    }

                    if (!fiscalYear || isNaN(fiscalYear)) {
                        if (row.Period && typeof row.Period === 'string' && row.Period.match(/^\d{4}-\d{2}$/)) {
                            fiscalYear = parseInt(row.Period.split('-')[0], 10);
                        } else if (row.PostingDate && typeof row.PostingDate === 'string' && row.PostingDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            fiscalYear = parseInt(row.PostingDate.split('-')[0], 10);
                        } else {
                            fiscalYear = new Date().getFullYear();
                        }
                    }

                    // Ensure LineId exists (default to 1-based index)
                    let lineId = row.LineId;
                    if (!lineId) {
                        lineId = index + 1;
                    } else {
                        lineId = typeof lineId === 'string' ? parseInt(lineId, 10) : lineId;
                    }

                    // Ensure DocumentId exists
                    let documentId = row.DocumentId;
                    if (!documentId) {
                        documentId = 'GEN-' + Math.random().toString(36).substr(2, 9).toUpperCase();
                    }

                    // Ensure PostingDate exists (derive from Period if missing)
                    // Critical for correct sorting in charts
                    let postingDate = row.PostingDate;
                    if (!postingDate && row.Period && row.Period.match(/^\d{4}-\d{2}$/)) {
                        postingDate = `${row.Period}-01`;
                    }

                    return {
                        ...row,
                        FiscalYear: fiscalYear,
                        LineId: lineId,
                        DocumentId: documentId,
                        PostingDate: postingDate // Override or set
                    };
                });

                invoiceItems = convertDates(finalData);

                // 3. Duplicate Detection and Key Selection
                const mappingKey = [...columns].sort().join('|');
                const savedMap = savedMappings[mappingKey];
                const keyFields = (savedMap as any)?.__keyFields || ['DocumentId', 'LineId'];

                const hasDuplicates = checkDuplicates(invoiceItems, keyFields);

                // If we have duplicates, we MUST show the key selection modal.
                // We only skip this if we are ALREADY in the process of confirming keys (which calls performImport directly).
                // This is actually simplified in the new flow by using handleMappingAndImport callback structure
                // But waiting for mapping confirm is key.
                if (hasDuplicates) {
                    setMappedDataCache(invoiceItems);
                    setKeyModalOpen(true);
                    return;
                }
            }

            // 3. Validation & Insert
            await performLegacyImport(invoiceItems, kpis, events);
        }
    };

    const processGenericImport = async (workbook: XLSX.WorkBook, manualMapping?: Record<string, MappingConfig>) => {
        if (!config) return;

        // Find best sheet
        let targetSheetName = workbook.SheetNames[0];
        if (config.sheetNameKeyword) {
            const match = workbook.SheetNames.find(n => n.toLowerCase().includes(config.sheetNameKeyword!.toLowerCase()));
            if (match) targetSheetName = match;
        }

        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName]);
        if (!rawData || rawData.length === 0) {
            setStatus('error');
            setMessage('No data found in the file.');
            setIsImporting(false);
            return;
        }

        await handleMappingAndImport(rawData, targetSheetName, workbook, manualMapping, async (mappedData) => {
            // Generic Enrichment
            let finalData = convertDates(mappedData);
            if (config.processRow) {
                finalData = finalData.map((row, i) => config.processRow!(row, i));
            }

            // Validation
            if (!config.validate(finalData)) {
                setStatus('error');
                setMessage(`Validation failed for ${config.entityLabel}.`);
                setErrors(config.getValidationErrors());
                setIsImporting(false);
                return;
            }

            // Validation Passed - Import
            try {
                await config.importFn(finalData);
                setStatus('success');
                setMessage(`Successfully imported ${finalData.length} ${config.entityLabel}.`);
                window.dispatchEvent(new Event('db-updated'));
                window.dispatchEvent(new CustomEvent('db-changed', {
                    detail: { type: 'insert', count: finalData.length }
                }));
                if (onImportComplete) onImportComplete();
            } catch (err: any) {
                console.error(err);
                setStatus('error');
                setMessage(`Import failed: ${err.message}`);
            } finally {
                setIsImporting(false);
            }
        });
    };

    // Helper to abstract the "Show Mapper vs Proceed" logic
    let columns: string[] = []; // Closure var to share state with legacy flow

    const handleMappingAndImport = async (
        rawData: any[],
        sheetName: string,
        workbook: XLSX.WorkBook,
        manualMapping: Record<string, MappingConfig> | undefined,
        onReadyToImport: (mappedData: any[]) => Promise<void>
    ) => {
        // Robustly get headers
        const sheet = workbook.Sheets[sheetName];
        const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[];
        columns = (headerRow || []).filter(h => h && typeof h === 'string');

        // Check Mapping
        if (manualMapping) {
            const mapped = applyMapping(rawData, manualMapping);
            await onReadyToImport(mapped);
        } else {
            // Trigger UI
            const mappingKey = [...columns].sort().join('|') + (config ? `_${config.key}` : '_legacy');
            const savedMap = savedMappings[mappingKey];

            setPendingFileColumns(columns);
            setInitialMapping(savedMap);
            setMapperOpen(true);
            // We return here, user interaction continues in handleMappingConfirm
        }
    };

    // Legacy Import Handler
    const performLegacyImport = async (invoiceItems: any[], kpis: any[], events: any[]) => {
        // Validation for Invoice Items
        if (invoiceItems.length > 0) {
            const isValid = validateInvoiceItems(invoiceItems);
            if (!isValid) {
                setStatus('error');
                setMessage('Validation failed for Invoice Items.');
                setErrors((validateInvoiceItems as any).errors?.map((err: any) =>
                    `${err.instancePath} ${err.message}${err.params ? ' (' + JSON.stringify(err.params) + ')' : ''}`
                ) || []);
                setIsImporting(false);
                return;
            }
        }

        try {
            await clearDatabase();

            if (invoiceItems.length > 0) await bulkInsertInvoiceItems(invoiceItems);
            if (kpis.length > 0) await bulkInsertKPIs(kpis);
            if (events.length > 0) await bulkInsertEvents(events);

            setStatus('success');
            setMessage(`Successfully imported ${invoiceItems.length} invoice items, ${kpis.length} KPIs and ${events.length} events.`);
            window.dispatchEvent(new Event('db-updated'));
            window.dispatchEvent(new CustomEvent('db-changed', {
                detail: {
                    type: 'insert',
                    count: invoiceItems.length + kpis.length + events.length
                }
            }));
            if (onImportComplete) onImportComplete();
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMessage(`Import failed: ${err.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const convertDates = (data: any[]) => {
        return data.map(row => {
            const newRow = { ...row };
            for (const key in newRow) {
                if (newRow[key] instanceof Date) {
                    newRow[key] = newRow[key].toISOString().split('T')[0];
                } else if (typeof newRow[key] === 'string') {
                    // Security Hardening: Trim whitespace and control characters from all string inputs
                    newRow[key] = newRow[key].trim().replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
                }
            }
            return newRow;
        });
    };

    const applyMapping = (data: any[], mapping: Record<string, MappingConfig>) => {
        return data.map(row => {
            const newRow: any = {};

            // 1. Copy unmapped fields (preserve extra data)
            const mappedSources = Object.values(mapping).map(m => m.sourceColumn);
            Object.keys(row).forEach(key => {
                if (!mappedSources.includes(key)) {
                    newRow[key] = row[key];
                }
            });

            // 2. Apply mapping & transformation
            Object.entries(mapping).forEach(([targetField, config]) => {
                if (config.sourceColumn === '__CONSTANT__') {
                    // Prefer constantValue, fallback to transformId for backward compat (legacy Currency)
                    if (config.constantValue) {
                        newRow[targetField] = config.constantValue;
                    } else if (config.transformId) {
                        // Legacy support: if we still have a transformId for a constant (e.g. old EUR)
                        newRow[targetField] = applyTransform(null, config.transformId, targetField);
                    }
                } else {
                    let sourceValue = row[config.sourceColumn];

                    // Advanced Operations
                    if (config.operation === 'coalesce' && config.secondaryColumn) {
                        // Fallback if primary is empty/null/undefined
                        if (!sourceValue && sourceValue !== 0) {
                            sourceValue = row[config.secondaryColumn];
                        }
                    } else if (config.operation === 'concat' && config.secondaryColumn) {
                        // Combine columns
                        const val1 = sourceValue ?? '';
                        const val2 = row[config.secondaryColumn] ?? '';
                        const sep = config.separator ?? ' ';
                        sourceValue = `${val1}${sep}${val2}`.trim();
                    }

                    if (sourceValue !== undefined) {
                        let finalValue = sourceValue;

                        if (config.transformId) {
                            finalValue = applyTransform(sourceValue, config.transformId, targetField);
                        }

                        newRow[targetField] = finalValue;
                    }
                }
            });

            return newRow;
        });
    };

    const handleMappingConfirm = async (mapping: Record<string, MappingConfig>) => {
        setMapperOpen(false);
        setIsImporting(true);
        setMessage('Applying mapping...');

        // Save mapping
        const mappingKey = [...pendingFileColumns].sort().join('|') + (config ? `_${config.key}` : '_legacy');
        setSavedMappings(prev => ({ ...prev, [mappingKey]: mapping }));

        // Resume process
        if (workbookCache) {
            await processWorkbook(workbookCache, mapping);
        }
    };

    const handleResetMappings = () => {
        if (window.confirm('Are you sure you want to clear all saved column mappings? You will need to re-map your files.')) {
            setSavedMappings({});
            setMessage('Mappings cleared.');
        }
    };

    const checkDuplicates = (data: any[], keyFields: string[]) => {
        const seen = new Set();
        for (const row of data) {
            const compositeKey = keyFields.map(f => String(row[f] || '')).join('|');
            if (seen.has(compositeKey)) return true;
            seen.add(compositeKey);
        }
        return false;
    };

    const handleKeyConfirm = async (keyFields: string[]) => {
        setKeyModalOpen(false);
        setIsImporting(true);

        // Update saved mapping with key configuration
        if (workbookCache && mappedDataCache.length > 0) {
            const sheet = workbookCache.Sheets[workbookCache.SheetNames[0]]; // Simplification
            const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[];
            const columns = (headerRow || []).filter(h => h && typeof h === 'string');
            const mappingKey = [...columns].sort().join('|');

            setSavedMappings(prev => ({
                ...prev,
                [mappingKey]: {
                    ...prev[mappingKey],
                    __keyFields: keyFields as any
                }
            }));

            // Final Perform Import
            await performLegacyImport(mappedDataCache, [], []);
        }
    };

    return (
        <div className="space-y-4">
            {mapperOpen && (
                <ColumnMapper
                    sourceColumns={pendingFileColumns}
                    targetSchema={config ? config.schema : invoiceItemsSchema.items}
                    initialMapping={initialMapping}
                    onConfirm={handleMappingConfirm}
                    onCancel={() => {
                        setMapperOpen(false);
                        setIsImporting(false);
                        setStatus('idle');
                        setInitialMapping(undefined);
                    }}
                />
            )}

            {keyModalOpen && (
                <KeySelectionModal
                    isOpen={keyModalOpen}
                    onClose={() => {
                        setKeyModalOpen(false);
                        setIsImporting(false);
                    }}
                    onConfirm={handleKeyConfirm}
                    mappedData={mappedDataCache}
                    initialKeyFields={['DocumentId', 'LineId']}
                    availableFields={Object.keys(invoiceItemsSchema.items.properties)}
                />
            )}

            <div className="relative">
                <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    disabled={isImporting}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    id="excel-upload"
                />
                <label
                    htmlFor="excel-upload"
                    className={`
                        flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl transition-all
                        ${isImporting ? 'bg-slate-50 border-slate-200' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'}
                    `}
                >
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600">
                        <Upload className="w-6 h-6" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {isImporting ? 'Importing...' : 'Click or drag Excel/CSV file here'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            {config ? `Importing ${config.entityLabel}` : 'Sheets should contain columns: metric, value, category, date'}
                        </p>
                    </div>
                </label>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleResetMappings}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors underline"
                >
                    Reset Saved Mappings
                </button>
            </div>

            {status !== 'idle' && (
                <div className={`p-4 rounded-lg flex items-start gap-3 ${status === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'}`}>
                    {status === 'success' ? <Check className="w-5 h-5 mt-0.5" /> : <AlertCircle className="w-5 h-5 mt-0.5" />}
                    <div className="text-sm font-medium">{message}</div>
                </div>
            )}

            {status === 'error' && errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold mb-2">
                        <AlertCircle className="w-4 h-4 ml-0.5" />
                        <span>Detailed Validation Errors ({errors.length})</span>
                    </div>
                    <ul className="space-y-1 max-h-40 overflow-auto">
                        {errors.slice(0, 10).map((err, i) => (
                            <li key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">
                                • {err}
                            </li>
                        ))}
                        {errors.length > 10 && (
                            <li className="text-xs text-red-500 italic">
                                ... and {errors.length - 10} more errors
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};
