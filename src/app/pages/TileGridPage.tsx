import React from 'react';
import { TileGrid } from '../TileGrid';
import { useDashboard } from '../../lib/context/DashboardContext';

export const TileGridPage: React.FC = () => {
    const { visibleTileIds, tileOrder, setTileOrder, setVisibleTileIds } = useDashboard();

    return (
        <div className="h-full overflow-y-auto animate-in fade-in duration-500">
            <TileGrid
                visibleTileIds={visibleTileIds}
                tileOrder={tileOrder}
                onOrderChange={setTileOrder}
                onRemoveTile={(id) => setVisibleTileIds(visibleTileIds.filter(v => v !== id))}
            />
        </div>
    );
};
