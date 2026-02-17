import React, { useState, useEffect } from 'react';
import { Bell, Save, RefreshCw } from 'lucide-react';
import { SettingsRepository } from '../../lib/repositories/SettingsRepository';
import { COMPONENTS } from '../../config/components';
import { useThemeContext, type ThemeMode } from '../../lib/context/ThemeContext';
import { useDashboard } from '../../lib/context/DashboardContext';
import { PageLayout } from '../components/ui/PageLayout';

export const SettingsView: React.FC = () => {
    const { theme, setTheme } = useThemeContext();
    const {
        visibleComponentIds,
        setVisibleComponentIds,
        visibleSidebarComponentIds,
        setVisibleSidebarComponentIds,
        componentOrder
    } = useDashboard();
    const [webhookUrl, setWebhookUrl] = useState('');
    const [isTestingWebhook, setIsTestingWebhook] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            const url = await SettingsRepository.get('webhook_url');
            if (url) {
                setWebhookUrl(url);
            }
        };
        fetchSettings();
    }, []);

    const handleSaveWebhook = async () => {
        await SettingsRepository.set('webhook_url', webhookUrl);
        alert('Benachrichtigungseinstellungen gespeichert!');
    };

    const handleTestWebhook = async () => {
        if (!webhookUrl) return alert('Bitte zuerst eine Webhook-URL eingeben.');
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
            alert('Test-Benachrichtigung gesendet! Prüfe deinen Slack/Teams-Kanal.');
        } catch (err) {
            console.error('Test failed', err);
            alert('Fehler beim Senden der Test-Benachrichtigung.');
        } finally {
            setIsTestingWebhook(false);
        }
    };

    const themeOptions: { value: ThemeMode; emoji: string; label: string }[] = [
        { value: 'light', emoji: '🌞', label: 'Hell' },
        { value: 'dark', emoji: '🌚', label: 'Dunkel' },
        { value: 'system', emoji: '💻', label: 'System' },
    ];

    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    return (
        <PageLayout
            header={{
                title: 'Einstellungen',
                subtitle: 'Dashboard-Konfiguration und Benachrichtigungen',
                onBack: () => window.history.back(),
            }}
            footer={footerText}
        >
            <div className="max-w-2xl space-y-6">

                {/* Appearance Section */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                            {theme === 'light' ? '🌞' : theme === 'dark' ? '🌚' : '💻'}
                        </span>
                        Darstellung
                    </h3>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Passe das Erscheinungsbild des Dashboards an.
                        </p>

                        <div className="grid grid-cols-3 gap-3">
                            {themeOptions.map(({ value, emoji, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setTheme(value)}
                                    className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === value
                                        ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800'
                                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400'
                                        }`}
                                >
                                    <span className="text-xl">{emoji}</span>
                                    <span className="text-sm font-medium">{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Komponenten-Management Section */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                            🧩
                        </span>
                        Komponenten-Management
                    </h3>
                    <div className="flex items-center justify-between px-4 mb-4">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Komponente</span>
                        <div className="flex gap-12 mr-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overview</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sidebar</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {componentOrder.map(id => COMPONENTS.find(t => t.id === id)).filter(Boolean).map((component) => (
                            <div
                                key={component!.id}
                                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${visibleComponentIds.includes(component!.id) ? 'bg-blue-500' : 'bg-slate-300'}`} />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{component!.title}</span>
                                        {!component!.targetView && <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Nur Kachel</span>}
                                    </div>
                                </div>

                                <div className="flex items-center gap-10">
                                    {/* Overview Toggle */}
                                    <button
                                        onClick={() => {
                                            if (visibleComponentIds.includes(component!.id)) {
                                                setVisibleComponentIds(visibleComponentIds.filter(id => id !== component!.id));
                                            } else {
                                                setVisibleComponentIds([...visibleComponentIds, component!.id]);
                                            }
                                        }}
                                        title="Im Dashboard anzeigen/verstecken"
                                        className={`w-12 h-6 rounded-full transition-colors relative ${visibleComponentIds.includes(component!.id) ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${visibleComponentIds.includes(component!.id) ? 'left-7' : 'left-1'}`} />
                                    </button>

                                    {/* Sidebar Toggle */}
                                    <button
                                        disabled={!component!.targetView}
                                        onClick={() => {
                                            if (visibleSidebarComponentIds.includes(component!.id)) {
                                                setVisibleSidebarComponentIds(visibleSidebarComponentIds.filter(id => id !== component!.id));
                                            } else {
                                                setVisibleSidebarComponentIds([...visibleSidebarComponentIds, component!.id]);
                                            }
                                        }}
                                        title={component!.targetView ? "In der Sidebar anzeigen/verstecken" : "Keine Detailansicht verfügbar"}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${component!.targetView ? (visibleSidebarComponentIds.includes(component!.id) ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700') : 'bg-slate-100 dark:bg-slate-800 opacity-50 cursor-not-allowed'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${visibleSidebarComponentIds.includes(component!.id) && component!.targetView ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Global Notification Settings Section */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                            <Bell className="w-4 h-4 text-blue-500" />
                        </span>
                        Benachrichtigungen
                    </h3>
                    <div className="space-y-6">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Konfiguriere automatische Benachrichtigungen bei Systemausfällen und Anomalien.
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
                                className="flex-1 h-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-slate-100"
                            >
                                <Save className="w-4 h-4" />
                                Speichern
                            </button>
                            <button
                                onClick={handleTestWebhook}
                                disabled={isTestingWebhook || !webhookUrl}
                                className="h-10 px-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${isTestingWebhook ? 'animate-spin' : ''}`} />
                                Test
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </PageLayout>
    );
};
