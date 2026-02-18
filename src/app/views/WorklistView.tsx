import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Trash2, ExternalLink, AlertCircle, CheckCircle2, Circle, Clock, Tag, Search, MessageSquare } from 'lucide-react';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { PageLayout } from '../components/ui/PageLayout';
import { RecordDetailModal } from '../components/RecordDetailModal';

export const WorklistView: React.FC = () => {
    const { t } = useTranslation();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');

    // Detail Modal State
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [sourceData, setSourceData] = useState<any[]>([]);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const loadWorklist = async () => {
        setLoading(true);
        const data = await SystemRepository.getWorklist();

        // Add existence check for each item
        const enriched = await Promise.all(data.map(async (item) => {
            const exists = await SystemRepository.checkRecordExists(item.source_table, item.source_id);
            return { ...item, _exists: exists };
        }));

        setItems(enriched);
        setLoading(false);
    };

    useEffect(() => {
        loadWorklist();
        window.addEventListener('db-updated', loadWorklist);
        window.addEventListener('db-changed', loadWorklist);
        return () => {
            window.removeEventListener('db-updated', loadWorklist);
            window.removeEventListener('db-changed', loadWorklist);
        };
    }, []);

    const handleRemove = async (id: number) => {
        await SystemRepository.executeRaw('DELETE FROM sys_worklist WHERE id = ?', [id]);
        loadWorklist();
    };

    const handleOpenDetail = async (item: any) => {
        const results = await SystemRepository.executeRaw(
            `SELECT * FROM "${item.source_table}" WHERE id = ?`,
            [item.source_id]
        );

        if (results.length > 0) {
            setSourceData(results);
            setSelectedItem(item);
            setIsDetailOpen(true);
        } else {
            // Even if deleted, maybe show the worklist item info? 
            // For now, if source record is gone, we can still show the modal if we have a way to handle missing data.
            // But RecordDetailModal expects source data.
            setSourceData([{ id: item.source_id, _deleted: true, ...item }]);
            setSelectedItem(item);
            setIsDetailOpen(true);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'done': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'in_progress': return <Clock className="w-4 h-4 text-blue-500" />;
            case 'error': return <AlertCircle className="w-4 h-4 text-rose-500" />;
            case 'obsolete': return <Circle className="w-4 h-4 text-slate-400 opacity-50" />;
            default: return <Circle className="w-4 h-4 text-amber-500" />;
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
            <div className="max-w-5xl mx-auto space-y-6">
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
                            {[
                                { id: 'all', label: t('worklist.filter_all') },
                                { id: 'pending', label: t('worklist.filter_pending') },
                                { id: 'in_progress', label: t('worklist.filter_in_prog') },
                                { id: 'done', label: t('worklist.filter_done') }
                            ].map(f => (
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
                    <div className="grid grid-cols-1 gap-3">
                        {filteredItems.map(item => (
                            <div
                                key={item.id}
                                className={`
                                    group flex items-center gap-4 p-4 bg-white dark:bg-slate-800/80 rounded-xl border transition-all hover:border-blue-300 dark:hover:border-blue-900 shadow-sm
                                    ${!item._exists ? 'border-red-200 dark:border-red-900/40 bg-red-50/10' : 'border-slate-200 dark:border-slate-700'}
                                `}
                            >
                                <div className="shrink-0">
                                    {getStatusIcon(item.status)}
                                </div>

                                <div className="flex-1 min-w-0" onClick={() => handleOpenDetail(item)}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate cursor-pointer hover:text-blue-600 transition-colors">
                                            {item.display_label || t('worklist.entry_id', { id: item.source_id })}
                                        </h4>
                                        {!item._exists && (
                                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-[9px] font-black text-red-600 dark:text-red-400 rounded uppercase tracking-tighter shadow-sm animate-pulse">
                                                <AlertCircle className="w-2.5 h-2.5" /> {t('common.deleted')}
                                            </span>
                                        )}
                                        <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700/50 text-[9px] font-bold text-slate-500 rounded uppercase tracking-wider">
                                            {item.source_table}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-[11px] text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <Tag className="w-3 h-3 opacity-60" /> {item.display_context}
                                        </span>
                                        {item.comment && (
                                            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 italic">
                                                <MessageSquare className="w-3 h-3 opacity-60" /> {t('worklist.comment_present')}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1 ml-auto opacity-40">
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleOpenDetail(item)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                                        title={t('worklist.details_btn')}
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleRemove(item.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                        title={t('worklist.remove_btn')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isDetailOpen && selectedItem && (
                <RecordDetailModal
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    items={sourceData}
                    initialIndex={0}
                    tableName={selectedItem.source_table}
                    title={selectedItem.display_label}
                />
            )}
        </PageLayout>
    );
};
