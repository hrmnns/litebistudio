import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { useAsync } from '../../hooks/useAsync';
import {
    Plus, FileText, Trash2, Download,
    Layout, Database, ChevronRight, Settings,
    BookOpen, User, MoveUp, MoveDown
} from 'lucide-react';
import { useReportExport } from '../../hooks/useReportExport';
import { WidgetRenderer } from '../components/WidgetRenderer';
import { Modal } from '../components/Modal';
import { type ReportPack, type ReportPackItem } from '../../types';
import { useDashboard } from '../../lib/context/DashboardContext';

export const ReportPackView: React.FC = () => {
    const { t } = useTranslation();
    const [packs, setPacks] = useState<ReportPack[]>([]);
    const [activePackId, setActivePackId] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
    const { isReadOnly } = useDashboard();

    // Export State
    const { isExporting, exportProgress, exportPackageToPdf } = useReportExport();

    // Data 
    const { data: allDashboards } = useAsync(() => SystemRepository.getDashboards(), []);
    const { data: allWidgets } = useAsync(() => SystemRepository.getUserWidgets(), []);

    useEffect(() => {
        loadPacks();
    }, []);

    const loadPacks = async () => {
        const data = await SystemRepository.getReportPacks();
        setPacks(data);
        if (data.length > 0 && !activePackId) setActivePackId(data[0].id);
    };

    const activePack = packs.find(p => p.id === activePackId);

    const handleSave = async (pack: ReportPack) => {
        if (isReadOnly) return;
        await SystemRepository.saveReportPack(pack);
        loadPacks();
    };

    const createPack = () => {
        const newPack: ReportPack = {
            id: crypto.randomUUID(),
            name: t('reports.new_pack_name'),
            description: '',
            config: {
                coverTitle: t('reports.new_pack_name'),
                coverSubtitle: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
                author: 'LiteBI Studio',
                showTOC: true,
                items: []
            }
        };
        handleSave(newPack);
        setActivePackId(newPack.id);
    };

    const deletePack = async (id: string) => {
        if (isReadOnly) return;
        if (confirm(t('common.confirm_delete'))) {
            await SystemRepository.deleteReportPack(id);
            loadPacks();
            if (activePackId === id) setActivePackId(null);
        }
    };

    const moveItem = (idx: number, direction: 'up' | 'down') => {
        if (!activePack) return;
        const items = [...activePack.config.items];
        const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= items.length) return;

        [items[idx], items[nextIdx]] = [items[nextIdx], items[idx]];
        handleSave({ ...activePack, config: { ...activePack.config, items } });
    };

    const removeItem = (idx: number) => {
        if (!activePack) return;
        const items = activePack.config.items.filter((_, i) => i !== idx);
        handleSave({ ...activePack, config: { ...activePack.config, items } });
    };

    const addItem = (item: ReportPackItem) => {
        if (!activePack) return;
        handleSave({
            ...activePack,
            config: { ...activePack.config, items: [...activePack.config.items, item] }
        });
        setIsAddPickerOpen(false);
    };

    const handleRunExport = async () => {
        if (!activePack) return;

        const exportItems = activePack.config.items.map(item => {
            if (item.type === 'dashboard') {
                const dash = allDashboards?.find(d => d.id === item.id);
                return {
                    elementId: `export-dash-${item.id}`,
                    title: dash?.name || 'Dashboard',
                    orientation: 'landscape' as const
                };
            } else {
                const widget = allWidgets?.find(w => w.id === item.id);
                return {
                    elementId: `export-widget-${item.id}`,
                    title: widget?.name || 'Widget',
                    orientation: 'landscape' as const
                };
            }
        });

        await exportPackageToPdf(
            activePack.name,
            exportItems,
            {
                title: activePack.config.coverTitle,
                subtitle: activePack.config.coverSubtitle,
                author: activePack.config.author
            }
        );
    };

    return (
        <PageLayout
            header={{
                title: t('reports.title', 'Report Packages'),
                subtitle: t('reports.subtitle', 'Build and export multi-page management reports.'),
                actions: (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={createPack}
                            disabled={isReadOnly}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus className="w-4 h-4" /> {t('common.add')}
                        </button>
                    </div>
                )
            }}
        >
            <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
                {/* Sidebar: List of Packs */}
                <div className="col-span-3 border-r border-slate-200 dark:border-slate-800 pr-6 overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                        {packs.map(p => (
                            <div
                                key={p.id}
                                onClick={() => setActivePackId(p.id)}
                                className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${activePackId === p.id
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 shadow-sm'
                                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                                    }`}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <FileText className={`w-4 h-4 shrink-0 ${activePackId === p.id ? 'text-blue-500' : 'text-slate-400'}`} />
                                    <span className="font-bold text-sm truncate">{p.name}</span>
                                </div>
                                {!isReadOnly && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deletePack(p.id); }}
                                        className="p-1 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {packs.length === 0 && (
                            <div className="text-center py-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">{t('reports.no_packages')}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main: Active Pack Content */}
                <div className="col-span-9 flex flex-col gap-6 overflow-hidden">
                    {activePack ? (
                        <>
                            {/* Toolbar */}
                            <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600">
                                        <BookOpen className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white leading-tight">{activePack.name}</h3>
                                        <p className="text-xs text-slate-400">{activePack.config.items.length} {t('reports.pages', 'Pages')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isReadOnly && (
                                        <button
                                            onClick={() => setIsEditModalOpen(true)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title={t('common.settings')}
                                        >
                                            <Settings className="w-5 h-5" />
                                        </button>
                                    )}
                                    <button
                                        onClick={handleRunExport}
                                        disabled={isExporting || activePack.config.items.length === 0}
                                        className={`flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg hover:opacity-90 transition-all font-bold text-sm shadow-lg shadow-slate-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        <Download className="w-4 h-4" />
                                        {isExporting ? `${exportProgress}%` : t('reports.export_batch')}
                                    </button>
                                </div>
                            </div>

                            {/* Content & Hidden Capture Area */}
                            <div className={`flex-1 overflow-y-auto custom-scrollbar p-1 ${isReadOnly ? 'pointer-events-none opacity-80' : ''}`}>
                                <div className="space-y-3">
                                    {activePack.config.items.map((item, idx) => {
                                        const meta = item.type === 'dashboard'
                                            ? allDashboards?.find(d => d.id === item.id)
                                            : allWidgets?.find(w => w.id === item.id);

                                        if (!meta) return null;

                                        return (
                                            <div key={idx} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl group hover:shadow-md transition-all">
                                                <div className="flex flex-col gap-1 items-center">
                                                    <button onClick={() => moveItem(idx, 'up')} className="text-slate-300 hover:text-blue-500 disabled:opacity-0" disabled={idx === 0}><MoveUp className="w-3.5 h-3.5" /></button>
                                                    <div className="w-6 h-6 bg-slate-50 dark:bg-slate-800 rounded flex items-center justify-center text-[10px] font-black text-slate-400">{idx + 1}</div>
                                                    <button onClick={() => moveItem(idx, 'down')} className="text-slate-300 hover:text-blue-500 disabled:opacity-0" disabled={idx === activePack.config.items.length - 1}><MoveDown className="w-3.5 h-3.5" /></button>
                                                </div>
                                                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                                                    {item.type === 'dashboard' ? <Layout className="w-5 h-5 text-slate-400" /> : <Database className="w-5 h-5 text-slate-400" />}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{meta.name}</div>
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.type}</div>
                                                </div>
                                                <button
                                                    onClick={() => removeItem(idx)}
                                                    className="p-2 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        );
                                    })}

                                    <button
                                        onClick={() => setIsAddPickerOpen(true)}
                                        className="w-full py-4 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/10 transition-all flex items-center justify-center gap-2 text-sm font-bold"
                                    >
                                        <Plus className="w-4 h-4" /> {t('reports.add_page', 'Add Page')}
                                    </button>
                                </div>

                                {/* HIDDEN CAPTURE GHOSTS (Required for html2canvas to find them) */}
                                <div className="fixed -left-[10000px] top-0 opacity-0 pointer-events-none w-[1400px]">
                                    {activePack.config.items.map((item, idx) => {
                                        if (item.type === 'dashboard') {
                                            const dash = allDashboards?.find(d => d.id === item.id);
                                            if (!dash) return null;
                                            return (
                                                <div key={`ghost-dash-${idx}`} id={`export-dash-${item.id}`} className="bg-white p-10 min-h-[1000px]">
                                                    <div className="mb-10 flex items-center justify-between border-b pb-4">
                                                        <h1 className="text-3xl font-black text-slate-800">{dash.name}</h1>
                                                        <span className="text-sm text-slate-400 font-mono">{t('reports.page')} {idx + 1}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-10">
                                                        {Array.isArray(dash.layout) && dash.layout.map((w: any) => {
                                                            const wMeta = allWidgets?.find(rw => rw.id === w.id);
                                                            if (!wMeta) return null;
                                                            let vConfig = {};
                                                            try {
                                                                vConfig = typeof wMeta.visualization_config === 'string'
                                                                    ? JSON.parse(wMeta.visualization_config)
                                                                    : wMeta.visualization_config;
                                                            } catch (e) { console.error('Error parsing widget config in pack export', e); }

                                                            return (
                                                                <div key={w.id} className="h-[400px]">
                                                                    <WidgetRenderer
                                                                        title={wMeta.name}
                                                                        sql={wMeta.sql_query}
                                                                        config={vConfig as any}
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        } else {
                                            const widget = allWidgets?.find(w => w.id === item.id);
                                            if (!widget) return null;
                                            let vConfig = {};
                                            try {
                                                vConfig = typeof widget.visualization_config === 'string'
                                                    ? JSON.parse(widget.visualization_config)
                                                    : widget.visualization_config;
                                            } catch (e) { console.error('Error parsing widget config in pack export', e); }

                                            return (
                                                <div key={`ghost-widget-${idx}`} id={`export-widget-${item.id}`} className="bg-white p-10 min-h-[1000px] flex flex-col items-center justify-center">
                                                    <div className="w-full max-w-4xl h-[600px]">
                                                        <WidgetRenderer
                                                            title={widget.name}
                                                            sql={widget.sql_query}
                                                            config={vConfig as any}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        }
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                            <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                            <p className="text-sm font-bold uppercase tracking-[0.4em]">{t('reports.select_pack')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Config Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={t('reports.pack_settings', 'Package Settings')}>
                {activePack && (
                    <div className="space-y-6">
                        <section className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t('reports.general')}</label>
                            <input
                                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                value={activePack.name}
                                onChange={e => handleSave({ ...activePack, name: e.target.value })}
                                placeholder={t('reports.pack_name_placeholder')}
                            />
                        </section>

                        <section className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t('reports.cover_page')}</label>
                            <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><FileText className="w-3 h-3" /> {t('reports.title_label')}</div>
                                    <input
                                        className="w-full bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg text-sm border border-slate-100 dark:border-slate-700 outline-none"
                                        value={activePack.config.coverTitle}
                                        onChange={e => handleSave({ ...activePack, config: { ...activePack.config, coverTitle: e.target.value } })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><ChevronRight className="w-3 h-3" /> {t('reports.subtitle_label')}</div>
                                    <input
                                        className="w-full bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg text-sm border border-slate-100 dark:border-slate-700 outline-none"
                                        value={activePack.config.coverSubtitle || ''}
                                        onChange={e => handleSave({ ...activePack, config: { ...activePack.config, coverSubtitle: e.target.value } })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><User className="w-3 h-3" /> {t('reports.author')}</div>
                                    <input
                                        className="w-full bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg text-sm border border-slate-100 dark:border-slate-700 outline-none"
                                        value={activePack.config.author || ''}
                                        onChange={e => handleSave({ ...activePack, config: { ...activePack.config, author: e.target.value } })}
                                    />
                                </div>
                            </div>
                        </section>

                        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="px-6 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl font-bold text-sm"
                            >
                                {t('common.save')}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Picker Modal */}
            <Modal isOpen={isAddPickerOpen} onClose={() => setIsAddPickerOpen(false)} title={t('reports.pick_content', 'Add Page')}>
                <div className="space-y-6">
                    <div>
                        <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2">{t('dashboard.dashboards')}</h4>
                        <div className="grid grid-cols-1 gap-1.5">
                            {allDashboards?.map(d => (
                                <button
                                    key={d.id}
                                    onClick={() => addItem({ type: 'dashboard', id: d.id })}
                                    className="flex items-center gap-3 p-3 text-left bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-xl transition-all border border-transparent hover:border-blue-200 group"
                                >
                                    <Layout className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{d.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2">{t('dashboard.reports')}</h4>
                        <div className="grid grid-cols-1 gap-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {allWidgets?.map(w => (
                                <button
                                    key={w.id}
                                    onClick={() => addItem({ type: 'widget', id: w.id })}
                                    className="flex items-center gap-3 p-3 text-left bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-xl transition-all border border-transparent hover:border-blue-200 group"
                                >
                                    <Database className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{w.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </PageLayout>
    );
};
