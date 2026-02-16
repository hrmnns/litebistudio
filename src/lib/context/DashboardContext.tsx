import React, { createContext, useContext, type ReactNode } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { TILES } from '../../config/tiles';

interface DashboardContextType {
    visibleTileIds: string[];
    setVisibleTileIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    visibleSidebarItemIds: string[];
    setVisibleSidebarItemIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    tileOrder: string[];
    setTileOrder: (order: string[] | ((prev: string[]) => string[])) => void;
    isSidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const GRID_SIZE = 60;
    const initialOrder = Array.from({ length: GRID_SIZE }, (_, i) => `slot-${i}`);
    TILES.forEach((tile, i) => {
        if (i < GRID_SIZE) initialOrder[i] = tile.id;
    });

    // Merge existing tiles into the slots at initialization
    const [visibleTileIds, setVisibleTileIds] = useLocalStorage<string[]>('visibleTileIds', TILES.map(t => t.id));
    const [visibleSidebarItemIds, setVisibleSidebarItemIds] = useLocalStorage<string[]>('visibleSidebarItemIds', TILES.filter(t => t.targetView).map(t => t.id));
    const [tileOrder, setTileOrder] = useLocalStorage<string[]>('tileOrder', initialOrder);
    const [isSidebarCollapsed, setSidebarCollapsed] = useLocalStorage<boolean>('isSidebarCollapsed', false);

    // Sync state if new tiles are added, but preserve slots
    React.useEffect(() => {
        const allTileIds = TILES.map(t => t.id);
        const missingTiles = allTileIds.filter(id => !tileOrder.includes(id));

        if (missingTiles.length > 0) {
            setTileOrder(prev => {
                const next = [...prev];
                let missingIdx = 0;
                // Try to fill empty slots first
                for (let i = 0; i < next.length && missingIdx < missingTiles.length; i++) {
                    if (next[i].startsWith('slot-')) {
                        next[i] = missingTiles[missingIdx++];
                    }
                }
                // If no slots left, append
                return [...next, ...missingTiles.slice(missingIdx)];
            });
            setVisibleTileIds(prev => [...new Set([...prev, ...missingTiles])]);

            // Also sync sidebar items for tiles that have a view
            const missingSidebarTiles = missingTiles.filter(id => TILES.find(t => t.id === id)?.targetView);
            if (missingSidebarTiles.length > 0) {
                setVisibleSidebarItemIds(prev => [...new Set([...prev, ...missingSidebarTiles])]);
            }
        }
    }, [tileOrder, setTileOrder, visibleTileIds, setVisibleTileIds, setVisibleSidebarItemIds]);

    return (
        <DashboardContext.Provider value={{
            visibleTileIds,
            setVisibleTileIds,
            visibleSidebarItemIds,
            setVisibleSidebarItemIds,
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
