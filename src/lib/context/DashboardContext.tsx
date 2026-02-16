import React, { createContext, useContext, type ReactNode } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { TILES } from '../../config/tiles';

interface DashboardContextType {
    visibleTileIds: string[];
    setVisibleTileIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    tileOrder: string[];
    setTileOrder: (order: string[] | ((prev: string[]) => string[])) => void;
    isSidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Tile customization
    const [visibleTileIds, setVisibleTileIds] = useLocalStorage<string[]>('visibleTileIds', TILES.map(t => t.id));
    const [tileOrder, setTileOrder] = useLocalStorage<string[]>('tileOrder', TILES.map(t => t.id));
    const [isSidebarCollapsed, setSidebarCollapsed] = useLocalStorage<boolean>('isSidebarCollapsed', false);

    // Sync state if new tiles are added to the configuration
    React.useEffect(() => {
        const allTileIds = TILES.map(t => t.id);
        const newTiles = allTileIds.filter(id => !tileOrder.includes(id));

        if (newTiles.length > 0) {
            setTileOrder(prev => [...prev, ...newTiles]);
            setVisibleTileIds(prev => [...new Set([...prev, ...newTiles])]);
        }
    }, [tileOrder, setTileOrder, visibleTileIds, setVisibleTileIds]);

    return (
        <DashboardContext.Provider value={{
            visibleTileIds,
            setVisibleTileIds,
            tileOrder,
            setTileOrder,
            isSidebarCollapsed,
            setSidebarCollapsed
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
