
import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { useAsync } from '../../hooks/useAsync';
import { Plus, Layout, Trash2, Database, Star, Settings, Check, X, Edit2, Download, Maximize2 } from 'lucide-react';
import { useReportExport } from '../../hooks/useReportExport';
import { WidgetRenderer } from '../components/WidgetRenderer';
import { Modal } from '../components/Modal';
import { getComponent, SYSTEM_WIDGETS } from '../registry';
import { COMPONENTS } from '../../config/components';
import { useDashboard } from '../../lib/context/DashboardContext';

interface SavedWidget {
    id: string; // Either UUID for custom or 'sys_...' for system
    type: 'custom' | 'system';
    position?: number;
}

interface DashboardDef {
    id: string;
    name: string;
    layout: SavedWidget[];
    is_default: boolean;
}

export const CustomDashboardView: React.FC = () => {
    // Dashboards State
    const [dashboards, setDashboards] = useState<DashboardDef[]>([]);
    const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'custom'>('system');

    // Edit State
    const [editName, setEditName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const { visibleSidebarComponentIds, setVisibleSidebarComponentIds, togglePresentationMode } = useDashboard();
    const { isExporting, exportToPdf } = useReportExport();

    // Fetch custom widgets (for the "Add Widget" modal)
    const { data: customWidgets, refresh: refreshCustomWidgets } = useAsync<any[]>(
        async () => {
            return await SystemRepository.executeRaw('SELECT * FROM sys_user_widgets ORDER BY created_at DESC');
        },
        []
    );

    // Initial Load & Migration
    useEffect(() => {
        const init = async () => {
            let dbDashboards = await SystemRepository.getDashboards();

            // Migration from localStorage
            const legacyLayout = localStorage.getItem('custom_dashboard_layout');
            if (dbDashboards.length === 0) {
                const defaultDash: DashboardDef = {
                    id: crypto.randomUUID(),
                    name: 'Mein Dashboard',
                    layout: legacyLayout ? JSON.parse(legacyLayout) : [],
                    is_default: true
                };
                await SystemRepository.saveDashboard(defaultDash);
                if (legacyLayout) localStorage.removeItem('custom_dashboard_layout');
                dbDashboards = [defaultDash];
            } else if (dbDashboards.length > 0) {
                // Parse layouts from strings
                dbDashboards = dbDashboards.map(d => ({
                    ...d,
                    layout: typeof d.layout === 'string' ? JSON.parse(d.layout) : d.layout
                }));
            }

            setDashboards(dbDashboards);
            setActiveDashboardId(dbDashboards[0].id);
            setIsLoaded(true);
        };
        init();
    }, []);

    const activeDashboard = dashboards.find(d => d.id === activeDashboardId);

    // Sync active dashboard to DB
    const syncDashboard = async (updatedDash: DashboardDef) => {
        await SystemRepository.saveDashboard(updatedDash);
        setDashboards(prev => prev.map(d => d.id === updatedDash.id ? updatedDash : d));
    };

    const addToDashboard = async (id: string, type: 'custom' | 'system') => {
        if (!activeDashboard) return;
        if (activeDashboard.layout.find(w => w.id === id)) return;

        const updated = {
            ...activeDashboard,
            layout: [...activeDashboard.layout, { id, type }]
        };
        await syncDashboard(updated);
        setIsAddModalOpen(false);
    };

    const removeFromDashboard = async (id: string) => {
        if (!activeDashboard) return;
        const updated = {
            ...activeDashboard,
            layout: activeDashboard.layout.filter(w => w.id !== id)
        };
        await syncDashboard(updated);
    };

    const deleteCustomWidget = async (id: string) => {
        if (confirm('Report wirklich löschen?')) {
            await SystemRepository.executeRaw(`DELETE FROM sys_user_widgets WHERE id = '${id}'`);
            refreshCustomWidgets();
            removeFromDashboard(id);
        }
    };

    const createDashboard = async () => {
        if (!editName.trim()) return;
        const newDash: DashboardDef = {
            id: crypto.randomUUID(),
            name: editName,
            layout: [],
            is_default: false
        };
        await SystemRepository.saveDashboard(newDash);
        setDashboards([...dashboards, newDash]);
        setActiveDashboardId(newDash.id);
        setEditName('');
        setIsCreating(false);
    };

    const removeDashboard = async (id: string) => {
        if (dashboards.length <= 1) return;
        if (!confirm('Dieses Dashboard wirklich löschen?')) return;

        await SystemRepository.deleteDashboard(id);
        const filtered = dashboards.filter(d => d.id !== id);
        setDashboards(filtered);
        if (activeDashboardId === id) {
            setActiveDashboardId(filtered[0].id);
        }
    };

    if (!isLoaded) return null;

    return (
        <PageLayout
            header={{
                title: 'Mein Dashboard',
                subtitle: 'Kategorisierte Auswertungen und Kacheln.',
                actions: (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={togglePresentationMode}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title="Präsentationsmodus"
                        >
                            <Maximize2 className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => exportToPdf('dashboard-grid', `dashboard-${activeDashboard?.name || 'export'}`)}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            {isExporting ? 'Export...' : 'PDF'}
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Widget hinzufügen
                        </button>
                    </div>
                )
            }}
        >
            {/* Dashboard Tabs */}
            <div className="mb-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-px">
                    {dashboards.map(d => (
                        <button
                            key={d.id}
                            onClick={() => setActiveDashboardId(d.id)}
                            className={`px-4 py-2.5 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeDashboardId === d.id
                                ? 'text-blue-600 border-blue-600'
                                : 'text-slate-400 border-transparent hover:text-slate-600'
                                }`}
                        >
                            {d.name}
                        </button>
                    ))}
                    <button
                        onClick={() => { setIsCreating(true); setEditName(''); }}
                        className="px-4 py-2.5 text-slate-400 hover:text-blue-600 transition-all border-b-2 border-transparent"
                        title="Neues Dashboard erstellen"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <button
                    onClick={() => setIsManageModalOpen(true)}
                    className="p-2 text-slate-400 hover:text-slate-600"
                    title="Dashboards verwalten"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </div>

            {/* Dashboard Name Editor (Inline Create) */}
            {isCreating && (
                <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-3">
                    <Layout className="w-5 h-5 text-slate-400" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Name des Dashboards (z.B. Kosten für Kunden X)"
                        className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && createDashboard()}
                    />
                    <div className="flex items-center gap-1">
                        <button onClick={createDashboard} className="p-1.5 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setIsCreating(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                    </div>
                </div>
            )}

            {activeDashboard && activeDashboard.layout.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400">
                    <Layout className="w-12 h-12 mb-4 opacity-50" />
                    <h3 className="font-bold text-lg text-slate-600">"{activeDashboard.name}" ist noch leer</h3>
                    <p className="mb-4 text-sm text-center">Fügen Sie Kacheln hinzu, um dieses Dashboard individuell zu gestalten.</p>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-6 py-2 bg-white border border-slate-200 rounded-lg text-blue-600 font-bold hover:shadow-sm transition-all text-sm"
                    >
                        Widget hinzufügen
                    </button>
                </div>
            ) : activeDashboard ? (
                <div id="dashboard-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 auto-rows-[300px]">
                    {activeDashboard.layout.map((widgetRef, idx) => {
                        // Render System Widget
                        if (widgetRef.type === 'system') {
                            const meta = SYSTEM_WIDGETS.find(w => w.id === widgetRef.id);
                            if (!meta) return null;
                            const Component = getComponent(meta.id);
                            if (!Component) return null;

                            return (
                                <div key={widgetRef.id + idx} className={`relative group h-full ${meta.defaultColSpan === 2 ? 'md:col-span-2' : ''}`}>
                                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeFromDashboard(widgetRef.id); }}
                                            className="p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded text-slate-400 hover:text-red-500 shadow-sm"
                                            title="Entfernen"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="h-full">
                                        <Component
                                            onRemove={() => removeFromDashboard(widgetRef.id)}
                                            targetView={COMPONENTS.find(c => c.component === meta.id)?.targetView}
                                        />
                                    </div>
                                </div>
                            );
                        }

                        // Render Custom Widget
                        const dbWidget = customWidgets?.find(w => w.id === widgetRef.id);
                        if (!dbWidget) return null;

                        let config;
                        try {
                            config = JSON.parse(dbWidget.visualization_config);
                        } catch (e) {
                            config = { type: 'table' };
                        }

                        return (
                            <div key={widgetRef.id + idx} className="relative group md:col-span-1 xl:col-span-2 h-full">
                                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => removeFromDashboard(widgetRef.id)}
                                        className="p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded text-slate-400 hover:text-red-500 shadow-sm"
                                        title="Entfernen"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                                <WidgetRenderer
                                    title={dbWidget.name}
                                    sql={dbWidget.sql_query}
                                    config={config}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {/* Manage Dashboards Modal */}
            <Modal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} title="Dashboards verwalten">
                <div className="space-y-3">
                    {dashboards.map(d => (
                        <div key={d.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg group">
                            <div className="flex items-center gap-3">
                                <Layout className="w-4 h-4 text-slate-400" />
                                <span className="font-bold text-slate-700">{d.name}</span>
                                {d.is_default && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Default</span>}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => {
                                        const newName = prompt('Name für Dashboard:', d.name);
                                        if (newName && newName !== d.name) {
                                            syncDashboard({ ...d, name: newName });
                                        }
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => removeDashboard(d.id)}
                                    disabled={dashboards.length <= 1}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={() => { setIsManageModalOpen(false); setIsCreating(true); }}
                        className="w-full p-3 border-2 border-dashed border-slate-100 rounded-lg text-slate-400 hover:text-blue-600 hover:border-blue-200 text-sm font-bold transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Neues Dashboard
                    </button>
                </div>
            </Modal>

            {/* Add Widget Modal (Customized for active dashboard) */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Widget hinzufügen"
            >
                <div className="flex gap-4 mb-4 border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('system')}
                        className={`pb-2 text-sm font-bold ${activeTab === 'system' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}
                    >
                        System Widgets
                    </button>
                    <button
                        onClick={() => setActiveTab('custom')}
                        className={`pb-2 text-sm font-bold ${activeTab === 'custom' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}
                    >
                        Custom Reports
                    </button>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto min-h-[300px]">
                    {activeTab === 'system' && (
                        <div className="grid grid-cols-1 gap-2">
                            {SYSTEM_WIDGETS.map(w => {
                                const isAdded = activeDashboard?.layout.some(dw => dw.id === w.id);
                                const componentConfig = COMPONENTS.find(c => c.component === w.id);
                                const hasView = !!componentConfig?.targetView;
                                const isPinned = hasView && visibleSidebarComponentIds.includes(componentConfig!.id);

                                return (
                                    <div key={w.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                                                <w.icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-700">{w.title}</div>
                                                <div className="text-xs text-slate-400">{w.description}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Pin to Sidebar Toggle */}
                                            {hasView && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isPinned) {
                                                            setVisibleSidebarComponentIds(visibleSidebarComponentIds.filter(id => id !== componentConfig!.id));
                                                        } else {
                                                            setVisibleSidebarComponentIds([...visibleSidebarComponentIds, componentConfig!.id]);
                                                        }
                                                    }}
                                                    title={isPinned ? "Aus dem Menü entfernen" : "Zum Menü hinzufügen"}
                                                    className={`p-1.5 rounded-md border transition-all ${isPinned ? 'bg-amber-50 border-amber-200 text-amber-500' : 'bg-white border-slate-200 text-slate-300 hover:text-amber-400'}`}
                                                >
                                                    <Star className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
                                                </button>
                                            )}

                                            <button
                                                onClick={() => addToDashboard(w.id, 'system')}
                                                disabled={isAdded}
                                                className={`px-3 py-1.5 text-xs font-bold rounded ${isAdded ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                            >
                                                {isAdded ? 'Aktiv' : 'Hinzufügen'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'custom' && (
                        <div className="grid grid-cols-1 gap-2">
                            {customWidgets && customWidgets.length > 0 ? customWidgets.map(w => {
                                const isAdded = activeDashboard?.layout.some(dw => dw.id === w.id);
                                return (
                                    <div key={w.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 rounded-lg text-blue-500">
                                                <Database className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-700">{w.name}</div>
                                                <div className="text-xs text-slate-400 truncate max-w-[200px]">{w.sql_query}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => deleteCustomWidget(w.id)}
                                                className="p-2 text-slate-400 hover:text-red-500"
                                                title="Löschen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => addToDashboard(w.id, 'custom')}
                                                disabled={isAdded}
                                                className={`px-3 py-1.5 text-xs font-bold rounded ${isAdded ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                            >
                                                {isAdded ? 'Hinzugefügt' : 'Hinzufügen'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-center text-slate-400 py-4">Keine gespeicherten Reports gefunden.</p>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </PageLayout>
    );
};
