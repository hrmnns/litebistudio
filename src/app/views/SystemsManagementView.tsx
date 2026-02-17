import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { SettingsRepository } from '../../lib/repositories/SettingsRepository';
import type { SystemRecord } from '../../types';
import {
    Plus, Save, RefreshCw, HelpCircle, CheckCircle2, XCircle,
    Globe2, ShieldCheck, Cpu, ExternalLink, Star, Search, Filter, Settings
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { PageLayout } from '../components/ui/PageLayout';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { SortableSystemCard } from './SortableSystemCard';
import { ExportFAB } from '../components/ui/ExportFAB';

interface SystemsManagementViewProps {
    onBack: () => void;
}

export const SystemsManagementView: React.FC<SystemsManagementViewProps> = ({ onBack }) => {
    const { data: systems, loading, refresh } = useAsync<SystemRecord[]>(
        () => SystemRepository.getAll(),
        []
    );
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isScanning, setIsScanning] = React.useState(false);
    const [scanningId, setScanningId] = React.useState<number | null>(null);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [categoryFilter, setCategoryFilter] = React.useState('All');
    const [newSystem, setNewSystem] = React.useState({ name: '', url: '', category: 'IT' });
    const [webhookUrl, setWebhookUrl] = React.useState('');
    const [showSettings, setShowSettings] = React.useState(false);

    React.useEffect(() => {
        const fetchSettings = async () => {
            const url = await SettingsRepository.get('webhook_url');
            if (url) {
                setWebhookUrl(url);
            }
        };
        fetchSettings();
    }, []);

    const handleSaveSettings = async () => {
        await SettingsRepository.set('webhook_url', webhookUrl);
        setShowSettings(false);
    };

    const sendWebhookNotification = async (systemName: string) => {
        if (!webhookUrl) return;
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `🚨 *System Outage Alert*\n*System:* ${systemName}\n*Status:* OFFLINE\n*Time:* ${new Date().toLocaleString()}`
                })
            });
        } catch (err) {
            console.error('Failed to send webhook', err);
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const filteredSystems = systems?.filter((s: SystemRecord) => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = categoryFilter === 'All' || s.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const handleCheckHealth = async () => {
        if (!systems || systems.length === 0) return;
        setIsScanning(true);

        for (const system of systems) {
            if (!system.url) continue;
            setScanningId(system.id);

            const status = await new Promise<string>((resolve) => {
                const img = new Image();
                const timer = setTimeout(() => {
                    img.src = "";
                    resolve('offline');
                }, 6000);

                img.onload = () => {
                    clearTimeout(timer);
                    resolve('online');
                };

                img.onerror = () => {
                    clearTimeout(timer);
                    resolve('online');
                };

                const probeUrl = new URL('/favicon.ico', system.url!).href;
                img.src = `${probeUrl}?t=${Date.now()}`;
            });

            if (status === 'offline' && system.status !== 'offline') {
                await sendWebhookNotification(system.name);
            }

            await SystemRepository.update(system.id, { status: status as any });
        }

        setScanningId(null);
        setIsScanning(false);
        refresh();
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id && systems) {
            const oldIndex = systems.findIndex((s: SystemRecord) => s.id.toString() === active.id);
            const newIndex = systems.findIndex((s: SystemRecord) => s.id.toString() === over.id);

            const newSystems = arrayMove(systems, oldIndex, newIndex);

            // Update all sort_orders in DB
            for (let i = 0; i < newSystems.length; i++) {
                await SystemRepository.update(newSystems[i].id, { sort_order: i });
            }

            refresh();
        }
    };

    const handleToggleFavorite = async (id: number, current: number) => {
        await SystemRepository.update(id, { is_favorite: current ? 0 : 1 });
        refresh();
    };

    const handleAddSystem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSystem.name) return;

        setIsSaving(true);
        try {
            await SystemRepository.add({
                name: newSystem.name,
                url: newSystem.url,
                category: newSystem.category
            });
            await refresh();
            setIsAddModalOpen(false);
            setNewSystem({ name: '', url: '', category: 'IT' });
        } catch (err) {
            console.error(err);
            alert('Failed to add system');
        } finally {
            setIsSaving(false);
        }
    };

    const getStatusIcon = (status: string, isChecking: boolean) => {
        if (isChecking) return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
        switch (status?.toLowerCase()) {
            case 'online': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'offline': return <XCircle className="w-4 h-4 text-red-500" />;
            default: return <HelpCircle className="w-4 h-4 text-slate-400" />;
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category?.toLowerCase()) {
            case 'business': return <ShieldCheck className="w-3.5 h-3.5" />;
            case 'it': return <Cpu className="w-3.5 h-3.5" />;
            case 'sales': return <Globe2 className="w-3.5 h-3.5" />;
            default: return null;
        }
    };

    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    return (
        <PageLayout
            header={{
                title: 'Systemverwaltung',
                subtitle: `${filteredSystems?.length || 0} Systeme konfiguriert`,
                onBack,
                actions: (
                    <div className="flex items-center gap-2 no-print">
                        <button
                            onClick={() => setShowSettings(true)}
                            className="h-10 w-10 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                            title="Webhooks konfigurieren"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleCheckHealth}
                            disabled={isScanning}
                            className="h-10 flex items-center gap-2 px-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{isScanning ? 'Scanne...' : 'Scan'}</span>
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="h-10 flex items-center gap-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm active:scale-[0.97]"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Hinzufügen</span>
                        </button>
                    </div>
                ),
            }}
            footer={footerText}
            breadcrumbs={[
                { label: 'Systeme' }
            ]}
        >
            {/* Print Only Header */}
            <div className="hidden print-only mb-8 border-b-4 border-slate-900 pb-6">
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-slate-900 rounded-lg">
                                <ShieldCheck className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-lg font-black tracking-tight text-slate-900">IT DASHBOARD</span>
                        </div>
                        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Infrastruktur-Statusbericht</h1>
                        <p className="text-slate-500 font-bold">Aktueller Systemstatus • {new Date().toLocaleDateString('de-DE')}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-black uppercase text-slate-400 mt-2">Verwaltete Systeme</div>
                        <div className="text-2xl font-black text-slate-900">{filteredSystems?.length || 0} Assets</div>
                    </div>
                </div>
            </div>

            {/* Webhook Settings Modal */}
            <Modal isOpen={showSettings} onClose={() => setShowSettings(false)} title="Global Notification Settings">
                <div className="space-y-6">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50">
                        <div className="flex items-start gap-3">
                            <HelpCircle className="w-5 h-5 text-blue-500 mt-1" />
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">About Webhooks</h4>
                                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                                    When a system is detected as offline during a scan, a notification will be sent to this URL.
                                    Compatible with Slack "Incoming Webhooks" and Microsoft Teams "Connectors".
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Webhook URL</label>
                        <input
                            type="url"
                            placeholder="https://hooks.slack.com/services/..."
                            className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-slate-900 dark:text-white font-bold"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSaveSettings}
                            className="flex-1 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 hover:bg-slate-800 dark:hover:bg-slate-100"
                        >
                            <Save className="w-6 h-6" />
                            Save Settings
                        </button>
                        <button
                            onClick={async () => {
                                if (!webhookUrl) return alert('Please enter a Webhook URL first.');
                                try {
                                    await fetch(webhookUrl, {
                                        method: 'POST',
                                        mode: 'no-cors',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            text: `🧪 *IT Dashboard Test Notification*\nYour Webhook integration is working perfectly! ✅\n*Time:* ${new Date().toLocaleString()}`
                                        })
                                    });
                                    alert('Test notification sent manually! Check your Slack/Teams channel.');
                                } catch (err) {
                                    console.error('Test failed', err);
                                    alert('Failed to send test notification.');
                                }
                            }}
                            className="px-6 py-4 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                            <RefreshCw className="w-5 h-5" />
                            Test
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Filters */}
            <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Systeme suchen..."
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-slate-400" />
                    <select
                        className="bg-slate-50 dark:bg-slate-800 border-none rounded-xl py-3 px-6 pr-10 focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white font-bold"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="All">Alle Kategorien</option>
                        <option value="IT">IT Infrastruktur</option>
                        <option value="Business">Business Prozess</option>
                        <option value="Sales">Sales & CRM</option>
                    </select>
                </div>
            </div>

            {/* Systems Grid */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        <div className="col-span-full py-20 text-center animate-pulse text-slate-400 font-bold">Lade Infrastrukturdaten...</div>
                    ) : (
                        <SortableContext
                            items={filteredSystems?.map((s: SystemRecord) => s.id.toString()) || []}
                            strategy={rectSortingStrategy}
                        >
                            {filteredSystems?.map((system: SystemRecord) => (
                                <SortableSystemCard key={system.id} id={system.id}>
                                    <div
                                        className={`h-full group relative p-6 bg-white dark:bg-slate-900 rounded-[32px] border transition-all duration-300 flex flex-col gap-4 ${scanningId === system.id ? 'border-blue-400 ring-4 ring-blue-50' : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-xl'}`}
                                    >
                                        {/* Header Section: Category and Actions */}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                {system.category && (
                                                    <span className="text-[9px] font-black px-2 py-0.5 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 rounded-lg uppercase flex items-center gap-1.5 whitespace-nowrap border border-slate-100 dark:border-slate-700/30">
                                                        {getCategoryIcon(system.category)}
                                                        {system.category}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 z-10">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleFavorite(system.id, system.is_favorite);
                                                    }}
                                                    className={`p-2 rounded-xl transition-all relative z-20 ${system.is_favorite ? 'bg-amber-50 text-amber-500 shadow-sm shadow-amber-200/50' : 'bg-slate-50 dark:bg-slate-800 text-slate-300 hover:text-slate-400'}`}
                                                    title={system.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                                                >
                                                    <Star className={`w-3.5 h-3.5 ${system.is_favorite ? 'fill-current' : ''}`} />
                                                </button>
                                                {system.url && (
                                                    <a
                                                        href={system.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-blue-500 rounded-xl transition-all relative z-20"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        {/* Body Section: Name and URL */}
                                        <div className="space-y-1.5 flex-1">
                                            <h3 className="text-xl font-black text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors break-words leading-tight">
                                                {system.name}
                                            </h3>
                                            <p className="text-[11px] text-slate-400 font-mono truncate max-w-full opacity-60 group-hover:opacity-100 transition-opacity">
                                                {system.url || 'No URL configured'}
                                            </p>
                                        </div>

                                        {/* Footer Section: Status Line */}
                                        <div className="pt-4 border-t border-slate-50 dark:border-slate-800/50 flex items-center justify-between mt-auto">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                                    {getStatusIcon(system.status, scanningId === system.id)}
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${system.status === 'online' ? 'text-emerald-600' : system.status === 'offline' ? 'text-red-500' : 'text-slate-400'}`}>
                                                    {scanningId === system.id ? 'VERIFYING...' : (system.status || 'UNKNOWN')}
                                                </span>
                                            </div>

                                            {system.status === 'online' && (
                                                <div className="flex items-center gap-2 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">LIVE</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </SortableSystemCard>
                            ))}
                        </SortableContext>
                    )}
                </div>
            </DndContext>

            {/* Add Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Register New System">
                <form onSubmit={handleAddSystem} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">System Name</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. SAP Production, HR Portal"
                            className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-slate-900 dark:text-white font-bold"
                            value={newSystem.name}
                            onChange={e => setNewSystem({ ...newSystem, name: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">System URL</label>
                        <input
                            type="url"
                            placeholder="https://portal.company.com"
                            className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-slate-900 dark:text-white font-bold"
                            value={newSystem.url}
                            onChange={e => setNewSystem({ ...newSystem, url: e.target.value })}
                        />
                        <p className="text-[10px] text-slate-400 italic">URLs allow for automated health checks via browser probing.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Category</label>
                        <select
                            className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-slate-900 dark:text-white font-bold appearance-none cursor-pointer"
                            value={newSystem.category}
                            onChange={e => setNewSystem({ ...newSystem, category: e.target.value })}
                        >
                            <option value="IT">IT Infrastructure</option>
                            <option value="Business">Business Process</option>
                            <option value="Sales">Sales & CRM</option>
                        </select>
                    </div>

                    <button type="submit" disabled={isSaving} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-200 dark:shadow-none flex items-center justify-center gap-3">
                        {isSaving ? (
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                <Save className="w-6 h-6" />
                                Register System
                            </>
                        )}
                    </button>
                </form>
            </Modal>

            <ExportFAB />
        </PageLayout>
    );
};
