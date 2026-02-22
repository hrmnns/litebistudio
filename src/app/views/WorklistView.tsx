import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Trash2, ExternalLink, AlertCircle, CheckCircle2, Circle, Clock, Search, MessageSquare } from 'lucide-react';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { PageLayout } from '../components/ui/PageLayout';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { useDashboard } from '../../lib/context/DashboardContext';
import type { TableColumn, WorklistStatus } from '../../types';

type WorklistFilter = 'all' | WorklistStatus;

interface WorklistItem {
    id: number;
    source_table: string;
    source_id: string | number;
    display_label: string | null;
    comment: string | null;
    status: WorklistStatus;
    created_at: string;
    _exists?: boolean;
}

export const WorklistView: React.FC = () => {
    const { t } = useTranslation();
    const [items, setItems] = useState<WorklistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<WorklistFilter>('all');
    const [search, setSearch] = useState('');
    const { isReadOnly } = useDashboard();

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
                console.error("Failed to load details for", item, fallbackErr);
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

    const filteredItems = items
        .filter(item => filter === 'all' || item.status === filter)
        .filter(item =>
            item.display_label?.toLowerCase().includes(search.toLowerCase()) ||
            item.source_table?.toLowerCase().includes(search.toLowerCase()) ||
            item.comment?.toLowerCase().includes(search.toLowerCase())
        );

    return (
        <PageLayout
            header={{
                title: t('sidebar.worklist'),
                subtitle: t('worklist.subtitle'),
                onBack: () => window.history.back()
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
                                className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 w-64 text-sm font-medium"
                            />
                        </div>
                        <div className="flex items-center gap-1 p-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
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
                                    className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${filter === f.id ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    {f.label.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {t('worklist.found_count', { count: filteredItems.length })}
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
                                        <th className="px-4 py-3 w-40">{t('worklist.status_label', 'Status')}</th>
                                        <th className="px-4 py-3">{t('worklist.element_label', 'Element')}</th>
                                        <th className="px-4 py-3">{t('worklist.table_label', 'Tabelle')}</th>
                                        <th className="px-4 py-3">{t('worklist.context_label', 'Kontext')}</th>
                                        <th className="px-4 py-3 hidden md:table-cell">{t('worklist.created_label', 'Erstellt am')}</th>
                                        <th className="px-4 py-3 text-right">{t('common.actions', 'Aktionen')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                    {filteredItems.map(item => (
                                        <tr key={item.id} className={`group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${!item._exists ? 'bg-red-50/10' : ''}`}>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={item.status}
                                                    disabled={isReadOnly}
                                                    onChange={async (e) => {
                                                        if (isReadOnly) return;
                                                        await SystemRepository.updateWorklistItem(item.id, { status: e.target.value });
                                                        await loadWorklist();
                                                    }}
                                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-[11px] font-bold outline-none cursor-pointer focus:ring-2 focus:ring-blue-500/20 text-slate-700 dark:text-slate-300"
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
