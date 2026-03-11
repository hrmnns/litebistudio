import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Activity, ShieldAlert, User, Lock, PanelRightOpen, RefreshCw, Maximize2, Download, FileText, FileSpreadsheet, CircleHelp } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useDashboard } from '../../../lib/context/DashboardContext';
import { useAsync } from '../../../hooks/useAsync';
import { SystemRepository } from '../../../lib/repositories/SystemRepository';
import { RightOverlayPanel, type RightOverlayPanelWidth } from './RightOverlayPanel';
import { Button } from './Button';

/* ─── Alert Types ─── */
export type AlertLevel = 'error' | 'warning' | 'info' | 'success';

export interface PageAlert {
    level: AlertLevel;
    message: string;
    action?: { label: string; onClick: () => void };
}

/* ─── Sub-component Props ─── */
interface PageHeaderProps {
    title: React.ReactNode;
    subtitle?: string;
    onBack?: () => void;
    actions?: React.ReactNode;
    presentation?: {
        onClick?: () => void;
        title?: string;
        disabled?: boolean;
        active?: boolean;
    };
    export?: {
        onPdfExport?: () => void;
        onExcelExport?: () => void;
        title?: string;
        disabled?: boolean;
        loading?: boolean;
        pdfTitle?: string;
        excelTitle?: string;
        pdfDisabled?: boolean;
        excelDisabled?: boolean;
    };
    refresh?: {
        onClick: () => void;
        title?: string;
        disabled?: boolean;
        loading?: boolean;
    };
    help?: {
        href?: string;
        title?: string;
        disabled?: boolean;
    };
}

export interface PageBreadcrumb {
    label: string;
    href?: string;
    onClick?: () => void;
}

interface PageLayoutProps {
    /** Header configuration */
    header: PageHeaderProps;
    /** Contextual alerts / banners */
    alerts?: PageAlert[];
    /** Main scrollable content */
    children: React.ReactNode;
    /** Optional right sidebar (e.g. filters) */
    sidebar?: React.ReactNode;
    /** Footer content or text */
    footer?: React.ReactNode;
    /** Breadcrumbs to show in the footer */
    breadcrumbs?: PageBreadcrumb[];
    /** Extra CSS classes on the root element */
    className?: string;
    /** If true, children fill remaining height (no outer scroll). Useful for views with internal scroll like data tables. */
    fillHeight?: boolean;
    /** Optional right-side modal panel configurable per view. */
    rightPanel?: {
        title: React.ReactNode;
        content: React.ReactNode;
        width?: RightOverlayPanelWidth;
        noScroll?: boolean;
        enabled?: boolean;
        triggerLabel?: string;
        triggerTitle?: string;
        triggerClassName?: string;
        isOpen?: boolean;
        onOpenChange?: (open: boolean) => void;
        defaultOpen?: boolean;
    };
}

/* ─── Alert Color Map ─── */
const alertStyles: Record<AlertLevel, { bg: string; border: string; text: string; icon: string }> = {
    error: {
        bg: 'bg-red-50 dark:bg-red-900/10',
        border: 'border-red-200 dark:border-red-800/40',
        text: 'text-red-800 dark:text-red-300',
        icon: '❌',
    },
    warning: {
        bg: 'bg-amber-50 dark:bg-amber-900/10',
        border: 'border-amber-200 dark:border-amber-800/40',
        text: 'text-amber-800 dark:text-amber-300',
        icon: '⚠️',
    },
    info: {
        bg: 'bg-blue-50 dark:bg-blue-900/10',
        border: 'border-blue-200 dark:border-blue-800/40',
        text: 'text-blue-800 dark:text-blue-300',
        icon: 'ℹ️',
    },
    success: {
        bg: 'bg-emerald-50 dark:bg-emerald-900/10',
        border: 'border-emerald-200 dark:border-emerald-800/40',
        text: 'text-emerald-800 dark:text-emerald-300',
        icon: '✅',
    },
};

/* ─── PageLayout ─── */
export const PageLayout: React.FC<PageLayoutProps> = ({
    header,
    alerts,
    children,
    sidebar,
    footer,
    breadcrumbs,
    className,
    fillHeight,
    rightPanel,
}) => {
    const { t } = useTranslation();
    const { isAdminMode, isReadOnly } = useDashboard();
    const [activeQueries, setActiveQueries] = useState(0);
    const [lastQueryMs, setLastQueryMs] = useState<number | null>(null);
    const [internalRightPanelOpen, setInternalRightPanelOpen] = useState(Boolean(rightPanel?.defaultOpen));
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const exportMenuRef = React.useRef<HTMLDivElement | null>(null);
    const { data: storageStatus } = useAsync(
        () => SystemRepository.getStorageStatus(),
        [],
        { cacheKey: 'db-storage-status', ttl: 15000 }
    );

    useEffect(() => {
        const onStart = () => setActiveQueries(q => q + 1);
        const onEnd = (e: Event) => {
            setActiveQueries(q => Math.max(0, q - 1));
            const detail = (e as CustomEvent<{ duration?: number }>).detail;
            if (detail?.duration !== undefined) {
                setLastQueryMs(detail.duration);
            }
        };

        window.addEventListener('db-query-start', onStart);
        window.addEventListener('db-query-end', onEnd);
        return () => {
            window.removeEventListener('db-query-start', onStart);
            window.removeEventListener('db-query-end', onEnd);
        };
    }, []);

    useEffect(() => {
        if (!isExportMenuOpen) return;
        const onMouseDown = (event: MouseEvent) => {
            if (!exportMenuRef.current) return;
            if (event.target instanceof Node && exportMenuRef.current.contains(event.target)) return;
            setIsExportMenuOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsExportMenuOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isExportMenuOpen]);

    const mergedAlerts: PageAlert[] = [...(alerts ?? [])];
    if (storageStatus?.mode === 'memory') {
        const reasonText = storageStatus.reason
            ? ` ${t('common.storage_memory_reason', 'Reason')}: ${storageStatus.reason}`
            : '';
        mergedAlerts.unshift({
            level: 'warning',
            message: `${t('common.storage_memory_warning', 'Local persistence is currently unavailable. The database runs in memory and changes may be lost after reload.')}${reasonText}`
        });
    }

    const handleAbortQueries = async () => {
        await SystemRepository.abortActiveQueries();
    };

    const isRightPanelControlled = rightPanel?.isOpen !== undefined;
    const isRightPanelOpen = rightPanel
        ? (isRightPanelControlled ? Boolean(rightPanel.isOpen) : internalRightPanelOpen)
        : false;
    const isRightPanelEnabled = Boolean(rightPanel && (rightPanel.enabled ?? true));
    const isRightPanelOpenEffective = isRightPanelEnabled && isRightPanelOpen;
    const hasAnyExportAction = Boolean(header.export?.onPdfExport || header.export?.onExcelExport);
    const presentationDisabled = Boolean(header.presentation?.disabled) || !header.presentation?.onClick;
    const presentationTitle = header.presentation?.title || t('common.presentation_mode', 'Presentation Mode');
    const exportButtonDisabled = Boolean(header.export?.disabled) || !hasAnyExportAction;
    const exportButtonTitle = header.export?.title || t('common.export', 'Export');
    const canRunPdfExport = Boolean(header.export?.onPdfExport) && !header.export?.pdfDisabled;
    const canRunExcelExport = Boolean(header.export?.onExcelExport) && !header.export?.excelDisabled;
    const exportPdfTitle = header.export?.pdfTitle || t('common.export_pdf', 'PDF');
    const exportExcelTitle = header.export?.excelTitle || t('common.export_excel', 'Export Excel');
    const refreshDisabled = Boolean(header.refresh?.disabled) || !header.refresh?.onClick;
    const refreshTitle = header.refresh?.title || t('common.refresh', 'Refresh');
    const wikiBaseUrl = 'https://github.com/hrmnns/litebistudio/wiki';
    const wikiPathByRoute: Record<string, string> = {
        '/': 'Page-Dashboard',
        '/datasource': 'Page-Data-Management',
        '/tables': 'Page-Tables',
        '/sql-workspace': 'Page-SQL-Workspace',
        '/widgets': 'Page-Widgets',
        '/reports': 'Page-Reports',
        '/worklist': 'Page-Worklist',
        '/settings': 'Page-Settings',
        '/about': 'Page-About'
    };
    const currentPath = (() => {
        if (typeof window === 'undefined') return '/';
        const hashPath = window.location.hash?.startsWith('#/')
            ? window.location.hash.slice(1).split('?')[0]
            : '';
        return hashPath || window.location.pathname || '/';
    })();
    const resolvedHelpHref = header.help?.href
        || `${wikiBaseUrl}/${wikiPathByRoute[currentPath] || 'Home'}`;
    const helpDisabled = Boolean(header.help?.disabled) || !resolvedHelpHref;
    const helpTitle = header.help?.title || t('common.help', 'Help');
    const setRightPanelOpen = (open: boolean) => {
        if (!rightPanel) return;
        if (!isRightPanelControlled) setInternalRightPanelOpen(open);
        rightPanel.onOpenChange?.(open);
    };

    return (
        <div className={cn('h-full flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-500', className)}>
            {/* ── Header ── */}
            <header className="ui-page-header relative z-[70] flex-shrink-0 overflow-visible px-6 md:px-8 py-4 md:py-0 md:h-[var(--app-shell-header-h)]">
                <div className="flex flex-col md:flex-row md:h-full md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                                {header.title}
                            </h1>
                            {header.subtitle && (
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                    {header.subtitle}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="w-full md:w-auto flex items-center justify-end gap-2 flex-shrink-0 max-w-full md:max-w-none overflow-x-auto md:overflow-x-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-1 -mb-1">
                        {header.actions}
                        <Button
                            type="button"
                            onClick={() => {
                                if (helpDisabled) return;
                                window.open(resolvedHelpHref, '_blank', 'noopener,noreferrer');
                            }}
                            title={helpDisabled ? t('common.not_available', 'Not available') : helpTitle}
                            aria-label={helpDisabled ? t('common.not_available', 'Not available') : helpTitle}
                            disabled={helpDisabled}
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 flex-shrink-0 rounded-lg"
                        >
                            <CircleHelp className="w-4 h-4" />
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                if (!header.presentation?.onClick || presentationDisabled) return;
                                header.presentation.onClick();
                            }}
                            title={presentationDisabled ? t('common.not_available', 'Not available') : presentationTitle}
                            aria-label={presentationDisabled ? t('common.not_available', 'Not available') : presentationTitle}
                            disabled={presentationDisabled}
                            variant="ghost"
                            size="icon"
                            className={cn('h-10 w-10 flex-shrink-0 rounded-lg', header.presentation?.active && !presentationDisabled && 'ring-2 ring-blue-500/30')}
                        >
                            <Maximize2 className="w-4 h-4" />
                        </Button>
                        <div className="relative" ref={exportMenuRef}>
                            <Button
                                type="button"
                                onClick={() => {
                                    if (exportButtonDisabled) return;
                                    setIsExportMenuOpen(open => !open);
                                }}
                                title={exportButtonDisabled ? t('common.not_available', 'Not available') : exportButtonTitle}
                                aria-label={exportButtonDisabled ? t('common.not_available', 'Not available') : exportButtonTitle}
                                disabled={exportButtonDisabled}
                                variant="ghost"
                                size="icon"
                                className={cn('h-10 w-10 flex-shrink-0 rounded-lg', isExportMenuOpen && !exportButtonDisabled && 'ring-2 ring-blue-500/30')}
                            >
                                <Download className={cn('w-4 h-4', header.export?.loading && 'animate-pulse')} />
                            </Button>
                            {isExportMenuOpen && !exportButtonDisabled && (
                                <div className="absolute right-0 z-[120] mt-2 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-1">
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (!header.export?.onPdfExport || !canRunPdfExport) return;
                                            header.export.onPdfExport();
                                            setIsExportMenuOpen(false);
                                        }}
                                        disabled={!canRunPdfExport}
                                        title={canRunPdfExport ? exportPdfTitle : t('common.not_available', 'Not available')}
                                        variant="ghost"
                                        className={cn('w-full h-9 justify-start text-sm', !canRunPdfExport && 'text-slate-300 dark:text-slate-600')}
                                    >
                                        <FileText className="w-4 h-4" />
                                        <span>{t('common.export_pdf', 'PDF')}</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (!header.export?.onExcelExport || !canRunExcelExport) return;
                                            header.export.onExcelExport();
                                            setIsExportMenuOpen(false);
                                        }}
                                        disabled={!canRunExcelExport}
                                        title={canRunExcelExport ? exportExcelTitle : t('common.not_available', 'Not available')}
                                        variant="ghost"
                                        className={cn('w-full h-9 justify-start text-sm', !canRunExcelExport && 'text-slate-300 dark:text-slate-600')}
                                    >
                                        <FileSpreadsheet className="w-4 h-4" />
                                        <span>{t('common.export_excel', 'Export Excel')}</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                        <Button
                            type="button"
                            onClick={() => {
                                if (!header.refresh?.onClick || refreshDisabled) return;
                                header.refresh.onClick();
                            }}
                            title={refreshDisabled ? t('common.not_available', 'Not available') : refreshTitle}
                            aria-label={refreshDisabled ? t('common.not_available', 'Not available') : refreshTitle}
                            disabled={refreshDisabled}
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 flex-shrink-0 rounded-lg"
                        >
                            <RefreshCw className={cn('w-4 h-4', header.refresh?.loading && 'animate-spin')} />
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                if (!isRightPanelEnabled) return;
                                setRightPanelOpen(true);
                            }}
                            title={isRightPanelEnabled
                                ? (rightPanel?.triggerTitle || t('common.open', 'Open'))
                                : t('common.not_available', 'Not available')}
                            aria-label={isRightPanelEnabled
                                ? (rightPanel?.triggerTitle || t('common.open', 'Open'))
                                : t('common.not_available', 'Not available')}
                            disabled={!isRightPanelEnabled}
                            variant="ghost"
                            size="icon"
                            className={cn('h-10 w-10 flex-shrink-0 rounded-lg', isRightPanelEnabled && isRightPanelOpenEffective && 'ring-2 ring-blue-500/30', rightPanel?.triggerClassName)}
                        >
                            <PanelRightOpen className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* ── Body ── */}
            <div className={cn('flex-1', fillHeight ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}>
                <div className={cn('px-6 md:px-8 py-6', fillHeight ? 'flex-1 flex flex-col gap-6 overflow-hidden' : 'space-y-6')}>
                    {/* ── Alerts ── */}
                    {mergedAlerts.length > 0 && (
                        <div className="space-y-3 flex-shrink-0">
                            {mergedAlerts.map((alert, i) => {
                                const s = alertStyles[alert.level];
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            'flex items-center justify-between gap-4 p-4 rounded-xl border',
                                            s.bg, s.border
                                        )}
                                    >
                                        <div className={cn('flex items-center gap-3 text-sm font-medium', s.text)}>
                                            <span className="text-base flex-shrink-0">{s.icon}</span>
                                            <span>{alert.message}</span>
                                        </div>
                                        {alert.action && (
                                            <button
                                                onClick={alert.action.onClick}
                                                className="flex-shrink-0 px-4 py-1.5 text-xs font-bold uppercase tracking-wider border border-current rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                            >
                                                {alert.action.label}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Content Area (Main + Sidebar) ── */}
                    {sidebar ? (
                        <div className={cn('flex flex-col lg:flex-row gap-6', fillHeight && 'flex-1 overflow-hidden')}>
                            <div className={cn('flex-1 min-w-0', fillHeight ? 'flex flex-col gap-6 overflow-hidden' : 'space-y-6')}>
                                {children}
                            </div>
                            <aside className="w-full lg:w-72 flex-shrink-0 space-y-6">
                                {sidebar}
                            </aside>
                        </div>
                    ) : (
                        <div className={cn(fillHeight ? 'flex-1 flex flex-col gap-6 overflow-hidden' : 'space-y-6')}>
                            {children}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Footer ── */}
            {(footer || (breadcrumbs && breadcrumbs.length > 0) || activeQueries > 0 || lastQueryMs !== null) && (
                <footer className="flex-shrink-0 px-6 md:px-8 py-3 border-t border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                            {isReadOnly && (
                                <div
                                    className="flex items-center gap-2 px-2.5 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-900/40 border border-rose-300 dark:border-rose-700 shadow-sm"
                                    title={t('common.read_only', 'Read-Only')}
                                >
                                    <Lock className="w-3.5 h-3.5 text-rose-700 dark:text-rose-300" />
                                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-200">
                                        {t('common.read_only', 'Read-Only')}
                                    </span>
                                </div>
                            )}
                            {isAdminMode ? (
                                <div
                                    className="flex items-center gap-2 px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 shadow-sm"
                                    title={t('settings.admin_mode_active', 'Admin Mode active')}
                                >
                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-200">
                                        {t('settings.admin_mode', 'Admin Mode')}
                                    </span>
                                </div>
                            ) : (
                                <div
                                    className="flex items-center px-1.5 py-0.5 rounded-full text-slate-400 dark:text-slate-500"
                                    title={t('settings.user_mode', 'User Mode')}
                                >
                                    <User className="w-3.5 h-3.5" />
                                </div>
                            )}
                            {/* Global Loading & Performance Indicator */}
                            {(activeQueries > 0 || lastQueryMs !== null) && (
                                <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all" title="Letzte Datenbank-Antwortzeit">
                                    {activeQueries > 0 ? (
                                        <>
                                            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('common.loading', 'Loading...')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Activity className="w-3 h-3 text-emerald-500" />
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{Math.round(lastQueryMs!)} ms</span>
                                        </>
                                    )}
                                </div>
                            )}
                            {activeQueries > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { void handleAbortQueries(); }}
                                    className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-700 transition-colors"
                                    title={t('common.stop_sql', 'Stop')}
                                >
                                    {t('common.stop_sql', 'Stop')}
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3 text-right">
                            {footer && <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{footer}</div>}

                            {footer && breadcrumbs && breadcrumbs.length > 0 && (
                                <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                            )}

                            {breadcrumbs && breadcrumbs.length > 0 && (
                                <nav className="flex items-center gap-1.5 text-[10px] uppercase font-black tracking-wider">
                                    {breadcrumbs.map((crumb, i) => (
                                        <React.Fragment key={i}>
                                            {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
                                            {crumb.href || crumb.onClick ? (
                                                <a
                                                    href={crumb.href || '#'}
                                                    onClick={(e) => {
                                                        if (crumb.onClick) {
                                                            e.preventDefault();
                                                            crumb.onClick();
                                                        }
                                                    }}
                                                    className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                                                >
                                                    {crumb.label}
                                                </a>
                                            ) : (
                                                <span className="text-slate-600 dark:text-slate-300">
                                                    {crumb.label}
                                                </span>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </nav>
                            )}
                        </div>
                    </div>
                </footer>
            )}
            {rightPanel && isRightPanelEnabled && rightPanel.content != null && (
                <RightOverlayPanel
                    isOpen={isRightPanelOpenEffective}
                    onClose={() => setRightPanelOpen(false)}
                    title={rightPanel.title}
                    width={rightPanel.width}
                    noScroll={rightPanel.noScroll}
                >
                    {rightPanel.content}
                </RightOverlayPanel>
            )}
        </div>
    );
};
