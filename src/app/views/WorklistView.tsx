import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Trash2, ExternalLink, AlertCircle, CheckCircle2, Circle, Clock, Search, MessageSquare, CheckSquare, Square, CalendarClock } from 'lucide-react';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { PageLayout } from '../components/ui/PageLayout';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { useDashboard } from '../../lib/context/DashboardContext';
import type { TableColumn, WorklistPriority, WorklistStatus } from '../../types';
import { createLogger } from '../../lib/logger';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useNavigate } from 'react-router-dom';

type WorklistFilter = 'all' | WorklistStatus;
type WorklistQuickFilter = 'none' | 'overdue' | 'today' | 'high_priority';
type WorklistToolsTab = 'focus' | 'batch' | 'preview';
const logger = createLogger('WorklistView');

const getStoredWorklistDefaultView = (): 'all' | 'open' | 'overdue' | 'today' | 'high_priority' => {
    if (typeof window === 'undefined') return 'all';
    const value = localStorage.getItem('worklist_default_view');
    if (value === 'open' || value === 'overdue' || value === 'today' || value === 'high_priority' || value === 'all') {
        return value;
    }
    return 'all';
};

interface WorklistItem {
    id: number;
    source_table: string;
    source_id: string | number;
    display_label: string | null;
    comment: string | null;
    status: WorklistStatus;
    priority?: WorklistPriority;
    due_at?: string | null;
    updated_at?: string;
    created_at: string;
    _exists?: boolean;
}

export const WorklistView: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const defaultWorklistView = getStoredWorklistDefaultView();
    const [items, setItems] = useState<WorklistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<WorklistFilter>(defaultWorklistView === 'open' ? 'open' : 'all');
    const [quickFilter, setQuickFilter] = useState<WorklistQuickFilter>(
        defaultWorklistView === 'overdue' || defaultWorklistView === 'today' || defaultWorklistView === 'high_priority'
            ? defaultWorklistView
            : 'none'
    );
    const [search, setSearch] = useState('');
    const [showWorklistTools, setShowWorklistTools] = useState(false);
    const [worklistToolsTab, setWorklistToolsTab] = useState<WorklistToolsTab>('focus');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [previewItemId, setPreviewItemId] = useState<number | null>(null);
    const { isReadOnly } = useDashboard();
    const [hideCompleted] = useLocalStorage<boolean>('worklist_hide_completed', false);

    // Detail Modal State
    const [selectedItem, setSelectedItem] = useState<WorklistItem | null>(null);
    const [sourceData, setSourceData] = useState<Record<string, unknown>[]>([]);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const loadWorklist = useCallback(async () => {
        setLoading(true);
        const data = await SystemRepository.getWorklist() as unknown as WorklistItem[];

        // Add existence check for each item
        const enriched = await Promise.all(data.map(async (item) => {
            const exists = await SystemRepository.checkRecordExists(item.source_table, item.source_id);
            return { ...item, _exists: exists };
        }));

        setItems(enriched);
        setLoading(false);
    }, []);

    useEffect(() => {
        const initialLoadHandle = window.setTimeout(() => {
            void loadWorklist();
        }, 0);

        window.addEventListener('db-updated', loadWorklist);
        window.addEventListener('db-changed', loadWorklist);
        return () => {
            window.clearTimeout(initialLoadHandle);
            window.removeEventListener('db-updated', loadWorklist);
            window.removeEventListener('db-changed', loadWorklist);
        };
    }, [loadWorklist]);

    const handleRemove = async (id: number) => {
        if (isReadOnly) return;
        await SystemRepository.executeRaw('DELETE FROM sys_worklist WHERE id = ?', [id]);
        await loadWorklist();
    };

    const handleOpenDetail = async (item: WorklistItem) => {
        let results: Record<string, unknown>[] = [];
        try {
            results = await SystemRepository.executeRaw(
                `SELECT rowid as _rowid, * FROM "${item.source_table}" WHERE id = ?`,
                [item.source_id]
            ) as Record<string, unknown>[];
        } catch {
            try {
                const columns = await SystemRepository.getTableSchema(item.source_table);
                const pk = columns.find((c: TableColumn) => c.pk === 1 || c.name.toLowerCase() === 'id')?.name;
                if (pk && pk.toLowerCase() !== 'id') {
                    results = await SystemRepository.executeRaw(
                        `SELECT rowid as _rowid, * FROM "${item.source_table}" WHERE "${pk}" = ?`,
                        [item.source_id]
                    ) as Record<string, unknown>[];
                } else {
                    results = await SystemRepository.executeRaw(
                        `SELECT rowid as _rowid, * FROM "${item.source_table}" WHERE rowid = ?`,
                        [item.source_id]
                    ) as Record<string, unknown>[];
                }
            } catch (fallbackErr) {
                logger.error('Failed to load details for', item, fallbackErr);
            }
        }

        if (results.length > 0) {
            setSourceData(results);
            setSelectedItem(item);
            setIsDetailOpen(true);
        } else {
            // Even if deleted, maybe show the worklist item info? 
            // For now, if source record is gone, we can still show the modal if we have a way to handle missing data.
            // But RecordDetailModal expects source data.
            setSourceData([{ ...item, _deleted: true }]);
            setSelectedItem(item);
            setIsDetailOpen(true);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'done': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'in_progress': return <Clock className="w-4 h-4 text-blue-500" />;
            case 'closed': return <Circle className="w-4 h-4 text-slate-400 opacity-50" />;
            case 'open':
            default: return <AlertCircle className="w-4 h-4 text-amber-500" />;
        }
    };

    const isOverdue = (dueAt?: string | null) => {
        if (!dueAt) return false;
        const today = new Date();
        const dateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const due = new Date(dueAt);
        const dueOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        return dueOnly.getTime() < dateOnly.getTime();
    };

    const isDueToday = (dueAt?: string | null) => {
        if (!dueAt) return false;
        const today = new Date();
        const due = new Date(dueAt);
        return due.getFullYear() === today.getFullYear()
            && due.getMonth() === today.getMonth()
            && due.getDate() === today.getDate();
    };

    const priorityRank: Record<WorklistPriority, number> = {
        critical: 4,
        high: 3,
        normal: 2,
        low: 1
    };

    const filteredItems = items
        .filter(item => filter === 'all' || item.status === filter)
        .filter(item => !hideCompleted || (item.status !== 'done' && item.status !== 'closed'))
        .filter(item => {
            if (quickFilter === 'none') return true;
            if (quickFilter === 'overdue') return item.status !== 'done' && item.status !== 'closed' && isOverdue(item.due_at);
            if (quickFilter === 'today') return isDueToday(item.due_at);
            if (quickFilter === 'high_priority') return item.priority === 'high' || item.priority === 'critical';
            return true;
        })
        .filter(item =>
            item.display_label?.toLowerCase().includes(search.toLowerCase()) ||
            item.source_table?.toLowerCase().includes(search.toLowerCase()) ||
            item.comment?.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
            const overdueScoreA = isOverdue(a.due_at) && a.status !== 'done' && a.status !== 'closed' ? 1 : 0;
            const overdueScoreB = isOverdue(b.due_at) && b.status !== 'done' && b.status !== 'closed' ? 1 : 0;
            if (overdueScoreA !== overdueScoreB) return overdueScoreB - overdueScoreA;

            const priorityA = priorityRank[a.priority || 'normal'];
            const priorityB = priorityRank[b.priority || 'normal'];
            if (priorityA !== priorityB) return priorityB - priorityA;

            const timeA = new Date(a.updated_at || a.created_at).getTime();
            const timeB = new Date(b.updated_at || b.created_at).getTime();
            return timeB - timeA;
        });

    const selectedItems = filteredItems.filter(item => selectedIds.includes(item.id));
    const previewItem =
        filteredItems.find(item => item.id === previewItemId)
        || selectedItems[0]
        || filteredItems[0]
        || null;

    const toggleItemSelection = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const setAllSelection = (nextSelected: boolean) => {
        if (nextSelected) {
            setSelectedIds(filteredItems.map(item => item.id));
        } else {
            setSelectedIds([]);
        }
    };

    const runBatchUpdate = async (data: { status?: string; priority?: string; due_at?: string | null }) => {
        if (selectedIds.length === 0 || isReadOnly) return;
        await Promise.all(selectedIds.map(id => SystemRepository.updateWorklistItem(id, data)));
        await loadWorklist();
    };

    const plusDaysIso = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    return (
        <PageLayout
            header={{
                title: t('sidebar.worklist'),
                subtitle: t('worklist.subtitle'),
                onBack: () => navigate(-1)
            }}
            rightPanel={{
                title: t('worklist.tools_title', 'Worklist Tools'),
                enabled: true,
                triggerTitle: t('worklist.tools_title', 'Worklist Tools'),
                width: 'sm',
                isOpen: showWorklistTools,
                onOpenChange: setShowWorklistTools,
                content: (
                    <div className="h-full min-h-0 flex flex-col gap-4">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setWorklistToolsTab('focus')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${worklistToolsTab === 'focus' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('worklist.tools_tab_focus', 'Fokus')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setWorklistToolsTab('batch')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${worklistToolsTab === 'batch' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('worklist.tools_tab_batch', 'Batch')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setWorklistToolsTab('preview')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${worklistToolsTab === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('worklist.tools_tab_preview', 'Preview')}
                            </button>
                        </div>

                        {worklistToolsTab === 'focus' && (
                            <div className="flex-1 min-h-0 flex flex-col gap-3">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('worklist.focus_open', 'Offen')}</div>
                                        <div className="text-lg font-black text-slate-800 dark:text-slate-100">{items.filter(i => i.status === 'open' || i.status === 'in_progress').length}</div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('worklist.quick_overdue', 'Ueberfaellig')}</div>
                                        <div className="text-lg font-black text-rose-600 dark:text-rose-300">{items.filter(i => (i.status !== 'done' && i.status !== 'closed') && isOverdue(i.due_at)).length}</div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('worklist.quick_today', 'Heute')}</div>
                                        <div className="text-lg font-black text-blue-600 dark:text-blue-300">{items.filter(i => isDueToday(i.due_at)).length}</div>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                                    <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{t('worklist.tools_quick_filters', 'Schnellfilter')}</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button type="button" onClick={() => { setQuickFilter('none'); setFilter('all'); }} className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">{t('worklist.quick_all', 'Alles')}</button>
                                        <button type="button" onClick={() => { setQuickFilter('overdue'); setFilter('all'); }} className="h-9 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30">{t('worklist.quick_overdue', 'Ueberfaellig')}</button>
                                        <button type="button" onClick={() => { setQuickFilter('today'); setFilter('all'); }} className="h-9 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30">{t('worklist.quick_today', 'Heute')}</button>
                                        <button type="button" onClick={() => { setQuickFilter('high_priority'); setFilter('all'); }} className="h-9 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">{t('worklist.quick_high_priority', 'Hohe Prioritaet')}</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {worklistToolsTab === 'batch' && (
                            <div className="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {t('worklist.tools_selected_count', '{{count}} ausgewaehlt', { count: selectedIds.length })}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ status: 'open' }); }} className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40">{t('worklist.status_open', 'Neu / Offen')}</button>
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ status: 'in_progress' }); }} className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40">{t('worklist.status_in_progress', 'In Bearbeitung')}</button>
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ status: 'done' }); }} className="h-9 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 disabled:opacity-40">{t('worklist.status_done', 'Erledigt')}</button>
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ status: 'closed' }); }} className="h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40">{t('worklist.status_closed', 'Geschlossen')}</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ priority: 'normal' }); }} className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40">{t('worklist.priority_normal', 'Normal')}</button>
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ priority: 'high' }); }} className="h-9 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs font-semibold text-amber-700 dark:text-amber-300 disabled:opacity-40">{t('worklist.priority_high', 'Hoch')}</button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ due_at: plusDaysIso(0) }); }} className="h-9 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-xs font-semibold text-blue-700 dark:text-blue-300 disabled:opacity-40">{t('worklist.quick_today', 'Heute')}</button>
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ due_at: plusDaysIso(7) }); }} className="h-9 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-xs font-semibold text-blue-700 dark:text-blue-300 disabled:opacity-40">+7</button>
                                    <button type="button" disabled={selectedIds.length === 0 || isReadOnly} onClick={() => { void runBatchUpdate({ due_at: null }); }} className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40">{t('common.clear', 'Leeren')}</button>
                                </div>
                            </div>
                        )}

                        {worklistToolsTab === 'preview' && (
                            <div className="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                                {!previewItem ? (
                                    <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">{t('common.no_data')}</div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{previewItem.display_label || t('worklist.entry_id', { id: previewItem.source_id })}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{previewItem.source_table}</div>
                                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{previewItem.status}</span>
                                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{previewItem.priority || 'normal'}</span>
                                        </div>
                                        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                            <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                                            {previewItem.due_at ? String(previewItem.due_at).slice(0, 10) : '-'}
                                        </div>
                                        <div className="text-xs text-slate-600 dark:text-slate-300 min-h-[48px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2">
                                            {previewItem.comment || '-'}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { void handleOpenDetail(previewItem); }}
                                            className="h-9 w-full rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                        >
                                            {t('worklist.details_btn', 'Details oeffnen')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )
            }}
        >
            <div className="max-w-5xl space-y-6">
                {/* Filters & Search */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder={t('common.search')}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="h-10 pl-10 pr-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 w-64 text-sm font-medium text-slate-700 dark:text-slate-200"
                            />
                        </div>
                        <div className="h-10 flex items-center gap-1 p-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            {([
                                { id: 'all', label: t('worklist.filter_all') },
                                { id: 'open', label: t('worklist.filter_open') },
                                { id: 'in_progress', label: t('worklist.filter_in_progress') },
                                { id: 'done', label: t('worklist.filter_done') },
                                { id: 'closed', label: t('worklist.filter_closed') }
                            ] as { id: WorklistFilter; label: string }[]).map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setFilter(f.id)}
                                    className={`h-8 px-3 text-[10px] font-black rounded-md transition-all ${filter === f.id ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                >
                                    {f.label.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        <div className="h-10 flex items-center gap-1 p-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            {([
                                { id: 'none', label: t('worklist.quick_all', 'Alles') },
                                { id: 'overdue', label: t('worklist.quick_overdue', 'Ueberfaellig') },
                                { id: 'today', label: t('worklist.quick_today', 'Heute') },
                                { id: 'high_priority', label: t('worklist.quick_high_priority', 'Hohe Prioritaet') }
                            ] as { id: WorklistQuickFilter; label: string }[]).map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setQuickFilter(f.id)}
                                    className={`h-8 px-3 text-[10px] font-black rounded-md transition-all ${quickFilter === f.id ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                >
                                    {f.label.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {t('worklist.found_count', { count: filteredItems.length })}
                        {' · '}
                        {t('worklist.tools_selected_count', '{{count}} ausgewaehlt', { count: selectedIds.length })}
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                        <div className="w-12 h-12 bg-slate-200 dark:bg-slate-800 rounded-full mb-4" />
                        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded mb-2" />
                        <div className="h-3 w-48 bg-slate-200 dark:bg-slate-800 rounded opacity-50" />
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
                            <ClipboardList className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{t('worklist.empty_msg')}</h3>
                        <p className="text-xs text-slate-500 max-w-xs text-center">
                            {t('worklist.empty_hint')}
                        </p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-black tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3 w-12">
                                            <button
                                                type="button"
                                                onClick={() => setAllSelection(selectedIds.length !== filteredItems.length || filteredItems.length === 0)}
                                                className="inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                                                title={selectedIds.length === filteredItems.length && filteredItems.length > 0 ? t('common.clear', 'Leeren') : t('common.select_all', 'Alle waehlen')}
                                            >
                                                {selectedIds.length === filteredItems.length && filteredItems.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                            </button>
                                        </th>
                                        <th className="px-4 py-3 w-40">{t('worklist.status_label', 'Status')}</th>
                                        <th className="px-4 py-3">{t('worklist.element_label', 'Element')}</th>
                                        <th className="px-4 py-3">{t('worklist.table_label', 'Tabelle')}</th>
                                        <th className="px-4 py-3 w-36">{t('worklist.priority_label', 'Prioritaet')}</th>
                                        <th className="px-4 py-3 w-36">{t('worklist.due_label', 'Faellig')}</th>
                                        <th className="px-4 py-3">{t('worklist.context_label', 'Kontext')}</th>
                                        <th className="px-4 py-3 hidden md:table-cell">{t('worklist.created_label', 'Erstellt am')}</th>
                                        <th className="px-4 py-3 text-right">{t('common.actions', 'Aktionen')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                    {filteredItems.map(item => (
                                        <tr key={item.id} onClick={() => setPreviewItemId(item.id)} className={`group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${selectedIds.includes(item.id) ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''} ${!item._exists ? 'bg-red-50/10' : ''}`}>
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); toggleItemSelection(item.id); }}
                                                    className="inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                                                >
                                                    {selectedIds.includes(item.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={item.status}
                                                    disabled={isReadOnly}
                                                    onChange={async (e) => {
                                                        e.stopPropagation();
                                                        if (isReadOnly) return;
                                                        await SystemRepository.updateWorklistItem(item.id, { status: e.target.value });
                                                        await loadWorklist();
                                                    }}
                                                    className="h-9 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 text-[11px] font-bold outline-none cursor-pointer focus:ring-2 focus:ring-blue-500/20 text-slate-700 dark:text-slate-300"
                                                >
                                                    <option value="open">{t('worklist.status_open', 'Neu / Offen')}</option>
                                                    <option value="in_progress">{t('worklist.status_in_progress', 'In Bearbeitung')}</option>
                                                    <option value="done">{t('worklist.status_done', 'Erledigt')}</option>
                                                    <option value="closed">{t('worklist.status_closed', 'Geschlossen')}</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3" onClick={() => handleOpenDetail(item)}>
                                                <div className="flex items-center gap-3 cursor-pointer">
                                                    {getStatusIcon(item.status)}
                                                    <span className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                                                        {item.display_label || t('worklist.entry_id', { id: item.source_id })}
                                                    </span>
                                                    {!item._exists && (
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-[9px] font-black text-red-600 dark:text-red-400 rounded uppercase tracking-tighter shadow-sm">
                                                            <AlertCircle className="w-2.5 h-2.5" /> {t('common.deleted')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700/50 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 rounded">
                                                    {item.source_table}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={item.priority || 'normal'}
                                                    disabled={isReadOnly}
                                                    onChange={async (e) => {
                                                        e.stopPropagation();
                                                        if (isReadOnly) return;
                                                        await SystemRepository.updateWorklistItem(item.id, { priority: e.target.value });
                                                        await loadWorklist();
                                                    }}
                                                    className="h-9 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 text-[11px] font-bold outline-none cursor-pointer focus:ring-2 focus:ring-blue-500/20 text-slate-700 dark:text-slate-300"
                                                >
                                                    <option value="low">{t('worklist.priority_low', 'Niedrig')}</option>
                                                    <option value="normal">{t('worklist.priority_normal', 'Normal')}</option>
                                                    <option value="high">{t('worklist.priority_high', 'Hoch')}</option>
                                                    <option value="critical">{t('worklist.priority_critical', 'Kritisch')}</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="date"
                                                    value={item.due_at ? String(item.due_at).slice(0, 10) : ''}
                                                    disabled={isReadOnly}
                                                    onChange={async (e) => {
                                                        e.stopPropagation();
                                                        if (isReadOnly) return;
                                                        await SystemRepository.updateWorklistItem(item.id, { due_at: e.target.value || null });
                                                        await loadWorklist();
                                                    }}
                                                    className={`h-9 w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/20 ${isOverdue(item.due_at) && item.status !== 'done' && item.status !== 'closed'
                                                        ? 'border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                                                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                                        }`}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                                <div className="flex items-center gap-3 text-[11px]">
                                                    {item.comment ? (
                                                        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 w-full max-w-[200px] truncate" title={item.comment}>
                                                            <MessageSquare className="w-3 h-3 opacity-60 shrink-0" />
                                                            <span className="truncate">{item.comment}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 dark:text-slate-600 italic">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-[11px]">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleOpenDetail(item)}
                                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-all"
                                                        title={t('worklist.details_btn')}
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                    </button>
                                                    {!isReadOnly && (
                                                        <button
                                                            onClick={() => handleRemove(item.id)}
                                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                                                            title={t('worklist.remove_btn')}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {
                isDetailOpen && selectedItem && (
                    <RecordDetailModal
                        isOpen={isDetailOpen}
                        onClose={() => setIsDetailOpen(false)}
                        items={sourceData}
                        initialIndex={0}
                        tableName={selectedItem.source_table}
                        title={selectedItem.display_label ?? undefined}
                    />
                )
            }
        </PageLayout >
    );
};

