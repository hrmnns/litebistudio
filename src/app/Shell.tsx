import React, { useState } from 'react';
import { TileGrid } from './TileGrid';
import { ExcelImport } from './components/ExcelImport';
import { SchemaDocumentation } from './components/SchemaDocumentation';
import { SystemStatus } from './components/SystemStatus';
import { LayoutDashboard, Settings, Database, Menu, Info, Upload, ShieldCheck, Bell, Save, RefreshCw } from 'lucide-react';
import { runQuery } from '../lib/db';
import { ItCostsYearView } from './views/ItCostsYearView';
import { ItCostsMonthView } from './views/ItCostsMonthView';
import { ItCostsInvoiceItemsView } from './views/ItCostsInvoiceItemsView';
import { ItCostsItemHistoryView } from './views/ItCostsItemHistoryView';
import { DataInspector } from './views/DataInspector';
import { SystemsManagementView } from './views/SystemsManagementView';
import invoiceItemsSchema from '../schemas/invoice-items-schema.json';
import { TILES } from '../config/tiles';

import { useLocalStorage } from '../hooks/useLocalStorage';

export const Shell: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentView, setCurrentView] = useState<'dashboard' | 'datasource' | 'settings' | 'it-costs-year' | 'it-costs-month' | 'it-costs-invoice' | 'it-costs-item-history' | 'data-inspector' | 'systems-management'>('dashboard');
    const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);

    // Theme & Customization Management
    const [theme, setTheme] = useLocalStorage<'light' | 'dark' | 'system'>('theme', 'system');
    const [visibleTileIds, setVisibleTileIds] = useLocalStorage<string[]>('visibleTileIds', TILES.map(t => t.id));
    const [tileOrder, setTileOrder] = useLocalStorage<string[]>('tileOrder', TILES.map(t => t.id));
    const [webhookUrl, setWebhookUrl] = useState('');
    const [isTestingWebhook, setIsTestingWebhook] = useState(false);

    React.useEffect(() => {
        const fetchSettings = async () => {
            const result = await runQuery("SELECT value FROM settings WHERE key = 'webhook_url'");
            if (result && result.length > 0) {
                setWebhookUrl(result[0].value);
            }
        };
        fetchSettings();
    }, [currentView]);

    const handleSaveWebhook = async () => {
        await runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES ('webhook_url', ?)", [webhookUrl]);
        alert('Notification settings saved successfully!');
    };

    const handleTestWebhook = async () => {
        if (!webhookUrl) return alert('Please enter a Webhook URL first.');
        setIsTestingWebhook(true);
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
            alert('Failed to send test notification. Check console for errors.');
        } finally {
            setIsTestingWebhook(false);
        }
    };

    React.useEffect(() => {
        const root = window.document.documentElement;

        const removeOldTheme = () => {
            root.classList.remove('light', 'dark');
        };

        const applyTheme = (t: 'light' | 'dark' | 'system') => {
            removeOldTheme();
            if (t === 'system') {
                const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                root.classList.add(systemTheme);
                return;
            }
            root.classList.add(t);
        };

        applyTheme(theme);

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme('system');
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme]);

    // Sync state if new tiles are added to the configuration
    React.useEffect(() => {
        const allTileIds = TILES.map(t => t.id);
        const newTiles = allTileIds.filter(id => !tileOrder.includes(id));

        if (newTiles.length > 0) {
            setTileOrder(prev => [...prev, ...newTiles]);
            setVisibleTileIds(prev => [...new Set([...prev, ...newTiles])]);
        }
    }, [tileOrder, setTileOrder, visibleTileIds, setVisibleTileIds]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-200 ease-in-out
                md:relative md:translate-x-0
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between md:flex-col md:items-start md:gap-2">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-blue-600 rounded-lg shadow-lg shadow-blue-200 dark:shadow-none">
                            <ShieldCheck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                                IT <span className="text-blue-600">Dashboard</span>
                            </h1>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Analytics Platform</p>
                        </div>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-slate-500 hover:text-slate-700">
                        <Menu className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex flex-col h-[calc(100%-80px)] justify-between">
                    <nav className="p-4 space-y-1">
                        <button
                            onClick={() => { setCurrentView('dashboard'); setSidebarOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentView === 'dashboard' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                        >
                            <LayoutDashboard className="w-5 h-5" />
                            Overview
                        </button>
                        <button
                            onClick={() => { setCurrentView('datasource'); setSidebarOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentView === 'datasource' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                        >
                            <Database className="w-5 h-5" />
                            Data Source
                        </button>
                        <button
                            onClick={() => { setCurrentView('settings'); setSidebarOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentView === 'settings' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                        >
                            <Settings className="w-5 h-5" />
                            Settings
                        </button>
                    </nav>

                    <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                        <SystemStatus />
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Mobile Header */}
                <header className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                    <button onClick={() => setSidebarOpen(true)} className="p-1 text-slate-500 hover:text-slate-700">
                        <Menu className="w-6 h-6" />
                    </button>
                    <h1 className="text-lg font-bold">IT Dashboard</h1>
                </header>

                <div className="flex-1 overflow-auto">
                    {currentView === 'dashboard' && (
                        <div className="animate-in fade-in duration-500">
                            <TileGrid
                                onNavigate={(view: any) => setCurrentView(view)}
                                visibleTileIds={visibleTileIds}
                                tileOrder={tileOrder}
                                onOrderChange={setTileOrder}
                                onRemoveTile={(id) => setVisibleTileIds(visibleTileIds.filter(v => v !== id))}
                            />
                        </div>
                    )}

                    {currentView === 'datasource' && (
                        <div className="p-8 max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Data Management</h2>
                                <p className="text-slate-500 dark:text-slate-400">
                                    Import your data from Excel or CSV files. The data will be stored locally in your browser's SQLite database.
                                </p>
                            </div>

                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-6 mb-6">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-1">
                                            <Info className="w-4 h-4" />
                                            Sample Data Setup
                                        </h3>
                                        <p className="text-xs text-blue-700/70 dark:text-blue-300/60 max-w-md">
                                            New to the dashboard? Load sample data to explore tiles, charts and database functions immediately.
                                        </p>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                const { loadDemoData, initSchema, initDB } = await import('../lib/db');
                                                await initDB();
                                                await initSchema();
                                                await loadDemoData();
                                                window.dispatchEvent(new Event('db-updated'));
                                                setCurrentView('dashboard');
                                            } catch (e) {
                                                console.error(e);
                                                alert('Failed to load data');
                                            }
                                        }}
                                        className="flex-shrink-0 flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-blue-200 dark:shadow-none"
                                    >
                                        Load Demo Data
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm mb-6">
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Import Data</h3>
                                <ExcelImport onImportComplete={() => setCurrentView('dashboard')} />
                            </div>


                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm mb-6">
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Backup & Restore</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button
                                        onClick={async () => {
                                            const { exportDatabase } = await import('../lib/db');
                                            const bytes = await exportDatabase();
                                            const blob = new Blob([bytes as any], { type: 'application/x-sqlite3' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = 'itdashboard.sqlite3';
                                            a.click();
                                            URL.revokeObjectURL(url);
                                        }}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-xl transition-all shadow-sm"
                                    >
                                        <Database className="w-4 h-4 text-blue-500" />
                                        Download Database (.sqlite3)
                                    </button>

                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept=".sqlite3"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (confirm('Importing a database will overwrite your current local data. The page will reload after import. Continue?')) {
                                                    try {
                                                        const { importDatabase } = await import('../lib/db');
                                                        const buffer = await file.arrayBuffer();
                                                        await importDatabase(buffer);
                                                        alert('Database restored successfully. Reloading...');
                                                        window.location.reload();
                                                    } catch (err: any) {
                                                        console.error(err);
                                                        alert('Failed to import database: ' + err.message);
                                                    }
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-xl transition-all shadow-sm pointer-events-none">
                                            <Upload className="w-4 h-4 text-indigo-500" />
                                            Restore from Backup (.sqlite3)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-6">
                                <SchemaDocumentation
                                    schema={invoiceItemsSchema}
                                    title="Expected Invoice Format"
                                />
                            </div>
                        </div>
                    )}

                    {currentView === 'settings' && (
                        <div className="p-8 max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Settings</h2>

                            {/* Appearance Section */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm mb-6">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                        {theme === 'light' ? '🌞' : theme === 'dark' ? '🌚' : '💻'}
                                    </span>
                                    Appearance
                                </h3>
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Customize how the IT Dashboard looks on your device.
                                    </p>

                                    <div className="grid grid-cols-3 gap-3">
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === 'light'
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400'
                                                }`}
                                        >
                                            <span className="text-xl">🌞</span>
                                            <span className="text-sm font-medium">Light</span>
                                        </button>
                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === 'dark'
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400'
                                                }`}
                                        >
                                            <span className="text-xl">🌚</span>
                                            <span className="text-sm font-medium">Dark</span>
                                        </button>
                                        <button
                                            onClick={() => setTheme('system')}
                                            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === 'system'
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400'
                                                }`}
                                        >
                                            <span className="text-xl">💻</span>
                                            <span className="text-sm font-medium">System</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Dashboard Customization Section */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                        🧩
                                    </span>
                                    Dashboard Customization
                                </h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {tileOrder.map(id => TILES.find(t => t.id === id)).filter(Boolean).map((tile: any) => (
                                        <div
                                            key={tile!.id}
                                            className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${visibleTileIds.includes(tile!.id) ? 'bg-blue-500' : 'bg-slate-300'}`} />
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{tile!.title}</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (visibleTileIds.includes(tile!.id)) {
                                                        setVisibleTileIds(visibleTileIds.filter(id => id !== tile!.id));
                                                    } else {
                                                        setVisibleTileIds([...visibleTileIds, tile!.id]);
                                                    }
                                                }}
                                                className={`w-12 h-6 rounded-full transition-colors relative ${visibleTileIds.includes(tile!.id) ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${visibleTileIds.includes(tile!.id) ? 'left-7' : 'left-1'}`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Global Notification Settings Section */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm mt-6">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                        <Bell className="w-4 h-4 text-blue-500" />
                                    </span>
                                    Global Notification Settings
                                </h3>
                                <div className="space-y-6">
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Configure how you receive automated alerts for system outages and anomalies.
                                    </p>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Webhook URL (Slack/Teams)</label>
                                        <input
                                            type="url"
                                            placeholder="https://hooks.slack.com/services/..."
                                            className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-slate-900 dark:text-white font-bold"
                                            value={webhookUrl}
                                            onChange={(e) => setWebhookUrl(e.target.value)}
                                        />
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleSaveWebhook}
                                            className="flex-1 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 hover:bg-slate-800 dark:hover:bg-slate-100"
                                        >
                                            <Save className="w-5 h-5" />
                                            Save Settings
                                        </button>
                                        <button
                                            onClick={handleTestWebhook}
                                            disabled={isTestingWebhook || !webhookUrl}
                                            className="px-6 py-4 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-white font-black rounded-xl transition-all flex items-center justify-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-5 h-5 ${isTestingWebhook ? 'animate-spin' : ''}`} />
                                            Test
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {
                        currentView === 'it-costs-year' && (
                            <div className="animate-in slide-in-from-right-4 duration-500 h-full">
                                <ItCostsYearView
                                    onBack={() => setCurrentView('dashboard')}
                                    onDrillDown={(period: string) => {
                                        setSelectedPeriod(period);
                                        setCurrentView('it-costs-month');
                                    }}
                                />
                            </div>
                        )
                    }

                    {
                        currentView === 'it-costs-month' && selectedPeriod && (
                            <div className="animate-in slide-in-from-right-4 duration-500 h-full">
                                <ItCostsMonthView
                                    period={selectedPeriod}
                                    onBack={() => setCurrentView('it-costs-year')}
                                    onDrillDown={(invoiceId: string) => {
                                        setSelectedInvoiceId(invoiceId);
                                        setCurrentView('it-costs-invoice');
                                    }}
                                />
                            </div>
                        )
                    }

                    {
                        currentView === 'it-costs-invoice' && selectedInvoiceId && (
                            <div className="animate-in slide-in-from-right-4 duration-500 h-full">
                                <ItCostsInvoiceItemsView
                                    invoiceId={selectedInvoiceId}
                                    period={selectedPeriod || ''}
                                    onBack={() => setCurrentView('it-costs-month')}
                                    onViewHistory={(item: any) => {
                                        setSelectedItem(item);
                                        setCurrentView('it-costs-item-history');
                                    }}
                                />
                            </div>
                        )
                    }

                    {
                        currentView === 'it-costs-item-history' && selectedItem && (
                            <div className="animate-in slide-in-from-right-4 duration-500 h-full">
                                <ItCostsItemHistoryView
                                    item={selectedItem}
                                    onBack={() => setCurrentView('it-costs-invoice')}
                                />
                            </div>
                        )
                    }

                    {
                        currentView === 'data-inspector' && (
                            <div className="animate-in slide-in-from-right-4 duration-500 h-full">
                                <DataInspector onBack={() => setCurrentView('dashboard')} />
                            </div>
                        )
                    }

                    {
                        currentView === 'systems-management' && (
                            <div className="animate-in slide-in-from-right-4 duration-500 h-full">
                                <SystemsManagementView onBack={() => setCurrentView('dashboard')} />
                            </div>
                        )
                    }
                </div >
            </main >

            {/* Overlay for mobile */}
            {
                sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 md:hidden glass"
                        onClick={() => setSidebarOpen(false)}
                    />
                )
            }
        </div >
    );
};
