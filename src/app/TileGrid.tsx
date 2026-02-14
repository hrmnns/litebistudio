import React from 'react';
import { TILES } from '../config/tiles';
import { getTileComponent } from './registry';
import { Card } from '../components/ui/Card';
import type { TileSize } from '../types';

const getSizeClass = (size: TileSize) => {
    switch (size) {
        case 'large': return 'col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 min-h-[400px]';
        case 'medium': return 'col-span-1 md:col-span-2 min-h-[300px]';
        case 'small': return 'col-span-1 min-h-[200px]';
        default: return 'col-span-1';
    }
};

interface TileGridProps {
    onNavigate: (view: any) => void;
}

export const TileGrid: React.FC<TileGridProps> = ({ onNavigate }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
            {TILES.map((tile) => {
                const Component = getTileComponent(tile.component);
                if (!Component) {
                    console.warn(`Component ${tile.component} not found`);
                    return null;
                }

                return (
                    <Card
                        key={tile.id}
                        title={tile.title}
                        className={getSizeClass(tile.defaultSize)}
                    >
                        <Component onNavigate={onNavigate} />
                    </Card>
                );
            })}
        </div>
    );
};
