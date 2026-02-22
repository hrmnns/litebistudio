import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Save, Wand2, AlertCircle, Settings2, Plus, ArrowDownUp } from 'lucide-react';
import { transformers } from '../../lib/transformers';

export interface MappingConfig {
    sourceColumn: string;
    transformId?: string;
    constantValue?: string;
    operation?: 'direct' | 'coalesce' | 'concat';
    secondaryColumn?: string;
    separator?: string;
}

interface ColumnMapperProps {
    sourceColumns: string[];
    targetSchema: {
        properties: Record<string, { description?: string; type?: string }>;
        required?: string[];
    };
    onConfirm: (mapping: Record<string, MappingConfig>) => void;
    onCancel: () => void;
    initialMapping?: Record<string, MappingConfig>;
}

interface SchemaProperty {
    description?: string;
    type?: string;
}

export const ColumnMapper: React.FC<ColumnMapperProps> = ({ sourceColumns, targetSchema, onConfirm, onCancel, initialMapping }) => {
    const [mapping, setMapping] = useState<Record<string, MappingConfig>>(initialMapping || {});

    // Extract target fields from schema
    const schemaProperties = targetSchema.properties;
    const requiredFields = targetSchema.required || [];

    const targetFields = Object.keys(schemaProperties).map(key => ({
        key,
        description: (schemaProperties[key] as SchemaProperty).description,
        required: requiredFields.includes(key)
    }));

    const handleAutoMap = useCallback(() => {
        const newMapping: Record<string, MappingConfig> = {};
        targetFields.forEach(field => {
            const match = sourceColumns.find(col =>
                col.toLowerCase() === field.key.toLowerCase() ||
                col.toLowerCase().replace(/[^a-z0-9]/g, '') === field.key.toLowerCase().replace(/[^a-z0-9]/g, '')
            );
            if (match) {
                newMapping[field.key] = { sourceColumn: match, operation: 'direct' };
            }
        });
        setMapping(prev => ({ ...prev, ...newMapping }));
    }, [sourceColumns, targetFields]);

    useEffect(() => {
        if (initialMapping && Object.keys(initialMapping).length > 0) {
            return;
        }
        const autoMapHandle = window.setTimeout(() => {
            handleAutoMap();
        }, 0);
        return () => window.clearTimeout(autoMapHandle);
    }, [handleAutoMap, initialMapping]);

    const isValid = targetFields
        .filter(f => f.required)
        .every(f => {
            const m = mapping[f.key];
            if (!m) return false;
            // If Constant, must have a constantValue
            if (m.sourceColumn === '__CONSTANT__') return !!m.constantValue;

            // If Concat, must have secondaryColumn
            if (m.operation === 'concat' && !m.secondaryColumn) return false;

            return !!m.sourceColumn;
        });

    const getUnmappedRequiredCount = () => {
        return targetFields.filter(f => {
            if (!f.required) return false;
            const m = mapping[f.key];
            if (!m) return true;
            if (m.sourceColumn === '__CONSTANT__') return !m.constantValue;
            if (m.operation === 'concat' && !m.secondaryColumn) return true;
            return !m.sourceColumn;
        }).length;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Map Columns & Transforms</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Match columns and apply necessary format conversions.
                        </p>
                    </div>
                    <button
                        onClick={handleAutoMap}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                    >
                        <Wand2 className="w-4 h-4" />
                        Auto-Map
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    <div className="grid grid-cols-[1fr,auto,2fr,1fr] gap-4 items-start mb-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <div>Required Field</div>
                        <div className="w-8"></div>
                        <div>Source Configuration</div>
                        <div>Transformation</div>
                    </div>

                    <div className="space-y-3">
                        {targetFields.map((field) => {
                            const availableTransforms = transformers[field.key] || [];
                            const currentMapping = mapping[field.key];
                            const op = currentMapping?.operation || 'direct';

                            return (
                                <div key={field.key} className={`
                                    grid grid-cols-[1fr,auto,2fr,1fr] gap-4 items-start p-4 rounded-xl border transition-colors
                                    ${currentMapping?.sourceColumn
                                        ? 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700'
                                        : field.required
                                            ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                                    }
                                `}>
                                    <div className="mt-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-semibold ${field.required ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                                {field.key}
                                            </span>
                                            {field.required && (
                                                <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-bold uppercase">Required</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1 line-clamp-1" title={field.description}>
                                            {field.description}
                                        </div>
                                    </div>

                                    <ArrowRight className={`w-4 h-4 mt-3 ${currentMapping?.sourceColumn ? 'text-blue-500' : 'text-slate-300'}`} />

                                    <div className="space-y-2">
                                        {/* Primary Input / Operation Selector */}
                                        <div className="flex gap-2 items-center h-10">
                                            <select
                                                value={currentMapping?.sourceColumn || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setMapping(prev => {
                                                        const next = { ...prev };
                                                        if (val) {
                                                            let initialTransform = next[field.key]?.transformId;
                                                            if (val === '__CONSTANT__' && !initialTransform && availableTransforms.length > 0) {
                                                                initialTransform = availableTransforms[0].id;
                                                            }
                                                            next[field.key] = {
                                                                sourceColumn: val,
                                                                transformId: initialTransform,
                                                                operation: 'direct' // Default to direct on change
                                                            };
                                                        } else {
                                                            delete next[field.key];
                                                        }
                                                        return next;
                                                    });
                                                }}
                                                className={`
                                                    flex-1 h-full px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all
                                                    ${currentMapping?.sourceColumn
                                                        ? 'border-blue-200 bg-white dark:bg-slate-900 dark:border-blue-900/50'
                                                        : 'border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-600'
                                                    }
                                                `}
                                            >
                                                <option value="">-- Ignored --</option>
                                                <option value="__CONSTANT__" className="font-bold text-blue-600">-- Set Constant Value --</option>
                                                <optgroup label="Source Columns">
                                                    {sourceColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </optgroup>
                                            </select>

                                            {currentMapping?.sourceColumn && currentMapping.sourceColumn !== '__CONSTANT__' && (
                                                <div className="flex h-full bg-slate-100 dark:bg-slate-700 rounded-lg p-1 border border-slate-200 dark:border-slate-600 shrink-0 items-center">
                                                    <button
                                                        onClick={() => setMapping(prev => ({ ...prev, [field.key]: { ...prev[field.key]!, operation: 'direct' } }))}
                                                        className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center ${op === 'direct' ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                                                        title="Direct Mapping"
                                                    >
                                                        1:1
                                                    </button>
                                                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />
                                                    <button
                                                        onClick={() => setMapping(prev => ({ ...prev, [field.key]: { ...prev[field.key]!, operation: 'coalesce' } }))}
                                                        className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center ${op === 'coalesce' ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                                                        title="Fallback if empty (Coalesce)"
                                                    >
                                                        Fallback
                                                    </button>
                                                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />
                                                    <button
                                                        onClick={() => setMapping(prev => ({ ...prev, [field.key]: { ...prev[field.key]!, operation: 'concat', separator: ' ' } }))}
                                                        className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center ${op === 'concat' ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                                                        title="Combine Columns (Concat)"
                                                    >
                                                        Combine
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Configuration for Operations */}
                                        {op === 'coalesce' && (
                                            <div className="flex items-center gap-2 animate-in slide-in-from-top-2 h-10">
                                                <ArrowDownUp className="w-4 h-4 text-slate-400 rotate-45" />
                                                <span className="text-xs font-bold text-slate-400 shrink-0">ELSE USE</span>
                                                <select
                                                    value={currentMapping?.secondaryColumn || ''}
                                                    onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: { ...prev[field.key]!, secondaryColumn: e.target.value } }))}
                                                    className="flex-1 h-full px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">-- Select Fallback Column --</option>
                                                    {sourceColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {op === 'concat' && (
                                            <div className="flex items-center gap-2 animate-in slide-in-from-top-2 h-10">
                                                <Plus className="w-4 h-4 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Separator (space)"
                                                    value={currentMapping?.separator ?? ' '}
                                                    onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: { ...prev[field.key]!, separator: e.target.value } }))}
                                                    className="w-16 h-full px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center text-sm"
                                                    title="Separator"
                                                />
                                                <Plus className="w-4 h-4 text-slate-400" />
                                                <select
                                                    value={currentMapping?.secondaryColumn || ''}
                                                    onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: { ...prev[field.key]!, secondaryColumn: e.target.value } }))}
                                                    className="flex-1 h-full px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">-- Select 2nd Column --</option>
                                                    {sourceColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* Constant Value Input */}
                                        {currentMapping?.sourceColumn === '__CONSTANT__' && (
                                            <div className="relative animate-in fade-in zoom-in-95 h-10">
                                                <input
                                                    type="text"
                                                    placeholder="Enter constant value..."
                                                    value={currentMapping.constantValue || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setMapping(prev => ({
                                                            ...prev,
                                                            [field.key]: { ...prev[field.key]!, constantValue: val }
                                                        }));
                                                    }}
                                                    className={`
                                                        w-full h-full px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all
                                                        ${!currentMapping.constantValue
                                                            ? 'border-red-300 ring-2 ring-red-100 bg-red-50'
                                                            : 'border-blue-200 bg-white dark:bg-slate-900 dark:border-blue-900/50'
                                                        }
                                                    `}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Transformation */}
                                    <div>
                                        {(availableTransforms.length > 0) && (currentMapping?.sourceColumn || field.key === 'Currency') && (
                                            <div className="relative h-10">
                                                <Settings2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                                <select
                                                    value={currentMapping?.transformId || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setMapping(prev => ({
                                                            ...prev,
                                                            [field.key]: { ...prev[field.key]!, transformId: val || undefined }
                                                        }));
                                                    }}
                                                    className="w-full h-full pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 appearance-none"
                                                >
                                                    <option value="">No Transformation</option>
                                                    {availableTransforms.map(t => (
                                                        <option key={t.id} value={t.id}>
                                                            {t.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                                    <ArrowDownUp className="w-3 h-3 text-slate-400" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium transition-colors"
                    >
                        Cancel Import
                    </button>

                    <div className="flex items-center gap-4">
                        {!isValid && (
                            <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                                <AlertCircle className="w-4 h-4" />
                                {getUnmappedRequiredCount()} required fields missing
                            </div>
                        )}
                        <button
                            onClick={() => onConfirm(mapping)}
                            disabled={!isValid}
                            className={`
                                flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold shadow-lg transition-all transform
                                ${isValid
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 dark:shadow-none hover:-translate-y-0.5'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                }
                            `}
                        >
                            <Save className="w-4 h-4" />
                            Confirm Mapping
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
};
