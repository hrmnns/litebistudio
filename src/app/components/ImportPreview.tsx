import React, { useMemo } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import type { DbRow } from '../../types';

export interface ValidationResult {
    isValid: boolean;
    errors: Record<string, string>;
}

interface ImportPreviewProps {
    data: DbRow[];
    schema: {
        properties: Record<string, { description?: string; type?: string }>;
        required?: string[];
    };
    onConfirm: () => void;
    onCancel: () => void;
    isImporting: boolean;
}

export const ImportPreview: React.FC<ImportPreviewProps> = ({ data, schema, onConfirm, onCancel, isImporting }) => {
    // Validate rows
    const validation = useMemo(() => {
        const results = data.map(row => {
            const errors: Record<string, string> = {};
            let isValid = true;

            // Check required fields
            if (schema.required) {
                schema.required.forEach(field => {
                    if (row[field] === undefined || row[field] === null || row[field] === '') {
                        errors[field] = 'Pflichtfeld fehlt';
                        isValid = false;
                    }
                });
            }

            // Check types
            Object.entries(schema.properties).forEach(([field, prop]) => {
                const val = row[field];
                if (val === undefined || val === null || val === '') return;

                if (prop.type === 'number') {
                    const num = Number(val);
                    if (isNaN(num)) {
                        errors[field] = 'Gültige Zahl erwartet';
                        isValid = false;
                    }
                }
            });

            return { isValid, errors };
        });

        const errorCount = results.filter(r => !r.isValid).length;
        const validCount = results.length - errorCount;

        return { results, errorCount, validCount };
    }, [data, schema]);

    const columns = Object.keys(schema.properties);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Daten-Vorschau & Validierung</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Überprüfen Sie die eingelesenen Daten vor dem endgültigen Import.
                    </p>

                    <div className="mt-4 flex gap-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm font-bold border border-green-100 dark:border-green-900/30">
                            <Check className="w-4 h-4" />
                            {validation.validCount} Zeilen bereit
                        </div>
                        {validation.errorCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm font-bold border border-red-100 dark:border-red-900/30">
                                <AlertCircle className="w-4 h-4" />
                                {validation.errorCount} Zeilen mit Fehlern
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-0 relative">
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
                            <tr>
                                <th className="p-3 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-400 w-12 text-center">#</th>
                                <th className="p-3 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-400 w-12 text-center">Status</th>
                                {columns.map(col => (
                                    <th key={col} className="p-3 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-400">
                                        <div className="flex flex-col">
                                            <span>{col}</span>
                                            <span className="text-[8px] font-normal leading-tight opacity-60">
                                                {schema.properties[col].type || 'any'}
                                                {schema.required?.includes(col) ? ' (REQ)' : ''}
                                            </span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {data.map((row, idx) => {
                                const res = validation.results[idx];
                                return (
                                    <tr key={idx} className={res.isValid ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50' : 'bg-red-50/30 dark:bg-red-900/5'}>
                                        <td className="p-2 text-[10px] text-slate-400 text-center font-mono border-r border-slate-100 dark:border-slate-800">{idx + 1}</td>
                                        <td className="p-2 text-center border-r border-slate-100 dark:border-slate-800">
                                            {res.isValid ? (
                                                <Check className="w-4 h-4 text-green-500 mx-auto" />
                                            ) : (
                                                <AlertCircle className="w-4 h-4 text-red-500 mx-auto" />
                                            )}
                                        </td>
                                        {columns.map(col => {
                                            const error = res.errors[col];
                                            return (
                                                <td key={col} className={`p-3 text-xs ${error ? 'text-red-600 font-bold bg-red-100/50 dark:bg-red-900/20' : 'text-slate-600 dark:text-slate-300'}`}>
                                                    <div className="group relative">
                                                        <span>{String(row[col] ?? '')}</span>
                                                        {error && (
                                                            <div className="absolute bottom-full left-0 mb-2 invisible group-hover:visible bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-xl whitespace-nowrap z-50">
                                                                {error}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                    <button
                        onClick={onCancel}
                        disabled={isImporting}
                        className="px-4 py-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium transition-colors disabled:opacity-50"
                    >
                        Verwerfen
                    </button>

                    <div className="flex items-center gap-4">
                        {validation.errorCount > 0 && (
                            <div className="text-xs text-amber-600 font-medium">
                                Achtung: {validation.errorCount} Zeilen werden übersprungen.
                            </div>
                        )}
                        <button
                            onClick={onConfirm}
                            disabled={isImporting || validation.validCount === 0}
                            className={`
                                flex items-center gap-2 px-8 py-3 rounded-xl font-bold shadow-lg transition-all transform
                                ${validation.validCount > 0
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                }
                                disabled:opacity-50
                            `}
                        >
                            {isImporting ? (
                                <>In Bearbeitung...</>
                            ) : (
                                <>{validation.validCount} Zeilen importieren</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
