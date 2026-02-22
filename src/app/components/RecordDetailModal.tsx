import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Bookmark, Info, Target, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import type { DbRow, TableColumn } from '../../types';

import { SchemaTable } from './SchemaDocumentation';
import type { SchemaDefinition } from './SchemaDocumentation';

interface RecordDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: DbRow[];
    initialIndex?: number;
    title?: string;
    tableName?: string;
    schema?: SchemaDefinition;
}

interface WorklistItemState extends DbRow {
    id: number | string;
    status?: string;
    comment?: string;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
    isOpen,
    onClose,
    items,
    initialIndex = 0,
    title,
    tableName,
    schema
}) => {
    const { t } = useTranslation();
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [previousIndex, setPreviousIndex] = useState<number | null>(null);
    const [referenceIndex, setReferenceIndex] = useState<number | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [isInWorklist, setIsInWorklist] = useState(false);
    const [worklistItem, setWorklistItem] = useState<WorklistItemState | null>(null);
    const [recordExists, setRecordExists] = useState<boolean | null>(null);
    const [resolvedSchema, setResolvedSchema] = useState<SchemaDefinition | null>(null);

    // Prevent double clicks during worklist toggle
    const [isActionLoading, setIsActionLoading] = useState(false);

    const modalTitle = title || t('record_detail.title');

    // Get table name context
    const activeTable = tableName || 'unknown';

    const initializedRef = React.useRef(false);

    // Sync index when items change or modal opens
    useEffect(() => {
        if (!isOpen) {
            initializedRef.current = false;
            return;
        }

        if (isOpen && !initializedRef.current && items && items.length > 0) {
            // Always sync provided index when modal opens
            const val = Math.max(0, initialIndex);
            setCurrentIndex(val);
            setReferenceIndex(val); // Auto-set initial item as reference logic
            setPreviousIndex(null);
            setHelpOpen(false);
            initializedRef.current = true;
        }
    }, [isOpen, initialIndex, items]);

    // Resolve schema if not provided
    useEffect(() => {
        if (!isOpen) return;

        if (schema) {
            setResolvedSchema(schema);
            return;
        }

        if (tableName && tableName !== 'unknown') {
            const fetchSchema = async () => {
                const cols = await SystemRepository.getTableSchema(tableName);
                if (cols && cols.length > 0) {
                    const dynamicSchema = {
                        title: `${t('datasource.tab_structure')}: ${tableName}`,
                        description: t('datasource.user_tables_hint'),
                        type: 'object',
                        properties: cols.reduce((acc, col) => {
                            acc[col.name] = {
                                type: col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('real') ? 'number' : 'string',
                                description: `${col.name} (${col.type})`
                            };
                            return acc;
                        }, {} as Record<string, { type: string; description: string }>)
                    };
                    setResolvedSchema(dynamicSchema);
                } else {
                    setResolvedSchema(null);
                }
            };
            fetchSchema();
        } else {
            setResolvedSchema(null);
        }
    }, [isOpen, tableName, schema, t]);

    // Check if current item is in worklist and if it exists
    const getRecordIdValueAsync = useCallback(async (item: DbRow): Promise<string | number | null> => {
        if (!item) return null;

        // Find authentic Primary Key
        try {
            const columns = await SystemRepository.getTableSchema(activeTable);
            const pkCol = columns.find((c: TableColumn) => c.pk === 1)?.name;
            if (pkCol && item[pkCol] !== undefined && item[pkCol] !== null) {
                const value = item[pkCol];
                if (typeof value === 'string' || typeof value === 'number') return value;
            }
        } catch {
            // ignore and fallback
        }

        // 0. Hidden RowID from inspectTable (most reliable for tables without PK)
        if (item._rowid !== undefined && item._rowid !== null) {
            const rowid = item._rowid;
            if (typeof rowid === 'string' || typeof rowid === 'number') return rowid;
        }

        // 1. Explicit ID column (case-insensitive)
        const idKey = Object.keys(item).find(k => k.toLowerCase() === 'id' || k.toLowerCase() === 'entryid' || k.toLowerCase() === 'rowid');
        if (idKey && (item[idKey] !== undefined && item[idKey] !== null)) {
            const idValue = item[idKey];
            if (typeof idValue === 'string' || typeof idValue === 'number') return idValue;
        }

        // 2. Fallback: Any column that looks like an ID
        const fallbackIdKey = Object.keys(item).find(k => k.toLowerCase().endsWith('_id') || k.toLowerCase().endsWith('id'));
        if (fallbackIdKey && (item[fallbackIdKey] !== undefined && item[fallbackIdKey] !== null)) {
            const fallbackValue = item[fallbackIdKey];
            if (typeof fallbackValue === 'string' || typeof fallbackValue === 'number') return fallbackValue;
        }

        return null;
    }, [activeTable]);

    useEffect(() => {
        const checkStatus = async () => {
            const currentItem = items[currentIndex];
            if (currentItem) {
                const recordId = await getRecordIdValueAsync(currentItem);
                const metadata = await SystemRepository.getRecordMetadata(activeTable, recordId ?? '');
                setIsInWorklist(metadata.isInWorklist);
                setWorklistItem(metadata.worklistItem as WorklistItemState | null);
                setRecordExists(metadata.exists);
            } else {
                setRecordExists(null);
                setWorklistItem(null);
                setIsInWorklist(false);
            }
        };
        if (isOpen) {
            void checkStatus();
        }
    }, [isOpen, currentIndex, items, activeTable, getRecordIdValueAsync]);

    const handleToggleWorklist = async () => {
        if (isActionLoading) return;
        const currentItem = items[currentIndex];
        const recordId = await getRecordIdValueAsync(currentItem);

        if (!recordId) {
            console.warn('[RecordDetail] Cannot toggle worklist: No unique ID found for record', currentItem);
            return;
        }

        setIsActionLoading(true);
        try {
            if (isInWorklist) {
                await SystemRepository.executeRaw(
                    'DELETE FROM sys_worklist WHERE source_table = ? AND source_id = ?',
                    [activeTable, recordId]
                );
                setIsInWorklist(false);
                setWorklistItem(null);
            } else {
                // Label: Use generic label detection or fallback to ID
                const labelCandidates = ['name', 'title', 'description', 'label', 'display_name', 'VendorName', 'Description'];
                let label = '';
                for (const candidate of labelCandidates) {
                    // Find key case-insensitive
                    const actualKey = Object.keys(currentItem).find(k => k.toLowerCase() === candidate.toLowerCase());
                    if (actualKey && currentItem[actualKey]) {
                        label = String(currentItem[actualKey]);
                        break;
                    }
                }
                if (!label) label = t('worklist.entry_id', { id: recordId });

                // Context: Use generic period/category or Table
                const contextCandidates = ['period', 'fiscalyear', 'category', 'type', 'group', 'Period'];
                let context = activeTable;
                for (const candidate of contextCandidates) {
                    const actualKey = Object.keys(currentItem).find(k => k.toLowerCase() === candidate.toLowerCase());
                    if (actualKey && currentItem[actualKey]) {
                        context = String(currentItem[actualKey]);
                        break;
                    }
                }

                await SystemRepository.executeRaw(
                    'INSERT INTO sys_worklist (source_table, source_id, display_label, display_context) VALUES (?, ?, ?, ?)',
                    [activeTable, recordId, label, context]
                );

                // Fetch the newly created item once
                const metadata = await SystemRepository.getRecordMetadata(activeTable, recordId);
                setIsInWorklist(true);
                setWorklistItem(metadata.worklistItem as WorklistItemState | null);
            }

            // Explicity dispatch db-changed so widgets update since executeRaw bypasses it
            window.dispatchEvent(new Event('db-changed'));
        } catch (err) {
            console.error('Failed to toggle worklist status', err);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleToggleReference = () => {
        if (referenceIndex === currentIndex) {
            setReferenceIndex(null); // Toggle off if clicking active reference
        } else {
            setReferenceIndex(currentIndex); // Set current as reference
        }
    };

    const handleNavigate = (newIndex: number) => {
        setPreviousIndex(currentIndex);
        setCurrentIndex(newIndex);
    };

    if (!items || items.length === 0) return null;

    const currentItem = items[currentIndex];

    // Comparison Logic: Reference > Previous Visited
    const comparisonItem = referenceIndex !== null
        ? items[referenceIndex]
        : (previousIndex !== null && previousIndex >= 0 && previousIndex < items.length) ? items[previousIndex] : null;

    const isReferenceActive = referenceIndex !== null;
    const isCurrentReference = referenceIndex === currentIndex;

    if (!currentItem) return null;

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={items.length > 1
                    ? `${modalTitle} (${currentIndex + 1} / ${items.length})`
                    : modalTitle
                }
                noScroll
            >
                <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-800">
                    {/* Fixed Menu Bar / Toolbar */}
                    <div className="shrink-0 px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between z-20">
                        <div className="flex items-center gap-1">
                            {resolvedSchema && (
                                <button
                                    onClick={() => setHelpOpen(true)}
                                    className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-500"
                                    title={t('record_detail.schema_definition')}
                                >
                                    <Info className="w-4 h-4" />
                                </button>
                            )}
                            <button
                                onClick={handleToggleWorklist}
                                disabled={isActionLoading}
                                className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${isActionLoading ? 'opacity-50 cursor-not-allowed' : ''} ${isInWorklist
                                    ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                                    : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700'
                                    }`}
                                title={isInWorklist ? t('record_detail.remove_worklist') : t('record_detail.add_worklist')}
                            >
                                {isActionLoading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Bookmark className={`w-4 h-4 ${isInWorklist ? 'fill-current' : ''}`} />
                                )}
                            </button>

                            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />

                            <button
                                onClick={handleToggleReference}
                                className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1.5 group relative ${isReferenceActive
                                    ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400'
                                    : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700'
                                    }`}
                                title={isCurrentReference ? t('record_detail.clear_reference') : t('record_detail.set_reference')}
                            >
                                <Target className={`w-4 h-4 ${isReferenceActive ? 'fill-current' : ''}`} />
                                {isReferenceActive && !isCurrentReference && (
                                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                                    </span>
                                )}
                            </button>

                            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                                {t('record_detail.navigation')}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {recordExists === false && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg text-[10px] font-black animate-pulse">
                                    <AlertCircle className="w-3.5 h-3.5" /> {t('record_detail.deleted_badge')}
                                </div>
                            )}
                            <button
                                disabled={currentIndex === 0}
                                onClick={() => handleNavigate(currentIndex - 1)}
                                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="text-[11px] font-black text-slate-700 dark:text-slate-200 min-w-[60px] text-center bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm">
                                {currentIndex + 1} / {items.length}
                            </div>
                            <button
                                disabled={currentIndex === items.length - 1}
                                onClick={() => handleNavigate(currentIndex + 1)}
                                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Worklist Details Editor */}
                    {isInWorklist && (
                        <div className="shrink-0 px-6 py-4 bg-amber-50/30 dark:bg-amber-900/5 border-b border-slate-200 dark:border-slate-700 space-y-3">
                            <div className="flex items-start gap-4">
                                <div className="w-48 shrink-0">
                                    <label className="block text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 mb-1.5 px-1">{t('record_detail.status_label')}</label>
                                    <select
                                        value={typeof worklistItem?.status === 'string' ? worklistItem.status : 'open'}
                                        onChange={async (e) => {
                                            if (worklistItem) {
                                                const newStatus = e.target.value;
                                                setWorklistItem(prev => prev ? ({ ...prev, status: newStatus }) : prev);
                                                try {
                                                    await SystemRepository.updateWorklistItem(worklistItem.id, { status: newStatus });
                                                    // Global db-changed is automatically fired
                                                } catch (err) {
                                                    console.error('Failed to update status', err);
                                                }
                                            }
                                        }}
                                        className="w-full p-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer"
                                    >
                                        <option value="open">{t('worklist.status_open', 'Neu / Offen')}</option>
                                        <option value="in_progress">{t('worklist.status_in_progress', 'In Bearbeitung')}</option>
                                        <option value="done">{t('worklist.status_done', 'Erledigt')}</option>
                                        <option value="closed">{t('worklist.status_closed', 'Geschlossen')}</option>
                                    </select>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <label className="block text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 mb-1.5 px-1">{t('record_detail.comment_label')}</label>
                                    <textarea
                                        value={typeof worklistItem?.comment === 'string' ? worklistItem.comment : ''}
                                        onChange={(e) => setWorklistItem(prev => prev ? ({ ...prev, comment: e.target.value }) : prev)}
                                        onBlur={async (e) => {
                                            if (worklistItem) {
                                                try {
                                                    await SystemRepository.updateWorklistItem(worklistItem.id, { comment: e.target.value });
                                                    // Global db-changed is automatically fired
                                                } catch (err) {
                                                    console.error('Failed to update comment', err);
                                                }
                                            }
                                        }}
                                        placeholder={t('record_detail.comment_placeholder')}
                                        className="w-full p-2 h-[37px] bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 transition-all resize-none overflow-hidden hover:overflow-y-auto"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Scrollable Data Area */}
                    <div className="flex-1 overflow-auto p-6 pt-4 min-h-0 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                        {isReferenceActive && !isCurrentReference && (
                            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg px-3 py-2 text-[10px] text-blue-700 dark:text-blue-300 flex items-center gap-2 mb-6">
                                <Target className="w-3.5 h-3.5" />
                                <span className="font-bold">{t('record_detail.comparison_active')}</span>
                                <span>
                                    {t('record_detail.differences_relative', { id: items[referenceIndex].id || referenceIndex + 1 })}
                                </span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            {Object.entries(currentItem).map(([key, value]) => {
                                // Skip internal tracking fields if they exist and are boolean/utility
                                if (key.startsWith('is') || key === 'compositeKey' || key === 'status') return null;

                                const isChanged = comparisonItem && String(value) !== String(comparisonItem[key]);

                                return (
                                    <div
                                        key={key}
                                        className={`
                                            border-b border-slate-100 dark:border-slate-700/50 pb-2 transition-colors duration-500
                                            ${isChanged ? 'bg-amber-50 dark:bg-amber-900/20 -mx-2 px-2 rounded-lg border-amber-200 dark:border-amber-800 shadow-sm' : ''}
                                        `}
                                    >
                                        <dt className="text-[10px] font-bold uppercase text-slate-400 mb-1 flex items-center justify-between tracking-wider">
                                            {key}
                                            {isChanged && (
                                                <span className="text-[9px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 rounded-full font-black">
                                                    DIFF
                                                </span>
                                            )}
                                        </dt>
                                        <dd className={`text-sm font-semibold break-all ${isChanged ? 'text-amber-900 dark:text-amber-100' : 'text-slate-900 dark:text-white'}`}>
                                            {value === null || value === undefined || value === '' ? (
                                                <span className="text-slate-300 italic">{t('record_detail.empty_value')}</span>
                                            ) : (
                                                String(value)
                                            )}
                                        </dd>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </Modal>



            {/* Direct Schema Definition Modal (if available) */}
            {
                resolvedSchema && helpOpen && (
                    <Modal
                        isOpen={helpOpen}
                        onClose={() => setHelpOpen(false)}
                        title={resolvedSchema.title || modalTitle}
                    >
                        <div className="space-y-6">
                            <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                                {resolvedSchema.description}
                            </p>
                            <SchemaTable schema={resolvedSchema} />
                            <button
                                onClick={() => setHelpOpen(false)}
                                className="w-full py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold text-xs transition-opacity hover:opacity-90 mt-4"
                            >
                                {t('record_detail.close')}
                            </button>
                        </div>
                    </Modal>
                )
            }
        </>
    );
};
