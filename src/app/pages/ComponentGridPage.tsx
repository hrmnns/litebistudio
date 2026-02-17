import React from 'react';
import { ComponentGrid } from '../ComponentGrid';
import { useDashboard } from '../../lib/context/DashboardContext';

export const ComponentGridPage: React.FC = () => {
    const { visibleComponentIds, componentOrder, setComponentOrder, setVisibleComponentIds } = useDashboard();

    return (
        <div className="h-full overflow-y-auto animate-in fade-in duration-500">
            <ComponentGrid
                visibleComponentIds={visibleComponentIds}
                componentOrder={componentOrder}
                onOrderChange={setComponentOrder}
                onRemoveComponent={(id) => setVisibleComponentIds(visibleComponentIds.filter(v => v !== id))}
            />
        </div>
    );
};
