import React, { createContext, useContext, type ReactNode } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { COMPONENTS } from '../../config/components';

interface DashboardContextType {
    visibleComponentIds: string[];
    setVisibleComponentIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    visibleSidebarComponentIds: string[];
    setVisibleSidebarComponentIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    componentOrder: string[];
    setComponentOrder: (order: string[] | ((prev: string[]) => string[])) => void;
    isSidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
    changeCount: number;
    lastBackup: string | null;
    markBackupComplete: () => void;
    isLocked: boolean;
    lockApp: () => void;
    unlockApp: () => void;
    isPresentationMode: boolean;
    togglePresentationMode: () => void;
    isReadOnly: boolean;
    setIsReadOnly: (readOnly: boolean) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const GRID_SIZE = 60;
    const initialOrder = Array.from({ length: GRID_SIZE }, (_, i) => `slot-${i}`);
    COMPONENTS.forEach((component, i) => {
        if (i < GRID_SIZE) initialOrder[i] = component.id;
    });

    // Merge existing components into the slots at initialization
    const [visibleComponentIds, setVisibleComponentIds] = useLocalStorage<string[]>('visibleComponentIds', COMPONENTS.map(t => t.id));
    const [visibleSidebarComponentIds, setVisibleSidebarComponentIds] = useLocalStorage<string[]>('visibleSidebarComponentIds', COMPONENTS.filter(t => t.targetView).map(t => t.id));
    const [componentOrder, setComponentOrder] = useLocalStorage<string[]>('componentOrder', initialOrder);
    const [isSidebarCollapsed, setSidebarCollapsed] = useLocalStorage<boolean>('isSidebarCollapsed', false);

    // Backup State
    const [lastBackup, setLastBackup] = useLocalStorage<string | null>('litebistudio_last_backup', null);
    const [changeCount, setChangeCount] = useLocalStorage<number>('litebistudio_changes_since_backup', 0);

    const markBackupComplete = React.useCallback(() => {
        setLastBackup(new Date().toISOString());
        setChangeCount(0);
    }, [setLastBackup, setChangeCount]);

    React.useEffect(() => {
        const handleDbChange = (e: any) => {
            const detail = e.detail || {};
            if (detail.type === 'restore') {
                setChangeCount(0);
                setLastBackup(new Date().toISOString());
            } else if (detail.type === 'clear') {
                setChangeCount((prev: number) => prev + 1);
            } else {
                setChangeCount((prev: number) => prev + (detail.count || 1));
            }
        };

        window.addEventListener('db-changed', handleDbChange);
        return () => window.removeEventListener('db-changed', handleDbChange);
    }, [setChangeCount, setLastBackup]);

    // Sync state if new components are added, but preserve slots
    React.useEffect(() => {
        const allComponentIds = COMPONENTS.map(t => t.id);
        const missingComponents = allComponentIds.filter(id => !componentOrder.includes(id));

        if (missingComponents.length > 0) {
            setComponentOrder(prev => {
                const next = [...prev];
                let missingIdx = 0;
                // Try to fill empty slots first
                for (let i = 0; i < next.length && missingIdx < missingComponents.length; i++) {
                    if (next[i].startsWith('slot-')) {
                        next[i] = missingComponents[missingIdx++];
                    }
                }
                // If no slots left, append
                return [...next, ...missingComponents.slice(missingIdx)];
            });
            setVisibleComponentIds(prev => [...new Set([...prev, ...missingComponents])]);

            // Also sync sidebar items for components that have a view
            const missingSidebarComponents = missingComponents.filter(id => COMPONENTS.find(t => t.id === id)?.targetView);
            if (missingSidebarComponents.length > 0) {
                setVisibleSidebarComponentIds(prev => [...new Set([...prev, ...missingSidebarComponents])]);
            }
        }
    }, [componentOrder, setComponentOrder, visibleComponentIds, setVisibleComponentIds, setVisibleSidebarComponentIds]);

    // Lock State
    const [isLocked, setIsLocked] = React.useState<boolean>(() => {
        // Init locked if PIN exists
        return !!localStorage.getItem('litebistudio_app_pin');
    });

    const lockApp = React.useCallback(() => setIsLocked(true), []);
    const unlockApp = React.useCallback(() => setIsLocked(false), []);

    // Presentation Mode
    const [isPresentationMode, setIsPresentationMode] = React.useState(false);
    const togglePresentationMode = React.useCallback(() => setIsPresentationMode(prev => !prev), []);

    // Read-Only Mode
    const [isReadOnly, setIsReadOnly] = React.useState(false);

    return (
        <DashboardContext.Provider value={{
            visibleComponentIds,
            setVisibleComponentIds,
            visibleSidebarComponentIds,
            setVisibleSidebarComponentIds,
            componentOrder,
            setComponentOrder,
            isSidebarCollapsed,
            setSidebarCollapsed,
            changeCount,
            lastBackup,
            markBackupComplete,
            isLocked,
            lockApp,
            unlockApp,
            isPresentationMode,
            togglePresentationMode,
            isReadOnly,
            setIsReadOnly
        }}>
            {children}
        </DashboardContext.Provider>
    );
};

export const useDashboard = () => {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error('useDashboard must be used within a DashboardProvider');
    }
    return context;
};
