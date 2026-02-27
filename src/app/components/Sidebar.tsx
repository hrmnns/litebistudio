import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings, Database, Menu, ChevronLeft, ChevronRight, ClipboardList, Wallet, Server, Radar, Search, Play, Globe, Info, FileText, Lock, Code2 } from 'lucide-react';
import { SystemStatus } from './SystemStatus';
import { useDashboard } from '../../lib/context/DashboardContext';
import { COMPONENTS } from '../../config/components';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import AppBrandIcon from './ui/AppBrandIcon';

interface SidebarProps {
    isCollapsed: boolean;
    sidebarOpen: boolean;
    onToggleCollapse: () => void;
    onCloseMobile: () => void;
    /** @deprecated kept for backwards compat — ignored when using router */
    currentView?: string;
    /** @deprecated kept for backwards compat — ignored when using router */
    /** @deprecated kept for backwards compat — ignored when using router */
    onNavigate?: (view: string) => void;
    isReadOnly?: boolean;
}

interface NavItem {
    to: string;
    icon: React.ReactNode;
    label: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
    isCollapsed,
    sidebarOpen,
    onToggleCollapse,
    onCloseMobile,
    isReadOnly,
}) => {
    const { t, i18n } = useTranslation();
    const { visibleSidebarComponentIds, lockApp } = useDashboard();
    const [isPinActive, setIsPinActive] = React.useState(!!localStorage.getItem('litebistudio_app_pin'));
    const [showLanguageSwitch, setShowLanguageSwitch] = useLocalStorage<boolean>('ui_sidebar_show_language_switch', true);
    const [showSystemStatus, setShowSystemStatus] = useLocalStorage<boolean>('ui_sidebar_show_system_status', true);

    React.useEffect(() => {
        const handlePinChange = () => {
            setIsPinActive(!!localStorage.getItem('litebistudio_app_pin'));
        };
        window.addEventListener('pin-changed', handlePinChange);
        return () => window.removeEventListener('pin-changed', handlePinChange);
    }, []);

    React.useEffect(() => {
        const handleLanguageVisibilityChange = (event: Event) => {
            const customEvent = event as CustomEvent<{ visible?: boolean }>;
            if (typeof customEvent.detail?.visible === 'boolean') {
                setShowLanguageSwitch(customEvent.detail.visible);
            }
        };
        window.addEventListener('sidebar-language-visibility-changed', handleLanguageVisibilityChange as EventListener);
        return () => window.removeEventListener('sidebar-language-visibility-changed', handleLanguageVisibilityChange as EventListener);
    }, [setShowLanguageSwitch]);

    React.useEffect(() => {
        const handleSystemStatusVisibilityChange = (event: Event) => {
            const customEvent = event as CustomEvent<{ visible?: boolean }>;
            if (typeof customEvent.detail?.visible === 'boolean') {
                setShowSystemStatus(customEvent.detail.visible);
            }
        };
        window.addEventListener('sidebar-system-status-visibility-changed', handleSystemStatusVisibilityChange as EventListener);
        return () => window.removeEventListener('sidebar-system-status-visibility-changed', handleSystemStatusVisibilityChange as EventListener);
    }, [setShowSystemStatus]);

    const toggleLanguage = () => {
        const nextLng = i18n.language.startsWith('de') ? 'en' : 'de';
        i18n.changeLanguage(nextLng);
    };

    // Map component names to Lucide icons
    const iconMap: Record<string, React.ReactNode> = {
        'ItCostsComponent': <Wallet className="w-5 h-5 flex-shrink-0 text-emerald-500" />,
        'SystemsComponent': <Server className="w-5 h-5 flex-shrink-0 text-blue-500" />,
        'AnomalyRadarComponent': <Radar className="w-5 h-5 flex-shrink-0 text-rose-500" />,
        'WorklistComponent': <ClipboardList className="w-5 h-5 flex-shrink-0 text-amber-500" />,
        'DataInspectorComponent': <Search className="w-5 h-5 flex-shrink-0 text-indigo-500" />,
    };

    const staticTopItems: NavItem[] = [
        { to: '/', icon: <LayoutDashboard className="w-5 h-5 flex-shrink-0" />, label: t('sidebar.dashboard') },
    ];

    const dynamicItems: NavItem[] = COMPONENTS
        .filter(comp => comp.targetView && visibleSidebarComponentIds.includes(comp.id))
        .map(comp => ({
            to: comp.targetView!,
            icon: iconMap[comp.component] || <LayoutDashboard className="w-5 h-5 flex-shrink-0" />,
            label: t(`sidebar.${comp.id.replace(/-/g, '_')}`, comp.title)
        }));

    const staticBottomItems: NavItem[] = [
        { to: '/datasource', icon: <Database className="w-5 h-5 flex-shrink-0" />, label: t('sidebar.datasource') },
        { to: '/sql-workspace', icon: <Code2 className="w-5 h-5 flex-shrink-0" />, label: t('sidebar.sql_workspace') },
        { to: '/query', icon: <Play className="w-5 h-5 flex-shrink-0" />, label: t('sidebar.query_builder') },
        { to: '/reports', icon: <FileText className="w-5 h-5 flex-shrink-0" />, label: t('sidebar.reports') },
        { to: '/about', icon: <Info className="w-5 h-5 flex-shrink-0" />, label: t('sidebar.about') },
    ];
    const navOrder: Record<string, number> = {
        '/': 0,
        '/datasource': 1,
        '/inspector': 2,
        '/sql-workspace': 3,
        '/query': 4,
        '/reports': 5,
        '/worklist': 6,
        '/settings': 7,
        '/about': 8
    };
    const orderedNavItems = [...staticTopItems, ...dynamicItems, ...staticBottomItems]
        .sort((a, b) => {
            const aOrder = navOrder[a.to] ?? 100;
            const bOrder = navOrder[b.to] ?? 100;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.label.localeCompare(b.label);
        });

    return (
        <aside className={`
            fixed inset-y-0 left-0 z-50 bg-white dark:bg-slate-800 border-r border-slate-300 dark:border-slate-700 transform transition-all duration-300 ease-in-out
            ${isCollapsed ? 'md:w-20' : 'md:w-64'}
            ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
        `}>
            <div className={`p-6 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between ${isCollapsed ? 'md:p-4 md:justify-center' : ''}`}>
                <div className="flex items-center gap-2.5 overflow-hidden">
                    <AppBrandIcon size={32} className="flex-shrink-0" />
                    <div className={`transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0' : 'opacity-100 flex flex-col'}`}>
                        <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                            LiteBI <span className="text-blue-600">Studio</span>
                        </h1>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">{t('sidebar.analytics_platform')}</p>
                    </div>
                </div>
                <button onClick={onCloseMobile} className="md:hidden p-1 text-slate-500 hover:text-slate-700">
                    <Menu className="w-6 h-6" />
                </button>

                {/* PC Collapse Toggle */}
                <button
                    onClick={onToggleCollapse}
                    className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-full items-center justify-center shadow-md hover:text-blue-600 transition-colors z-50"
                >
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            <div className="flex flex-col h-[calc(100%-80px)] justify-between">
                <div>
                    {isReadOnly && (
                        <div className={`bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50 px-4 py-3 flex items-start gap-3 text-amber-800 dark:text-amber-400 overflow-hidden ${isCollapsed ? 'md:px-0 md:justify-center' : ''}`}>
                            <Info className="w-5 h-5 flex-shrink-0" />
                            <div className={`text-xs transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0' : 'opacity-100'}`}>
                                <span className="font-semibold block text-sm">Lese-Modus</span>
                                Schreibschutz aktiv (2. Tab)
                            </div>
                        </div>
                    )}

                    <nav className="p-4 space-y-1">
                        {orderedNavItems.map(({ to, icon, label }) => (
                            <NavLink
                                key={`${label}-${to}`}
                                to={to}
                                end={to === '/'}
                                onClick={onCloseMobile}
                                className={({ isActive }) =>
                                    `w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all ${isCollapsed ? 'md:justify-center md:px-0' : ''} ${isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`
                                }
                                title={isCollapsed ? label : ''}
                            >
                                {icon}
                                <span className={`transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0 overflow-hidden' : 'opacity-100'}`}>{label}</span>
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className={`p-4 border-t border-slate-300 dark:border-slate-700 transition-all space-y-1 ${isCollapsed ? 'md:p-2 md:py-4' : ''}`}>
                    {showLanguageSwitch && (
                        <button
                            onClick={toggleLanguage}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${isCollapsed ? 'md:justify-center md:px-0' : ''}`}
                            title={i18n.language.startsWith('de') ? 'Switch to English' : 'Auf Deutsch umstellen'}
                        >
                            <Globe className="w-5 h-5 flex-shrink-0" />
                            <span className={`transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0 overflow-hidden' : 'opacity-100'}`}>
                                {i18n.language.startsWith('de') ? 'English' : 'Deutsch'}
                            </span>
                        </button>
                    )}
                    <NavLink
                        to="/settings"
                        onClick={onCloseMobile}
                        className={({ isActive }) =>
                            `w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all ${isCollapsed ? 'md:justify-center md:px-0' : ''} ${isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`
                        }
                        title={isCollapsed ? t('sidebar.settings') : ''}
                    >
                        <Settings className="w-5 h-5 flex-shrink-0" />
                        <span className={`transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0 overflow-hidden' : 'opacity-100'}`}>
                            {t('sidebar.settings')}
                        </span>
                    </NavLink>

                    {isPinActive && (
                        <button
                            onClick={lockApp}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${isCollapsed ? 'md:justify-center md:px-0' : ''}`}
                            title={i18n.language.startsWith('de') ? 'Lock screen' : 'Sperrbildschirm aktivieren'}
                        >
                            <Lock className="w-5 h-5 flex-shrink-0" />
                            <span className={`transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0 overflow-hidden' : 'opacity-100'}`}>
                                {i18n.language.startsWith('de') ? 'Lock' : 'Sperren'}
                            </span>
                        </button>
                    )}

                    {showSystemStatus && <SystemStatus isCollapsed={isCollapsed} />}
                </div>
            </div>
        </aside >
    );
};
