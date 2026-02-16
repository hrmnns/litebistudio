import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useDashboard } from '../lib/context/DashboardContext';
import { Sidebar } from './components/Sidebar';
import { onTabConflict } from '../lib/db';
import { MultiTabModal } from './components/MultiTabModal';
import { useEffect } from 'react';

export const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [hasConflict, setHasConflict] = useState(false);
    const { isSidebarCollapsed, setSidebarCollapsed } = useDashboard();

    useEffect(() => {
        const unsubscribe = onTabConflict((conflict) => {
            setHasConflict(conflict);
        });
        return () => {
            unsubscribe();
        };
    }, []);

    return (
        <div className="h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
            <Sidebar
                currentView={'dashboard'}
                isCollapsed={isSidebarCollapsed}
                sidebarOpen={sidebarOpen}
                onNavigate={() => { }}
                onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
                onCloseMobile={() => setSidebarOpen(false)}
            />

            {/* Main Content */}
            <main className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
                {/* Mobile Header */}
                <header className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                    <button onClick={() => setSidebarOpen(true)} className="p-1 text-slate-500 hover:text-slate-700">
                        <Menu className="w-6 h-6" />
                    </button>
                    <h1 className="text-lg font-bold">IT Dashboard</h1>
                </header>

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

            {hasConflict && (
                <MultiTabModal />
            )}
        </div>
    );
};
