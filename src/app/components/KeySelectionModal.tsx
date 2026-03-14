import React, { useState, useMemo } from 'react';
import { Key, AlertCircle, Check, Info } from 'lucide-react';
import { Modal } from './Modal';
import type { DbRow } from '../../types';

interface KeySelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (keyFields: string[]) => void;
    mappedData: DbRow[];
    initialKeyFields: string[];
    availableFields: string[];
}

export const KeySelectionModal: React.FC<KeySelectionModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    mappedData,
    initialKeyFields,
    availableFields
}) => {
    const [selectedFields, setSelectedFields] = useState<string[]>(initialKeyFields);

    const duplicateStats = useMemo(() => {
        if (mappedData.length === 0 || selectedFields.length === 0) return { count: 0, total: mappedData.length };

        const seen = new Set();
        let duplicates = 0;

        mappedData.forEach(row => {
            const compositeKey = selectedFields.map(f => String(row[f] || '')).join('|');
            if (seen.has(compositeKey)) {
                duplicates++;
            } else {
                seen.add(compositeKey);
            }
        });

        return { count: duplicates, total: mappedData.length };
    }, [mappedData, selectedFields]);

    const toggleField = (field: string) => {
        setSelectedFields(prev =>
            prev.includes(field)
                ? prev.filter(f => f !== field)
                : [...prev, field]
        );
    };

    const isSuccess = duplicateStats.count === 0 && selectedFields.length > 0;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Configure Primary Key"
            noScroll
        >
            <div className="h-[32rem] max-h-[calc(90vh-11rem)] flex flex-col">
                <div className="flex-1 min-h-0 overflow-auto px-5 pt-4 space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-4 rounded-xl flex gap-3">
                        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            Select the fields that uniquely identify a single record.
                            A unique combination is required for accurate trend analysis and anomaly detection.
                        </p>
                    </div>

                    <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                        {availableFields.map(field => (
                            <label
                                key={field}
                                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${selectedFields.includes(field)
                                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedFields.includes(field)}
                                        onChange={() => toggleField(field)}
                                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 accent-blue-600 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]"
                                    />
                                    <span className={`text-sm font-medium ${selectedFields.includes(field) ? 'text-blue-900 dark:text-blue-100' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {field}
                                    </span>
                                </div>
                                {selectedFields.includes(field) && <Key className="w-3.5 h-3.5 text-blue-500" />}
                            </label>
                        ))}
                    </div>

                    <div className={`p-4 rounded-xl flex items-center justify-between ${isSuccess
                            ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-orange-50 dark:bg-orange-900/10 text-orange-700 dark:text-orange-300'
                        }`}>
                        <div className="flex items-center gap-2">
                            {isSuccess ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                            <div className="text-sm font-bold">
                                {isSuccess ? 'Unique ID established!' : `${duplicateStats.count} duplicates found`}
                            </div>
                        </div>
                        <div className="text-xs font-medium opacity-70">
                            {selectedFields.length} fields selected
                        </div>
                    </div>
                </div>

                <div className="mt-2 px-5 py-4 ui-surface-footer flex items-center justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={selectedFields.length === 0}
                        onClick={() => onConfirm(selectedFields)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedFields.length > 0
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        Save Configuration
                    </button>
                </div>
            </div>
        </Modal>
    );
};
