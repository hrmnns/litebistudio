import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { SettingsRepository } from '../../lib/repositories/SettingsRepository';
import { useAsync } from '../../hooks/useAsync';
import {
    Plus, FileText, Trash2, Download,
    Layout, Database, ChevronRight, Settings,
    BookOpen, User, MoveUp, MoveDown, Check, X, Edit2, Maximize2, Minimize2, ArrowRightLeft
} from 'lucide-react';
import { useReportExport } from '../../hooks/useReportExport';
import { WidgetRenderer } from '../components/WidgetRenderer';
import { Modal } from '../components/Modal';
import { type ReportPack, type ReportPackItem, type DbRow, type WidgetConfig } from '../../types';
import { useDashboard } from '../../lib/context/DashboardContext';

interface DashboardRow extends DbRow {
    id: string;
    name: string;
    layout?: unknown;
}

interface WidgetRow extends DbRow {
    id: string;
    name: string;
    sql_query: string;
    visualization_config?: unknown;
}

interface DashboardLayoutWidgetRef {
    id: string;
}

const ReportPackView: React.FC = () => {
    const { t } = useTranslation();
    const categorySettingsKey = 'report_pack_categories';
    const expandedStateSettingsKey = 'report_pack_expanded_state';
    const defaultCategory = t('reports.default_category', 'General');
    const allCategoriesTab = '__all__';
    const [packs, setPacks] = useState<ReportPack[]>([]);
    const [customCategories, setCustomCategories] = useState<string[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>(allCategoriesTab);
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
    const [activePackId, setActivePackId] = useState<string | null>(null);
    const [expandedPacks, setExpandedPacks] = useState<Record<string, boolean>>({});
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
    const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
    const [moveMenuPackId, setMoveMenuPackId] = useState<string | null>(null);
    const logoFileInputRef = useRef<HTMLInputElement | null>(null);
    const [settingsSections, setSettingsSections] = useState({
        general: true,
        cover: true,
        headerFooter: true,
        pageOptions: true,
        preview: true
    });
    const { isReadOnly } = useDashboard();

    // Export State
    const { isExporting, exportProgress, exportPackageToPdf } = useReportExport();

    // Data
    const { data: allDashboards } = useAsync<DashboardRow[]>(() => SystemRepository.getDashboards() as Promise<DashboardRow[]>, []);
    const { data: allWidgets } = useAsync<WidgetRow[]>(() => SystemRepository.getUserWidgets() as Promise<WidgetRow[]>, []);

    const loadPacks = useCallback(async () => {
        const rawData = await SystemRepository.getReportPacks() as unknown as ReportPack[];
        const data = rawData.map(pack => ({
            ...pack,
            category: typeof pack.category === 'string' && pack.category.trim().length > 0 ? pack.category : defaultCategory
        }));
        const expandedRaw = await SettingsRepository.get(expandedStateSettingsKey);
        const expandedFromSettings: Record<string, boolean> = {};
        if (expandedRaw) {
            try {
                const parsed = JSON.parse(expandedRaw) as Record<string, unknown>;
                Object.entries(parsed).forEach(([key, value]) => {
                    if (typeof value === 'boolean') expandedFromSettings[key] = value;
                });
            } catch {
                // Ignore invalid persisted UI state
            }
        }
        setPacks(data);
        if (data.length > 0 && !activePackId) setActivePackId(data[0].id);
        setExpandedPacks(() => {
            const next: Record<string, boolean> = {};
            data.forEach(pack => {
                next[pack.id] = expandedFromSettings[pack.id] ?? true;
            });
            return next;
        });
    }, [activePackId, defaultCategory, expandedStateSettingsKey]);

    const loadCustomCategories = useCallback(async () => {
        const raw = await SettingsRepository.get(categorySettingsKey);
        if (!raw) {
            setCustomCategories([]);
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                setCustomCategories([]);
                return;
            }
            const normalized = Array.from(new Set(parsed
                .filter((v): v is string => typeof v === 'string')
                .map(v => v.trim())
                .filter(v => v.length > 0)));
            setCustomCategories(normalized);
        } catch {
            setCustomCategories([]);
        }
    }, [categorySettingsKey]);

    useEffect(() => {
        const initialLoadHandle = window.setTimeout(() => {
            void loadPacks();
            void loadCustomCategories();
        }, 0);
        return () => window.clearTimeout(initialLoadHandle);
    }, [loadCustomCategories, loadPacks]);

    const parseWidgetConfig = (rawConfig: unknown): WidgetConfig => {
        if (typeof rawConfig === 'string') {
            try {
                return JSON.parse(rawConfig) as WidgetConfig;
            } catch {
                return { type: 'table' };
            }
        }
        if (rawConfig && typeof rawConfig === 'object') {
            return rawConfig as WidgetConfig;
        }
        return { type: 'table' };
    };

    const activePack = packs.find(p => p.id === activePackId);
    const coverLogoUrl = (activePack?.config.coverLogoUrl || '').trim();
    const categoryNames = useMemo(() => {
        const fromPacks = packs.map(pack => pack.category || defaultCategory);
        fromPacks.push(defaultCategory);
        return Array.from(new Set([...fromPacks, ...customCategories])).sort((a, b) => a.localeCompare(b));
    }, [customCategories, defaultCategory, packs]);
    const categoryDraft = newCategoryName.trim();
    const hasCategoryDuplicate = categoryNames.some(category => category.toLowerCase() === categoryDraft.toLowerCase());
    const canCreateCategory = categoryDraft.length > 0 && !hasCategoryDuplicate;
    const currentCategory = activeCategory === allCategoriesTab || categoryNames.includes(activeCategory)
        ? activeCategory
        : allCategoriesTab;
    const visiblePacks = currentCategory === allCategoriesTab
        ? packs
        : packs.filter(pack => (pack.category || defaultCategory) === currentCategory);
    const getPackById = (id: string) => packs.find(p => p.id === id);
    const toggleSettingsSection = (key: keyof typeof settingsSections) => {
        setSettingsSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const fileToDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });

    const handleLogoFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !activePack) return;
        try {
            const dataUrl = await fileToDataUrl(file);
            setFailedLogoUrl(null);
            await handleSave({ ...activePack, config: { ...activePack.config, coverLogoUrl: dataUrl } });
        } catch {
            window.alert(t('reports.logo_upload_failed', 'Logo upload failed.'));
        } finally {
            event.target.value = '';
        }
    };

    const handleSave = async (pack: ReportPack) => {
        if (isReadOnly) return;
        const normalizedCategory = typeof pack.category === 'string' && pack.category.trim().length > 0
            ? pack.category.trim()
            : defaultCategory;
        await SystemRepository.saveReportPack({ ...pack, category: normalizedCategory });
        await loadPacks();
    };

    const saveCustomCategories = async (categories: string[]) => {
        const normalized = Array.from(new Set(categories.map(c => c.trim()).filter(c => c.length > 0)));
        setCustomCategories(normalized);
        await SettingsRepository.set(categorySettingsKey, JSON.stringify(normalized));
    };

    const persistExpandedState = async (nextState: Record<string, boolean>) => {
        await SettingsRepository.set(expandedStateSettingsKey, JSON.stringify(nextState));
    };

    const createPack = () => {
        const initialCategory = currentCategory === allCategoriesTab ? defaultCategory : currentCategory;
        const newPack: ReportPack = {
            id: crypto.randomUUID(),
            name: t('reports.new_pack_name'),
            category: initialCategory,
            description: '',
            config: {
                coverTitle: t('reports.new_pack_name'),
                coverSubtitle: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
                author: 'LiteBI Studio',
                coverLogoUrl: '',
                themeColor: '#1e293b',
                showTOC: true,
                exportOptions: {
                    showHeader: true,
                    showFooter: true,
                    headerText: '',
                    footerText: '',
                    footerMode: 'content_only'
                },
                items: []
            }
        };
        handleSave(newPack);
        setActivePackId(newPack.id);
        setActiveCategory(initialCategory);
    };

    const createCategory = async () => {
        if (isReadOnly || !canCreateCategory) return;
        if (!categoryNames.includes(categoryDraft)) {
            await saveCustomCategories([...customCategories, categoryDraft]);
        }
        setActiveCategory(categoryDraft);
        setIsCreatingCategory(false);
        setNewCategoryName('');
    };

    const renameCategory = async (currentName: string) => {
        if (isReadOnly) return;
        if (currentName === defaultCategory) return;
        const raw = window.prompt(t('reports.rename_category_prompt', 'New category name:'), currentName);
        const nextName = raw?.trim();
        if (!nextName || nextName === currentName) return;

        const duplicate = categoryNames.some(category => category.toLowerCase() === nextName.toLowerCase() && category !== currentName);
        if (duplicate) {
            window.alert(t('reports.category_exists', 'A category with this name already exists.'));
            return;
        }

        const affectedPacks = packs.filter(pack => (pack.category || defaultCategory) === currentName);
        await Promise.all(
            affectedPacks.map(pack => SystemRepository.saveReportPack({ ...pack, category: nextName }))
        );
        await saveCustomCategories(customCategories.map(category => category === currentName ? nextName : category));
        if (activeCategory === currentName) {
            setActiveCategory(nextName);
        }
        await loadPacks();
    };

    const deleteCategory = async (categoryName: string) => {
        if (isReadOnly) return;
        if (categoryName === defaultCategory) return;
        const affectedPacks = packs.filter(pack => (pack.category || defaultCategory) === categoryName);
        const packCount = affectedPacks.length;

        const confirmed = packCount === 0
            ? window.confirm(t('reports.delete_category_confirm', 'Delete this category?'))
            : window.confirm(t('reports.delete_category_with_packs_confirm', { count: packCount, category: categoryName, defaultValue: `Delete category "${categoryName}" and all ${packCount} report packages in it?` }));
        if (!confirmed) return;

        if (packCount > 0) {
            await Promise.all(affectedPacks.map(pack => SystemRepository.deleteReportPack(pack.id)));
            if (activePackId && affectedPacks.some(pack => pack.id === activePackId)) {
                setActivePackId(null);
            }
        }
        await saveCustomCategories(customCategories.filter(category => category !== categoryName));
        if (activeCategory === categoryName) {
            setActiveCategory(allCategoriesTab);
        }
        await loadPacks();
    };

    const deletePack = async (id: string) => {
        if (isReadOnly) return;
        if (confirm(t('common.confirm_delete'))) {
            await SystemRepository.deleteReportPack(id);
            await loadPacks();
            if (activePackId === id) setActivePackId(null);
        }
    };

    const togglePackExpanded = (packId: string) => {
        setExpandedPacks(prev => {
            const next = { ...prev, [packId]: !prev[packId] };
            void persistExpandedState(next);
            return next;
        });
    };

    const setAllPacksExpanded = (expanded: boolean) => {
        setExpandedPacks(prev => {
            const next = { ...prev };
            packs.forEach(pack => {
                next[pack.id] = expanded;
            });
            void persistExpandedState(next);
            return next;
        });
    };

    const openPickerForPack = (packId: string) => {
        setActivePackId(packId);
        setIsAddPickerOpen(true);
    };

    const openSettingsForPack = (packId: string) => {
        setActivePackId(packId);
        setIsEditModalOpen(true);
    };

    const moveItem = (packId: string, idx: number, direction: 'up' | 'down') => {
        const pack = getPackById(packId);
        if (!pack) return;
        const items = [...pack.config.items];
        const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= items.length) return;

        [items[idx], items[nextIdx]] = [items[nextIdx], items[idx]];
        handleSave({ ...pack, config: { ...pack.config, items } });
    };

    const removeItem = (packId: string, idx: number) => {
        const pack = getPackById(packId);
        if (!pack) return;
        const items = pack.config.items.filter((_, i) => i !== idx);
        handleSave({ ...pack, config: { ...pack.config, items } });
    };

    const addItem = (item: ReportPackItem) => {
        if (!activePack) return;
        handleSave({
            ...activePack,
            config: { ...activePack.config, items: [...activePack.config.items, item] }
        });
        setIsAddPickerOpen(false);
    };

    const movePackToCategory = async (pack: ReportPack, targetCategory: string) => {
        if (isReadOnly) return;
        await handleSave({ ...pack, category: targetCategory });
        setMoveMenuPackId(null);
    };

    const handleRunExport = async (pack: ReportPack) => {
        setActivePackId(pack.id);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        const exportItems = pack.config.items.map(item => {
            if (item.type === 'dashboard') {
                const dash = allDashboards?.find(d => d.id === item.id);
                return {
                    elementId: `export-dash-${item.id}`,
                    title: item.titleOverride || dash?.name || 'Dashboard',
                    orientation: item.orientation || 'landscape' as const
                };
            }
            const widget = allWidgets?.find(w => w.id === item.id);
            return {
                elementId: `export-widget-${item.id}`,
                title: item.titleOverride || widget?.name || 'Widget',
                orientation: item.orientation || 'landscape' as const
            };
        });

        await exportPackageToPdf(
            pack.name,
            exportItems,
            {
                title: pack.config.coverTitle,
                subtitle: pack.config.coverSubtitle,
                author: pack.config.author,
                logoUrl: pack.config.coverLogoUrl?.trim(),
                themeColor: pack.config.themeColor
            },
            pack.config.exportOptions
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
            <div className={`h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar p-1 ${isReadOnly ? 'pointer-events-none opacity-80' : ''}`}>
                <div className="space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-px">
                            <button
                                onClick={() => setActiveCategory(allCategoriesTab)}
                                className={`px-4 py-2.5 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${currentCategory === allCategoriesTab
                                    ? 'text-blue-600 border-blue-600'
                                    : 'text-slate-400 border-transparent hover:text-slate-600'
                                    }`}
                            >
                                {t('common.all', 'All')}
                            </button>
                            {categoryNames.map(category => (
                                <button
                                    key={category}
                                    onClick={() => setActiveCategory(category)}
                                    className={`px-4 py-2.5 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${currentCategory === category
                                        ? 'text-blue-600 border-blue-600'
                                        : 'text-slate-400 border-transparent hover:text-slate-600'
                                        }`}
                                >
                                    {category}
                                </button>
                            ))}
                            {!isReadOnly && (
                                <button
                                    onClick={() => { setIsCreatingCategory(true); setNewCategoryName(''); }}
                                    className="px-4 py-2.5 text-slate-400 hover:text-blue-600 transition-all border-b-2 border-transparent"
                                    title={t('reports.new_category', 'New category')}
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setAllPacksExpanded(true)}
                                className="p-2 text-slate-400 hover:text-slate-600"
                                title={t('reports.expand_all_packs', 'Expand all reports')}
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setAllPacksExpanded(false)}
                                className="p-2 text-slate-400 hover:text-slate-600"
                                title={t('reports.collapse_all_packs', 'Collapse all reports')}
                            >
                                <Minimize2 className="w-4 h-4" />
                            </button>
                            {!isReadOnly && (
                                <button
                                    onClick={() => setIsCategoryManagerOpen(true)}
                                    className="p-2 text-slate-400 hover:text-slate-600"
                                    title={t('reports.manage_categories', 'Manage categories')}
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {isCreatingCategory && (
                        <div className="mb-1 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-3">
                            <Layout className="w-5 h-5 text-slate-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder={t('reports.new_category_placeholder', 'Category name (e.g. Management)')}
                                className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && void createCategory()}
                            />
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => void createCategory()}
                                    disabled={!canCreateCategory}
                                    className={`p-1.5 rounded transition-colors ${canCreateCategory
                                        ? 'text-green-600 hover:bg-green-50'
                                        : 'text-slate-300 cursor-not-allowed'
                                        }`}
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => { setIsCreatingCategory(false); setNewCategoryName(''); }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                            </div>
                        </div>
                    )}

                    {visiblePacks.map(pack => {
                        const isExpanded = expandedPacks[pack.id] ?? true;
                        const isActive = activePackId === pack.id;
                        const packCategory = pack.category || defaultCategory;
                        const moveTargets = categoryNames.filter(category => category !== packCategory);

                        return (
                            <section
                                key={pack.id}
                                className={`bg-white dark:bg-slate-900 border rounded-2xl shadow-sm transition-all ${isActive
                                    ? 'border-blue-200 dark:border-blue-800'
                                    : 'border-slate-200 dark:border-slate-800'
                                    }`}
                            >
                                <div className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <button
                                            onClick={() => togglePackExpanded(pack.id)}
                                            className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                                            title={isExpanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
                                        >
                                            <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                        </button>
                                        <button
                                            onClick={() => setActivePackId(pack.id)}
                                            className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600 shrink-0"
                                            title={t('reports.pack_settings', 'Package Settings')}
                                        >
                                            <BookOpen className="w-5 h-5" />
                                        </button>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-slate-800 dark:text-white leading-tight truncate">{pack.name}</h3>
                                            <p className="text-xs text-slate-400">
                                                {(pack.category || defaultCategory)} • {pack.config.items.length} {t('reports.pages', 'Pages')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!isReadOnly && (
                                            <div className="relative">
                                                <button
                                                    onClick={() => setMoveMenuPackId(prev => prev === pack.id ? null : pack.id)}
                                                    disabled={moveTargets.length === 0}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                                    title={moveTargets.length === 0
                                                        ? t('reports.move_category_unavailable', 'No other category available')
                                                        : t('reports.move_category', 'Move to category')}
                                                >
                                                    <ArrowRightLeft className="w-4 h-4" />
                                                </button>
                                                {moveMenuPackId === pack.id && moveTargets.length > 0 && (
                                                    <div className="absolute right-0 top-10 z-20 min-w-[170px] rounded-xl border border-slate-200 bg-white shadow-lg p-1">
                                                        {moveTargets.map(target => (
                                                            <button
                                                                key={`${pack.id}-move-${target}`}
                                                                onClick={() => void movePackToCategory(pack, target)}
                                                                className="w-full text-left px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                                                            >
                                                                {target}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {!isReadOnly && (
                                            <button
                                                onClick={() => openPickerForPack(pack.id)}
                                                className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-300 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors font-bold text-sm"
                                                title={t('reports.add_page', 'Add Page')}
                                            >
                                                <Plus className="w-4 h-4" />
                                                {t('reports.add_page', 'Add Page')}
                                            </button>
                                        )}
                                        {!isReadOnly && (
                                            <button
                                                onClick={() => openSettingsForPack(pack.id)}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title={t('common.settings')}
                                            >
                                                <Settings className="w-5 h-5" />
                                            </button>
                                        )}
                                        {!isReadOnly && (
                                            <button
                                                onClick={() => deletePack(pack.id)}
                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title={t('common.delete')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleRunExport(pack)}
                                            disabled={isExporting || pack.config.items.length === 0}
                                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg hover:opacity-90 transition-all font-bold text-sm shadow-lg shadow-slate-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Download className="w-4 h-4" />
                                            {isExporting && isActive ? `${exportProgress}%` : t('reports.export_batch')}
                                        </button>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-4 pb-4">
                                        {pack.config.items.length > 0 ? (
                                            <div className="space-y-3">
                                                    {pack.config.items.map((item, idx) => {
                                                        const meta = item.type === 'dashboard'
                                                            ? allDashboards?.find(d => d.id === item.id)
                                                            : allWidgets?.find(w => w.id === item.id);
                                                        if (!meta) return null;

                                                        return (
                                                            <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl group hover:shadow-sm transition-all">
                                                                <div className="flex flex-col gap-1 items-center">
                                                                    <button onClick={() => moveItem(pack.id, idx, 'up')} className="text-slate-300 hover:text-blue-500 disabled:opacity-0" disabled={idx === 0}><MoveUp className="w-3.5 h-3.5" /></button>
                                                                    <div className="w-6 h-6 bg-white dark:bg-slate-900 rounded flex items-center justify-center text-[10px] font-black text-slate-400">{idx + 1}</div>
                                                                    <button onClick={() => moveItem(pack.id, idx, 'down')} className="text-slate-300 hover:text-blue-500 disabled:opacity-0" disabled={idx === pack.config.items.length - 1}><MoveDown className="w-3.5 h-3.5" /></button>
                                                                </div>
                                                                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                                                                    {item.type === 'dashboard' ? <Layout className="w-5 h-5 text-slate-400" /> : <Database className="w-5 h-5 text-slate-400" />}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{meta.name}</div>
                                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.type}</div>
                                                                </div>
                                                                <button
                                                                    onClick={() => removeItem(pack.id, idx)}
                                                                    className="p-2 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 text-sm">
                                                {t('reports.add_page', 'Add Page')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}

                    {packs.length === 0 && (
                        <div className="text-center py-16 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">{t('reports.no_packages')}</p>
                        </div>
                    )}
                    {packs.length > 0 && visiblePacks.length === 0 && (
                        <div className="text-center py-16 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">{t('reports.no_packages_in_category', 'No packages in this category yet.')}</p>
                        </div>
                    )}
                </div>

                {/* HIDDEN CAPTURE GHOSTS (Required for html2canvas to find them) */}
                <div className="fixed -left-[10000px] top-0 opacity-0 pointer-events-none w-[1400px]">
                    {activePack?.config.items.map((item, idx) => {
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
                                        {Array.isArray(dash.layout) && dash.layout.map((w: DashboardLayoutWidgetRef) => {
                                            const wMeta = allWidgets?.find(rw => rw.id === w.id);
                                            if (!wMeta) return null;
                                            const vConfig = parseWidgetConfig(wMeta.visualization_config);

                                            return (
                                                <div key={w.id} className="h-[400px]">
                                                    <WidgetRenderer
                                                        title={wMeta.name}
                                                        sql={wMeta.sql_query}
                                                        config={vConfig}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }
                        const widget = allWidgets?.find(w => w.id === item.id);
                        if (!widget) return null;
                        const vConfig = parseWidgetConfig(widget.visualization_config);

                        return (
                            <div key={`ghost-widget-${idx}`} id={`export-widget-${item.id}`} className="bg-white p-10 min-h-[1000px] flex flex-col items-center justify-center">
                                <div className="w-full max-w-4xl h-[600px]">
                                    <WidgetRenderer
                                        title={widget.name}
                                        sql={widget.sql_query}
                                        config={vConfig}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Config Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={t('reports.pack_settings', 'Package Settings')}>
                {activePack && (
                    <div className="space-y-6">
                        <section className="space-y-3">
                            <button
                                type="button"
                                onClick={() => toggleSettingsSection('general')}
                                className="w-full flex items-center justify-between text-left"
                            >
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider cursor-pointer">{t('reports.general')}</label>
                                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${settingsSections.general ? 'rotate-90' : ''}`} />
                            </button>
                            {settingsSections.general && (
                                <div className="space-y-3">
                                    <input
                                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                        value={activePack.name}
                                        onChange={e => handleSave({ ...activePack, name: e.target.value })}
                                        placeholder={t('reports.pack_name_placeholder')}
                                    />
                                    <input
                                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                                        value={activePack.category || defaultCategory}
                                        onChange={e => handleSave({ ...activePack, category: e.target.value })}
                                        placeholder={t('reports.category', 'Category')}
                                    />
                                </div>
                            )}
                        </section>

                        <section className="space-y-3">
                            <button
                                type="button"
                                onClick={() => toggleSettingsSection('cover')}
                                className="w-full flex items-center justify-between text-left"
                            >
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider cursor-pointer">{t('reports.cover_page')}</label>
                                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${settingsSections.cover ? 'rotate-90' : ''}`} />
                            </button>
                            {settingsSections.cover && (
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
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">{t('reports.logo_url', 'Logo URL')}</div>
                                        <input
                                            className="w-full bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg text-sm border border-slate-100 dark:border-slate-700 outline-none"
                                            value={activePack.config.coverLogoUrl || ''}
                                            onChange={e => {
                                                setFailedLogoUrl(null);
                                                handleSave({ ...activePack, config: { ...activePack.config, coverLogoUrl: e.target.value } });
                                            }}
                                            placeholder="https://..."
                                        />
                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                ref={logoFileInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={e => void handleLogoFileSelected(e)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => logoFileInputRef.current?.click()}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                            >
                                                {t('reports.upload_logo', 'Upload logo')}
                                            </button>
                                            {!!activePack.config.coverLogoUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFailedLogoUrl(null);
                                                        handleSave({ ...activePack, config: { ...activePack.config, coverLogoUrl: '' } });
                                                    }}
                                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                                                >
                                                    {t('common.remove', 'Remove')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">{t('reports.theme_color', 'Theme Color')}</div>
                                        <input
                                            type="color"
                                            className="w-full h-9 bg-white dark:bg-slate-900 px-1 py-1 rounded-lg border border-slate-100 dark:border-slate-700 outline-none"
                                            value={activePack.config.themeColor || '#1e293b'}
                                            onChange={e => handleSave({ ...activePack, config: { ...activePack.config, themeColor: e.target.value } })}
                                        />
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="space-y-3">
                            <button
                                type="button"
                                onClick={() => toggleSettingsSection('headerFooter')}
                                className="w-full flex items-center justify-between text-left"
                            >
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider cursor-pointer">{t('reports.export_options', 'Header / Footer')}</label>
                                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${settingsSections.headerFooter ? 'rotate-90' : ''}`} />
                            </button>
                            {settingsSections.headerFooter && (
                                <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                            <input
                                                type="checkbox"
                                                checked={activePack.config.exportOptions?.showHeader ?? true}
                                                onChange={e => handleSave({
                                                    ...activePack,
                                                    config: {
                                                        ...activePack.config,
                                                        exportOptions: {
                                                            ...(activePack.config.exportOptions || {}),
                                                            showHeader: e.target.checked
                                                        }
                                                    }
                                                })}
                                            />
                                            {t('reports.show_header', 'Show header')}
                                        </label>
                                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                            <input
                                                type="checkbox"
                                                checked={activePack.config.exportOptions?.showFooter ?? true}
                                                onChange={e => handleSave({
                                                    ...activePack,
                                                    config: {
                                                        ...activePack.config,
                                                        exportOptions: {
                                                            ...(activePack.config.exportOptions || {}),
                                                            showFooter: e.target.checked
                                                        }
                                                    }
                                                })}
                                            />
                                            {t('reports.show_footer', 'Show footer')}
                                        </label>
                                    </div>
                                    <input
                                        className="w-full bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg text-sm border border-slate-100 dark:border-slate-700 outline-none"
                                        value={activePack.config.exportOptions?.headerText || ''}
                                        onChange={e => handleSave({
                                            ...activePack,
                                            config: {
                                                ...activePack.config,
                                                exportOptions: {
                                                    ...(activePack.config.exportOptions || {}),
                                                    headerText: e.target.value
                                                }
                                            }
                                        })}
                                        placeholder={t('reports.header_text', 'Header text (optional)')}
                                    />
                                    <input
                                        className="w-full bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg text-sm border border-slate-100 dark:border-slate-700 outline-none"
                                        value={activePack.config.exportOptions?.footerText || ''}
                                        onChange={e => handleSave({
                                            ...activePack,
                                            config: {
                                                ...activePack.config,
                                                exportOptions: {
                                                    ...(activePack.config.exportOptions || {}),
                                                    footerText: e.target.value
                                                }
                                            }
                                        })}
                                        placeholder={t('reports.footer_text', 'Footer text (optional)')}
                                    />
                                </div>
                            )}
                        </section>

                        <section className="space-y-3">
                            <button
                                type="button"
                                onClick={() => toggleSettingsSection('pageOptions')}
                                className="w-full flex items-center justify-between text-left"
                            >
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider cursor-pointer">{t('reports.page_options', 'Per-Page Options')}</label>
                                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${settingsSections.pageOptions ? 'rotate-90' : ''}`} />
                            </button>
                            {settingsSections.pageOptions && (
                                <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl max-h-[260px] overflow-y-auto custom-scrollbar">
                                    {activePack.config.items.length === 0 && (
                                        <p className="text-xs text-slate-400">{t('reports.no_pages', 'No pages in this package yet.')}</p>
                                    )}
                                    {activePack.config.items.map((item, idx) => {
                                        const meta = item.type === 'dashboard'
                                            ? allDashboards?.find(d => d.id === item.id)
                                            : allWidgets?.find(w => w.id === item.id);
                                        if (!meta) return null;

                                        return (
                                            <div key={`${item.id}-${idx}`} className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl space-y-2">
                                                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                                    {idx + 1}. {meta.name}
                                                </div>
                                                <input
                                                    className="w-full bg-slate-50 dark:bg-slate-800 px-2 py-1.5 rounded text-xs border border-slate-200 dark:border-slate-700 outline-none"
                                                    value={item.titleOverride || ''}
                                                    onChange={e => {
                                                        const nextItems = [...activePack.config.items];
                                                        nextItems[idx] = { ...item, titleOverride: e.target.value };
                                                        handleSave({ ...activePack, config: { ...activePack.config, items: nextItems } });
                                                    }}
                                                    placeholder={t('reports.page_title_override', 'Page title override (optional)')}
                                                />
                                                <select
                                                    className="w-full bg-slate-50 dark:bg-slate-800 px-2 py-1.5 rounded text-xs border border-slate-200 dark:border-slate-700 outline-none"
                                                    value={item.orientation || 'landscape'}
                                                    onChange={e => {
                                                        const nextItems = [...activePack.config.items];
                                                        nextItems[idx] = { ...item, orientation: e.target.value as 'portrait' | 'landscape' };
                                                        handleSave({ ...activePack, config: { ...activePack.config, items: nextItems } });
                                                    }}
                                                >
                                                    <option value="landscape">{t('reports.landscape', 'Landscape')}</option>
                                                    <option value="portrait">{t('reports.portrait', 'Portrait')}</option>
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        <section className="space-y-3">
                            <button
                                type="button"
                                onClick={() => toggleSettingsSection('preview')}
                                className="w-full flex items-center justify-between text-left"
                            >
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider cursor-pointer">{t('reports.preview', 'Live Preview')}</label>
                                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${settingsSections.preview ? 'rotate-90' : ''}`} />
                            </button>
                            {settingsSections.preview && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                                        <div
                                            className="h-36 px-4 py-3 flex flex-col justify-between"
                                            style={{ backgroundColor: activePack.config.themeColor || '#1e293b' }}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="text-white text-sm font-black truncate">
                                                    {activePack.config.coverTitle || t('reports.title_label')}
                                                </div>
                                                {coverLogoUrl && failedLogoUrl !== coverLogoUrl ? (
                                                    <img
                                                        src={coverLogoUrl}
                                                        alt="Logo preview"
                                                        className="w-10 h-10 object-contain rounded bg-white/80 p-1"
                                                        referrerPolicy="no-referrer"
                                                        onError={() => setFailedLogoUrl(coverLogoUrl)}
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded bg-white/20 border border-white/30" />
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-200">
                                                {activePack.config.coverSubtitle || t('reports.subtitle_label')}
                                            </div>
                                        </div>
                                        <div className="px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                                            {activePack.config.author || t('reports.author')}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                                        <div className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                            {t('reports.content_page_preview', 'Content Page Preview')}
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <div className={`text-[11px] text-slate-500 ${activePack.config.exportOptions?.showHeader === false ? 'opacity-30' : ''}`}>
                                                {(activePack.config.exportOptions?.headerText || activePack.name || t('reports.header_text', 'Header text'))}
                                            </div>
                                            <div className="h-16 rounded border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-xs text-slate-400">
                                                {t('reports.page_content', 'Page content')}
                                            </div>
                                            <div className={`flex items-center justify-between text-[11px] text-slate-500 ${activePack.config.exportOptions?.showFooter === false ? 'opacity-30' : ''}`}>
                                                <span>{activePack.config.exportOptions?.footerText || t('reports.footer_text', 'Footer text')}</span>
                                                <span>1 / {Math.max(1, activePack.config.items.length)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>

                        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="px-6 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl font-bold text-sm"
                            >
                                {t('common.done', 'Done')}
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

            {/* Manage Categories Modal */}
            <Modal isOpen={isCategoryManagerOpen} onClose={() => setIsCategoryManagerOpen(false)} title={t('reports.manage_categories', 'Manage categories')}>
                <div className="space-y-3">
                    {categoryNames.length === 0 && (
                        <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 text-sm">
                            {t('reports.no_categories', 'No categories yet.')}
                        </div>
                    )}
                    {categoryNames.map(category => {
                        const isDefaultCategory = category === defaultCategory;
                        const packCount = packs.filter(pack => (pack.category || defaultCategory) === category).length;
                        return (
                            <div key={category} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg group">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Layout className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="font-bold text-slate-700 truncate">{category}</span>
                                    {isDefaultCategory && (
                                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                                            {t('common.default', 'Default')}
                                        </span>
                                    )}
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                                        {packCount} {t('reports.packages', 'packages')}
                                    </span>
                                </div>
                                {!isReadOnly && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => void renameCategory(category)}
                                            disabled={isDefaultCategory}
                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                            title={t('common.rename', 'Rename')}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => void deleteCategory(category)}
                                            disabled={isDefaultCategory}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                            title={isDefaultCategory
                                                ? t('reports.default_category_protected', 'Default category cannot be deleted')
                                                : packCount > 0
                                                    ? t('reports.delete_with_content', 'Delete category and its report packages')
                                                    : t('reports.delete_empty_category', 'Delete empty category')}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Modal>
        </PageLayout>
    );
};

export { ReportPackView };
export default ReportPackView;
