import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings, Database, Menu, ChevronLeft, ChevronRight, ClipboardList, ShieldCheck, Wallet, Server, Radar, Search, Play } from 'lucide-react';
import { SystemStatus } from './SystemStatus';
import { useDashboard } from '../../lib/context/DashboardContext';
import { COMPONENTS } from '../../config/components';

interface SidebarProps {
    isCollapsed: boolean;
    sidebarOpen: boolean;
    onToggleCollapse: () => void;
    onCloseMobile: () => void;
    /** @deprecated kept for backwards compat — ignored when using router */
    currentView?: string;
    /** @deprecated kept for backwards compat — ignored when using router */
    onNavigate?: (view: string) => void;
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
}) => {
    const { visibleSidebarComponentIds } = useDashboard();

    // Map component names to Lucide icons
    const iconMap: Record<string, React.ReactNode> = {
        'ItCostsComponent': <Wallet className="w-5 h-5 flex-shrink-0 text-emerald-500" />,
        'SystemsComponent': <Server className="w-5 h-5 flex-shrink-0 text-blue-500" />,
        'AnomalyRadarComponent': <Radar className="w-5 h-5 flex-shrink-0 text-rose-500" />,
        'WorklistComponent': <ClipboardList className="w-5 h-5 flex-shrink-0 text-amber-500" />,
        'DataInspectorComponent': <Search className="w-5 h-5 flex-shrink-0 text-indigo-500" />,
    };

    const staticTopItems: NavItem[] = [
        { to: '/', icon: <LayoutDashboard className="w-5 h-5 flex-shrink-0" />, label: 'Overview' },
    ];

    const dynamicItems: NavItem[] = COMPONENTS
        .filter(comp => comp.targetView && visibleSidebarComponentIds.includes(comp.id))
        .map(comp => ({
            to: comp.targetView!,
            icon: iconMap[comp.component] || <LayoutDashboard className="w-5 h-5 flex-shrink-0" />,
            label: comp.title
        }));

    const staticBottomItems: NavItem[] = [
        { to: '/datasource', icon: <Database className="w-5 h-5 flex-shrink-0" />, label: 'Data Management' },
        { to: '/query', icon: <Play className="w-5 h-5 flex-shrink-0" />, label: 'Query Builder' },
        { to: '/settings', icon: <Settings className="w-5 h-5 flex-shrink-0" />, label: 'Settings' },
    ];

    return (
        <aside className={`
            fixed inset-y-0 left-0 z-50 bg-white dark:bg-slate-800 border-r border-slate-300 dark:border-slate-700 transform transition-all duration-300 ease-in-out
            ${isCollapsed ? 'md:w-20' : 'md:w-64'}
            ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
        `}>
            <div className={`p-6 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between ${isCollapsed ? 'md:p-4 md:justify-center' : ''}`}>
                <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="flex-shrink-0 p-1.5 bg-blue-600 rounded-lg shadow-lg shadow-blue-200 dark:shadow-none">
                        <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div className={`transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0' : 'opacity-100'}`}>
                        <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                            IT <span className="text-blue-600">Dashboard</span>
                        </h1>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Analytics Platform</p>
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
                <nav className="p-4 space-y-1">
                    {[...staticTopItems, ...dynamicItems, ...staticBottomItems].map(({ to, icon, label }) => (
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

                <div className={`p-4 py-5 border-t border-slate-300 dark:border-slate-700 transition-all space-y-4 ${isCollapsed ? 'md:p-2 md:py-4' : ''}`}>


                    <SystemStatus isCollapsed={isCollapsed} />
                </div>
            </div>
        </aside>
    );
};
