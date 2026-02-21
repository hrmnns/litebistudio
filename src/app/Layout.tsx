import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Minimize2 } from 'lucide-react';
import { useDashboard } from '../lib/context/DashboardContext';
import { Sidebar } from './components/Sidebar';
import { onTabConflict } from '../lib/db';
import { MultiTabModal } from './components/MultiTabModal';
import { useEffect } from 'react';
import { LockScreen } from './components/LockScreen';

export const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [hasConflict, setHasConflict] = useState(false);
    const { isSidebarCollapsed, setSidebarCollapsed, isPresentationMode, togglePresentationMode, isReadOnly, setIsReadOnly } = useDashboard();

    useEffect(() => {
        const unsubscribe = onTabConflict((conflict, readOnly) => {
            setHasConflict(conflict);
            setIsReadOnly(readOnly ?? false);
        });
        return () => {
            unsubscribe();
        };
    }, [setIsReadOnly]);

    return (
        <div className="h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
            {!isPresentationMode && (
                <Sidebar
                    currentView={'dashboard'}
                    isCollapsed={isSidebarCollapsed}
                    sidebarOpen={sidebarOpen}
                    onNavigate={() => { }}
                    onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
                    onCloseMobile={() => setSidebarOpen(false)}
                    isReadOnly={isReadOnly}
                />
            )}

            {/* Main Content */}
            <main className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${isPresentationMode ? 'ml-0' : (isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64')}`}>
                {/* Mobile Header */}
                {!isPresentationMode && (
                    <header className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(true)} className="p-1 text-slate-500 hover:text-slate-700">
                            <Menu className="w-6 h-6" />
                        </button>
                        <h1 className="text-lg font-bold flex items-center gap-2">
                            LiteBI Studio
                            {isReadOnly && <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">Lese-Modus</span>}
                        </h1>
                    </header>
                )}

                <div className="flex-1 min-h-0 overflow-hidden relative">
                    <Outlet />
                </div>
            </main>

            {/* Overlay for mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden glass"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {hasConflict && !isReadOnly && (
                <MultiTabModal />
            )}

            <LockScreen />

            {/* Presentation Mode Exit Button */}
            {isPresentationMode && (
                <button
                    onClick={togglePresentationMode}
                    className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900 text-white rounded-full shadow-2xl hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 group"
                    title="Präsentationsmodus beenden"
                >
                    <Minimize2 className="w-6 h-6" />
                    <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Modus beenden
                    </span>
                </button>
            )}
        </div>
    );
};
