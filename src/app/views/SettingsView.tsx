import React from 'react';
import { useThemeContext, type ThemeMode } from '../../lib/context/ThemeContext';
import { PageLayout } from '../components/ui/PageLayout';
import { Lock, Shield, Trash2, Check, X } from 'lucide-react';
import { hashPin } from '../../lib/utils/crypto';

export const SettingsView: React.FC = () => {
    const { theme, setTheme } = useThemeContext();

    const themeOptions: { value: ThemeMode; emoji: string; label: string }[] = [
        { value: 'light', emoji: '🌞', label: 'Hell' },
        { value: 'dark', emoji: '🌚', label: 'Dunkel' },
        { value: 'system', emoji: '💻', label: 'System' },
    ];

    const [hasPin, setHasPin] = React.useState(!!localStorage.getItem('itdashboard_app_pin'));
    const [isEditingPin, setIsEditingPin] = React.useState(false);
    const [pinInput, setPinInput] = React.useState('');

    const handleSavePin = async () => {
        if (pinInput.length < 4) {
            alert('Die PIN muss mindestens 4 Stellen haben.');
            return;
        }
        const hash = await hashPin(pinInput);
        localStorage.setItem('itdashboard_app_pin', hash);
        setHasPin(true);
        setIsEditingPin(false);
        setPinInput('');
        alert('PIN-Schutz aktiviert.');
    };

    const handleRemovePin = () => {
        if (window.confirm('Möchten Sie den PIN-Schutz wirklich entfernen?')) {
            localStorage.removeItem('itdashboard_app_pin');
            setHasPin(false);
        }
    };

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
            breadcrumbs={[
                { label: 'Einstellungen' }
            ]}
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

                {/* Security Section */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                            <Shield className="w-4 h-4 text-emerald-500" />
                        </span>
                        Sicherheit
                    </h3>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Schützen Sie den Zugriff auf das Dashboard.
                        </p>

                        {!hasPin && !isEditingPin && (
                            <button
                                onClick={() => setIsEditingPin(true)}
                                className="w-full h-12 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl flex items-center justify-center gap-2 text-slate-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all font-medium"
                            >
                                <Lock className="w-4 h-4" />
                                PIN-Schutz aktivieren
                            </button>
                        )}

                        {isEditingPin && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="Neue PIN (min. 4 Stellen)"
                                    className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={pinInput}
                                    onChange={(e) => setPinInput(e.target.value)}
                                    autoFocus
                                />
                                <button
                                    onClick={handleSavePin}
                                    className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                                    title="Speichern"
                                >
                                    <Check className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => { setIsEditingPin(false); setPinInput(''); }}
                                    className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                                    title="Abbrechen"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        {hasPin && (
                            <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                                        <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-emerald-900 dark:text-emerald-100">PIN-Schutz aktiv</div>
                                        <div className="text-xs text-emerald-700 dark:text-emerald-400">Dashboard ist gesperrt beim Neustart</div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleRemovePin}
                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Schutz entfernen"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>


            </div>
        </PageLayout>
    );
};
