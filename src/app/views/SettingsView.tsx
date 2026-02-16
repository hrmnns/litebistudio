import React, { useState, useEffect } from 'react';
import { Bell, Save, RefreshCw } from 'lucide-react';
import { SettingsRepository } from '../../lib/repositories/SettingsRepository';
import { TILES } from '../../config/tiles';
import type { ThemeMode } from '../../hooks/useTheme';

interface SettingsViewProps {
    theme: ThemeMode;
    setTheme: (t: ThemeMode) => void;
    visibleTileIds: string[];
    setVisibleTileIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    tileOrder: string[];
    onBack: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
    theme,
    setTheme,
    visibleTileIds,
    setVisibleTileIds,
    tileOrder,
}) => {
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

    const themeOptions: { value: ThemeMode; emoji: string; label: string }[] = [
        { value: 'light', emoji: '🌞', label: 'Light' },
        { value: 'dark', emoji: '🌚', label: 'Dark' },
        { value: 'system', emoji: '💻', label: 'System' },
    ];

    return (
        <div className="h-full overflow-y-auto p-8 max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
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

            {/* Dashboard Customization Section */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                        🧩
                    </span>
                    Dashboard Customization
                </h3>
                <div className="grid grid-cols-1 gap-2">
                    {tileOrder.map(id => TILES.find(t => t.id === id)).filter(Boolean).map((tile) => (
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
    );
};
