import React from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeContext, type ThemeMode } from '../../lib/context/ThemeContext';
import { PageLayout } from '../components/ui/PageLayout';
import { Lock, Shield, Trash2, Check, X, Info, ChevronRight, Palette, SlidersHorizontal, Bell, Table2, Globe, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { hashPin, generateSalt } from '../../lib/utils/crypto';
import { useDashboard } from '../../lib/context/DashboardContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { LOG_LEVEL_STORAGE_KEY, type AppLogLevel } from '../../lib/logging';
import { appDialog } from '../../lib/appDialog';
import { SystemHealthModal } from '../components/SystemHealthModal';
import { clearSavedBackupDirectory, getSavedBackupDirectoryLabel, isBackupDirectorySupported, pickAndSaveBackupDirectory } from '../../lib/utils/backupLocation';

type SettingsTab = 'appearance' | 'security' | 'apps' | 'controls' | 'about';
type AppsSubTab = 'inspector' | 'querybuilder' | 'datamanagement';
type ControlsSubTab = 'datatable' | 'notifications';

export const SettingsView: React.FC = () => {
    const { t, i18n } = useTranslation();
    const version = __APP_VERSION__;
    const buildNumber = __BUILD_NUMBER__;
    const { theme, setTheme } = useThemeContext();
    const { isReadOnly, isAdminMode, setIsAdminMode } = useDashboard();
    const [activeTab, setActiveTab] = React.useState<SettingsTab>('appearance');
    const [appsSubTab, setAppsSubTab] = React.useState<AppsSubTab>('inspector');
    const [controlsSubTab, setControlsSubTab] = React.useState<ControlsSubTab>('datatable');
    const [isHealthModalOpen, setIsHealthModalOpen] = React.useState(false);

    const themeOptions: { value: ThemeMode; label: string }[] = [
        { value: 'light', label: t('settings.theme_light') },
        { value: 'dark', label: t('settings.theme_dark') },
        { value: 'system', label: t('settings.theme_system') }
    ];

    const [hasPin, setHasPin] = React.useState(!!localStorage.getItem('litebistudio_app_pin'));
    const [isEditingPin, setIsEditingPin] = React.useState(false);
    const [pinInput, setPinInput] = React.useState('');

    const [inspectorPageSize, setInspectorPageSize] = useLocalStorage<number>('data_inspector_page_size', 100);
    const [inspectorShowProfiling, setInspectorShowProfiling] = useLocalStorage<boolean>('data_inspector_show_profiling', true);
    const [inspectorExplainMode, setInspectorExplainMode] = useLocalStorage<boolean>('data_inspector_explain_mode', false);
    const [inspectorSqlAssistOpen, setInspectorSqlAssistOpen] = useLocalStorage<boolean>('data_inspector_sql_assist_open', false);
    const [inspectorAutocomplete, setInspectorAutocomplete] = useLocalStorage<boolean>('data_inspector_autocomplete_enabled', true);
    const [inspectorSqlRequireLimitConfirm, setInspectorSqlRequireLimitConfirm] = useLocalStorage<boolean>('data_inspector_sql_require_limit_confirm', true);
    const [inspectorSqlMaxRows, setInspectorSqlMaxRows] = useLocalStorage<number>('data_inspector_sql_max_rows', 5000);
    const [inspectorThresholds, setInspectorThresholds] = useLocalStorage<{ nullRate: number; cardinalityRate: number }>(
        'data_inspector_profiling_thresholds',
        { nullRate: 30, cardinalityRate: 95 }
    );
    const [qbDefaultMode, setQbDefaultMode] = useLocalStorage<'sql' | 'visual'>('query_builder_default_mode', 'visual');
    const [qbSqlEditorHeight, setQbSqlEditorHeight] = useLocalStorage<number>('query_builder_sql_editor_height', 384);
    const [importDefaultMode, setImportDefaultMode] = useLocalStorage<'append' | 'overwrite'>('import_default_mode', 'append');
    const [importAutoSaveMappings, setImportAutoSaveMappings] = useLocalStorage<boolean>('import_auto_save_mappings', true);
    const [backupNamePattern, setBackupNamePattern] = useLocalStorage<string>('backup_file_name_pattern', 'backup_{date}_{mode}');
    const [backupUseSavedLocation, setBackupUseSavedLocation] = useLocalStorage<boolean>('backup_use_saved_location', true);
    const [backupFolderLabel, setBackupFolderLabel] = useLocalStorage<string>('backup_saved_folder_label', '');
    const [tableDensity, setTableDensity] = useLocalStorage<'compact' | 'normal'>('ui_table_density', 'normal');
    const [tableWrapCells, setTableWrapCells] = useLocalStorage<boolean>('ui_table_wrap_cells', false);
    const [tableDefaultShowFilters, setTableDefaultShowFilters] = useLocalStorage<boolean>('data_table_default_show_filters', false);
    const [confirmDestructive, setConfirmDestructive] = useLocalStorage<boolean>('notifications_confirm_destructive', true);
    const [appLogLevel, setAppLogLevel] = useLocalStorage<AppLogLevel>(LOG_LEVEL_STORAGE_KEY, 'error');
    const [showSidebarLanguageSwitch, setShowSidebarLanguageSwitch] = useLocalStorage<boolean>('ui_sidebar_show_language_switch', true);
    const [showSidebarSystemStatus, setShowSidebarSystemStatus] = useLocalStorage<boolean>('ui_sidebar_show_system_status', true);

    const confirmAction = async (message: string): Promise<boolean> => {
        if (!confirmDestructive) return true;
        return await appDialog.confirm(message);
    };

    const handleResetInspectorLayout = async () => {
        if (!(await confirmAction(t('settings.inspector_reset_layout_confirm')))) return;
        localStorage.removeItem('data_inspector_column_widths_v1');
        localStorage.removeItem('data_inspector_saved_views');
        localStorage.removeItem('data_inspector_active_view');
        localStorage.removeItem('data_inspector_sql_editor_height');
        await appDialog.info(t('settings.inspector_reset_layout_done'));
    };

    const handleClearInspectorSqlMemory = async () => {
        if (!(await confirmAction(t('settings.inspector_reset_sql_confirm')))) return;
        localStorage.removeItem('data_inspector_sql_history');
        localStorage.removeItem('data_inspector_favorite_queries');
        localStorage.removeItem('data_inspector_custom_sql_templates');
        localStorage.removeItem('data_inspector_selected_custom_template');
        await appDialog.info(t('settings.inspector_reset_sql_done'));
    };

    const handleSavePin = async () => {
        if (pinInput.length < 4) {
            await appDialog.warning(t('settings.pin_error_min'));
            return;
        }

        const salt = generateSalt();
        const hash = await hashPin(pinInput, salt);

        localStorage.setItem('litebistudio_app_pin_salt', salt);
        localStorage.setItem('litebistudio_app_pin', hash);

        setHasPin(true);
        setIsEditingPin(false);
        setPinInput('');
        window.dispatchEvent(new Event('pin-changed'));
        await appDialog.info(t('settings.pin_success'));
    };

    const handleRemovePin = async () => {
        if (await appDialog.confirm(t('settings.pin_confirm_remove'))) {
            localStorage.removeItem('litebistudio_app_pin');
            localStorage.removeItem('litebistudio_app_pin_salt');
            setHasPin(false);
            window.dispatchEvent(new Event('pin-changed'));
        }
    };

    const now = new Date();
    const lang = i18n.language.startsWith('de') ? 'de-DE' : 'en-US';
    const backupFolderSupported = isBackupDirectorySupported();
    const footerText = t('settings.last_update', {
        date: now.toLocaleDateString(lang),
        time: now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
    });

    const handleChooseBackupFolder = async () => {
        try {
            const label = await pickAndSaveBackupDirectory();
            setBackupFolderLabel(label || getSavedBackupDirectoryLabel());
        } catch {
            await appDialog.warning(t('settings.backup_folder_select_error', 'Folder could not be selected.'));
        }
    };

    const handleClearBackupFolder = async () => {
        await clearSavedBackupDirectory();
        setBackupFolderLabel('');
    };

    return (
        <PageLayout
            header={{
                title: t('sidebar.settings'),
                subtitle: t('settings.subtitle')
            }}
            rightPanel={{
                title: t('settings.quick_access_panel', 'Quick Access'),
                triggerTitle: t('settings.quick_access_open', 'Quick Access'),
                width: 'sm',
                content: (
                    <div className="space-y-4 text-sm">
                        <p className="text-slate-500">
                            {t('settings.quick_access_hint', 'Open frequently used sections without adding more controls to the main layout.')}
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab('appearance')}
                                className={`px-3 py-2 rounded-lg text-left border transition-colors ${
                                    activeTab === 'appearance'
                                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {t('settings.tab_appearance')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('security')}
                                className={`px-3 py-2 rounded-lg text-left border transition-colors ${
                                    activeTab === 'security'
                                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {t('settings.tab_security')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveTab('apps');
                                    setAppsSubTab('inspector');
                                }}
                                className={`px-3 py-2 rounded-lg text-left border transition-colors ${
                                    activeTab === 'apps'
                                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {t('sidebar.data_inspector')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsHealthModalOpen(true)}
                                className="px-3 py-2 rounded-lg text-left border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                {t('settings.open_health_check', 'Open Health Check')}
                            </button>
                        </div>
                    </div>
                )
            }}
            footer={footerText}
            breadcrumbs={[
                { label: t('sidebar.settings') }
            ]}
        >
            <div className="max-w-3xl space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center overflow-x-auto">
                        {[
                            { id: 'appearance', label: t('settings.tab_appearance') },
                            { id: 'security', label: t('settings.tab_security') },
                            { id: 'apps', label: t('settings.tab_apps', 'Apps') },
                            { id: 'controls', label: t('settings.tab_controls', 'Controls') },
                            { id: 'about', label: t('settings.tab_about') }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as SettingsTab)}
                                className={`px-4 py-2.5 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'text-blue-600 border-blue-600'
                                        : 'text-slate-400 hover:text-blue-600 border-transparent'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {activeTab === 'apps' && (
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 -mt-2">
                        <div className="flex items-center overflow-x-auto">
                            {[
                                { id: 'inspector', label: t('sidebar.data_inspector') },
                                { id: 'querybuilder', label: t('sidebar.query_builder') },
                                { id: 'datamanagement', label: t('sidebar.datasource') }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setAppsSubTab(tab.id as AppsSubTab)}
                                    className={`px-4 py-2 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
                                        appsSubTab === tab.id
                                            ? 'text-blue-600 border-blue-600'
                                            : 'text-slate-400 hover:text-blue-600 border-transparent'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'controls' && (
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 -mt-2">
                        <div className="flex items-center overflow-x-auto">
                            {[
                                { id: 'datatable', label: t('settings.tab_datatable') },
                                { id: 'notifications', label: t('settings.tab_notifications') }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setControlsSubTab(tab.id as ControlsSubTab)}
                                    className={`px-4 py-2 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
                                        controlsSubTab === tab.id
                                            ? 'text-blue-600 border-blue-600'
                                            : 'text-slate-400 hover:text-blue-600 border-transparent'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'appearance' && (
                    <div className={`space-y-4 transition-opacity ${isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                    <Palette className="w-4 h-4 text-blue-500" />
                                </span>
                                {t('settings.appearance')}
                            </h3>
                            <div className="space-y-4">
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.appearance_hint')}</p>
                                <div className="grid grid-cols-3 gap-3">
                                    {themeOptions.map(({ value, label }) => (
                                        <button
                                            key={value}
                                            onClick={() => setTheme(value)}
                                            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === value
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400'
                                                }`}
                                        >
                                            <span className="text-sm font-medium">{label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                    <Globe className="w-4 h-4 text-blue-500" />
                                </span>
                                {t('settings.language_panel_title')}
                            </h3>
                            <div className="space-y-4">
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.language_panel_hint')}</p>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                                            {t('settings.language')}
                                        </label>
                                        <select
                                            value={i18n.language.startsWith('de') ? 'de' : 'en'}
                                            onChange={(e) => void i18n.changeLanguage(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200"
                                        >
                                            <option value="de">{t('settings.language_de')}</option>
                                            <option value="en">{t('settings.language_en')}</option>
                                        </select>
                                    </div>
                                    <div className="flex items-end">
                                        <label className="w-full flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <Globe className="w-4 h-4 text-blue-500" />
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    {t('settings.show_sidebar_language_switch')}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = !showSidebarLanguageSwitch;
                                                    setShowSidebarLanguageSwitch(next);
                                                    window.dispatchEvent(new CustomEvent('sidebar-language-visibility-changed', { detail: { visible: next } }));
                                                }}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showSidebarLanguageSwitch ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                                aria-pressed={showSidebarLanguageSwitch}
                                                aria-label={t('settings.show_sidebar_language_switch')}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showSidebarLanguageSwitch ? 'translate-x-6' : 'translate-x-1'}`}
                                                />
                                            </button>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                    <Activity className="w-4 h-4 text-blue-500" />
                                </span>
                                {t('settings.health_link_title')}
                            </h3>
                            <div className="space-y-4">
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.health_link_hint')}</p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        onClick={() => setIsHealthModalOpen(true)}
                                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                        <Activity className="w-4 h-4" />
                                        {t('settings.health_link_open')}
                                    </button>
                                    <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                            {t('settings.show_sidebar_system_status')}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const next = !showSidebarSystemStatus;
                                                setShowSidebarSystemStatus(next);
                                                window.dispatchEvent(new CustomEvent('sidebar-system-status-visibility-changed', { detail: { visible: next } }));
                                            }}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showSidebarSystemStatus ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                            aria-pressed={showSidebarSystemStatus}
                                            aria-label={t('settings.show_sidebar_system_status')}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showSidebarSystemStatus ? 'translate-x-6' : 'translate-x-1'}`}
                                            />
                                        </button>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'security' && (
                    <div className={`space-y-4 transition-opacity ${isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                    <Lock className="w-4 h-4 text-emerald-500" />
                                </span>
                                {t('settings.access_restriction_title')}
                            </h3>
                            <div className="space-y-4">
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.access_restriction_hint')}</p>

                                {!hasPin && !isEditingPin && (
                                    <button
                                        onClick={() => setIsEditingPin(true)}
                                        className="w-full h-12 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl flex items-center justify-center gap-2 text-slate-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all font-medium"
                                    >
                                        <Lock className="w-4 h-4" />
                                        {t('settings.enable_pin')}
                                    </button>
                                )}

                                {isEditingPin && (
                                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                                        <input
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            placeholder={t('settings.pin_placeholder')}
                                            className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            value={pinInput}
                                            onChange={(e) => setPinInput(e.target.value)}
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleSavePin}
                                            className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                                            title={t('common.save')}
                                        >
                                            <Check className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => { setIsEditingPin(false); setPinInput(''); }}
                                            className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                                            title={t('common.cancel')}
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
                                                <div className="font-semibold text-emerald-900 dark:text-emerald-100">{t('settings.pin_active')}</div>
                                                <div className="text-xs text-emerald-700 dark:text-emerald-400">{t('settings.pin_active_hint')}</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleRemovePin}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            title={t('common.remove')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                    <Shield className="w-4 h-4 text-amber-500" />
                                </span>
                                {t('settings.admin_mode')}
                            </h3>
                            <div className="space-y-4">
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.admin_mode_panel_hint')}</p>
                                <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('settings.admin_mode_hint')}</div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={isAdminMode}
                                            onChange={() => setIsAdminMode(!isAdminMode)}
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"></div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'apps' && appsSubTab === 'inspector' && (
                    <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm transition-opacity ${isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                <SlidersHorizontal className="w-4 h-4 text-blue-500" />
                            </span>
                            {t('settings.inspector_title')}
                        </h3>
                        <div className="space-y-5">
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.inspector_hint')}</p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.inspector_autocomplete')}</span>
                                    <input type="checkbox" className="h-4 w-4" checked={inspectorAutocomplete} onChange={() => setInspectorAutocomplete(!inspectorAutocomplete)} />
                                </label>
                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.inspector_explain')}</span>
                                    <input type="checkbox" className="h-4 w-4" checked={inspectorExplainMode} onChange={() => setInspectorExplainMode(!inspectorExplainMode)} />
                                </label>
                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.inspector_sql_assist')}</span>
                                    <input type="checkbox" className="h-4 w-4" checked={inspectorSqlAssistOpen} onChange={() => setInspectorSqlAssistOpen(!inspectorSqlAssistOpen)} />
                                </label>
                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.inspector_profiling')}</span>
                                    <input type="checkbox" className="h-4 w-4" checked={inspectorShowProfiling} onChange={() => setInspectorShowProfiling(!inspectorShowProfiling)} />
                                </label>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.inspector_page_size')}</label>
                                <select
                                    value={String(inspectorPageSize)}
                                    onChange={(e) => setInspectorPageSize(Number(e.target.value))}
                                    className="w-full sm:w-52 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                >
                                    {[50, 100, 250, 500].map((size) => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.inspector_thresholds')}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <label className="space-y-1">
                                        <span className="text-xs text-slate-500">{t('settings.inspector_null_threshold')}</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={inspectorThresholds.nullRate}
                                            onChange={(e) => {
                                                const next = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                                setInspectorThresholds({ ...inspectorThresholds, nullRate: next });
                                            }}
                                            className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                        />
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-xs text-slate-500">{t('settings.inspector_cardinality_threshold')}</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={inspectorThresholds.cardinalityRate}
                                            onChange={(e) => {
                                                const next = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                                setInspectorThresholds({ ...inspectorThresholds, cardinalityRate: next });
                                            }}
                                            className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.inspector_sql_safety')}</p>
                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.inspector_sql_confirm_without_limit')}</span>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={inspectorSqlRequireLimitConfirm}
                                        onChange={() => setInspectorSqlRequireLimitConfirm(!inspectorSqlRequireLimitConfirm)}
                                    />
                                </label>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500">{t('settings.inspector_sql_max_rows')}</label>
                                    <input
                                        type="number"
                                        min={100}
                                        max={50000}
                                        value={inspectorSqlMaxRows}
                                        onChange={(e) => {
                                            const next = Math.max(100, Math.min(50000, Number(e.target.value) || 100));
                                            setInspectorSqlMaxRows(next);
                                        }}
                                        className="w-full sm:w-52 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.inspector_reset_title')}</p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={handleResetInspectorLayout}
                                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                    >
                                        {t('settings.inspector_reset_layout')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearInspectorSqlMemory}
                                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                    >
                                        {t('settings.inspector_reset_sql')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'apps' && appsSubTab === 'querybuilder' && (
                    <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm transition-opacity ${isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                <SlidersHorizontal className="w-4 h-4 text-blue-500" />
                            </span>
                            {t('settings.querybuilder_title')}
                        </h3>
                        <div className="space-y-5">
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.querybuilder_hint')}</p>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.querybuilder_default_mode')}</label>
                                <select
                                    value={qbDefaultMode}
                                    onChange={(e) => setQbDefaultMode(e.target.value as 'sql' | 'visual')}
                                    className="w-full sm:w-52 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                >
                                    <option value="visual">{t('querybuilder.visual_builder')}</option>
                                    <option value="sql">{t('querybuilder.direct_editor')}</option>
                                </select>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.querybuilder_sql_height')}</label>
                                <input
                                    type="number"
                                    min={220}
                                    max={700}
                                    value={qbSqlEditorHeight}
                                    onChange={(e) => {
                                        const next = Math.max(220, Math.min(700, Number(e.target.value) || 220));
                                        setQbSqlEditorHeight(next);
                                    }}
                                    className="w-full sm:w-52 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'apps' && appsSubTab === 'datamanagement' && (
                    <div className={`space-y-6 transition-opacity ${isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-5">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('settings.import_title')}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.import_hint')}</p>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.import_default_mode')}</label>
                                <select
                                    value={importDefaultMode}
                                    onChange={(e) => setImportDefaultMode(e.target.value as 'append' | 'overwrite')}
                                    className="w-full sm:w-52 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                >
                                    <option value="append">{t('datasource.excel_import.append')}</option>
                                    <option value="overwrite">{t('datasource.excel_import.overwrite')}</option>
                                </select>
                            </div>

                            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.import_auto_save_mappings')}</span>
                                <input type="checkbox" className="h-4 w-4" checked={importAutoSaveMappings} onChange={() => setImportAutoSaveMappings(!importAutoSaveMappings)} />
                            </label>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-5">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('datasource.backup_restore')}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.backup_hint', 'Defaults for backup and restore behavior.')}</p>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.backup_name_pattern', 'Backup filename pattern')}</label>
                                <input
                                    value={backupNamePattern}
                                    onChange={(e) => setBackupNamePattern(e.target.value)}
                                    placeholder="backup_{date}_{mode}"
                                    className="w-full sm:w-[28rem] p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                />
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {t('settings.backup_name_pattern_hint', 'Tokens: {date}, {time}, {datetime}, {mode}.')}
                                </p>
                            </div>

                            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.backup_use_saved_location', 'Use saved backup folder')}</span>
                                <input type="checkbox" className="h-4 w-4" checked={backupUseSavedLocation} onChange={() => setBackupUseSavedLocation(!backupUseSavedLocation)} />
                            </label>
                            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
                                {t('settings.backup_use_saved_location_hint', 'Default: try the selected backup folder first, then fall back to file picker.')}
                            </p>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.backup_folder', 'Backup folder')}</label>
                                {!backupFolderSupported ? (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {t('settings.backup_folder_not_supported', 'Your browser does not support persistent folder access.')}
                                    </p>
                                ) : (
                                    <>
                                        <p className="text-sm text-slate-700 dark:text-slate-200">
                                            {backupFolderLabel || t('settings.backup_folder_none', 'No folder selected')}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { void handleChooseBackupFolder(); }}
                                                className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                                            >
                                                {t('settings.backup_folder_choose', 'Choose folder')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { void handleClearBackupFolder(); }}
                                                className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                            >
                                                {t('common.clear', 'Clear')}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'controls' && controlsSubTab === 'datatable' && (
                    <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm transition-opacity ${isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                <Table2 className="w-4 h-4 text-blue-500" />
                            </span>
                            {t('settings.datatable_title')}
                        </h3>
                        <div className="space-y-5">
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.datatable_hint')}</p>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.datatable_density')}</label>
                                <select
                                    value={tableDensity}
                                    onChange={(e) => setTableDensity(e.target.value as 'compact' | 'normal')}
                                    className="w-full sm:w-52 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                >
                                    <option value="normal">{t('settings.datatable_density_normal')}</option>
                                    <option value="compact">{t('settings.datatable_density_compact')}</option>
                                </select>
                            </div>

                            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.datatable_wrap_cells')}</span>
                                <input type="checkbox" className="h-4 w-4" checked={tableWrapCells} onChange={() => setTableWrapCells(!tableWrapCells)} />
                            </label>

                            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.datatable_default_filters')}</span>
                                <input type="checkbox" className="h-4 w-4" checked={tableDefaultShowFilters} onChange={() => setTableDefaultShowFilters(!tableDefaultShowFilters)} />
                            </label>
                        </div>
                    </div>
                )}

                {activeTab === 'controls' && controlsSubTab === 'notifications' && (
                    <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm transition-opacity ${isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                <Bell className="w-4 h-4 text-blue-500" />
                            </span>
                            {t('settings.notifications_title')}
                        </h3>
                        <div className="space-y-5">
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.notifications_hint')}</p>
                            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings.notifications_confirm_destructive')}</span>
                                <input type="checkbox" className="h-4 w-4" checked={confirmDestructive} onChange={() => setConfirmDestructive(!confirmDestructive)} />
                            </label>
                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('settings.log_level')}</label>
                                <select
                                    value={appLogLevel}
                                    onChange={(e) => {
                                        const next = e.target.value as AppLogLevel;
                                        setAppLogLevel(next);
                                        window.dispatchEvent(new CustomEvent('app-log-level-changed', { detail: { level: next } }));
                                    }}
                                    className="w-full sm:w-52 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
                                >
                                    <option value="off">{t('settings.log_level_off')}</option>
                                    <option value="error">{t('settings.log_level_error')}</option>
                                    <option value="warn">{t('settings.log_level_warn')}</option>
                                    <option value="info">{t('settings.log_level_info')}</option>
                                    <option value="debug">{t('settings.log_level_debug')}</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'about' && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                <Info className="w-4 h-4 text-blue-500" />
                            </span>
                            {t('about.title', 'About LiteBI Studio')}
                        </h3>
                        <div className="space-y-4">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t('about.settings_hint', 'Learn more about the project, the version and the vision behind LiteBI Studio.')}
                            </p>

                            <Link
                                to="/about"
                                className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                        <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-slate-900 dark:text-white">{t('about.view_info', 'Project Information')}</div>
                                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                            <span>Version {version}</span>
                                            <span className="text-slate-300 dark:text-slate-600">|</span>
                                            <span>Build {buildNumber}</span>
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                            </Link>
                        </div>
                    </div>
                )}
            </div>
            <SystemHealthModal
                isOpen={isHealthModalOpen}
                onClose={() => setIsHealthModalOpen(false)}
            />
        </PageLayout>
    );
};

