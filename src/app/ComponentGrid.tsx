import React from 'react';
import { COMPONENTS } from '../config/components';
import { getComponent } from './registry';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SortableComponent } from './SortableComponent';
import { cn } from '../lib/utils';

interface ComponentGridProps {
    visibleComponentIds: string[];
    componentOrder: string[];
    onOrderChange: (newOrder: string[]) => void;
    onRemoveComponent: (id: string) => void;
}

export const ComponentGrid: React.FC<ComponentGridProps> = ({
    visibleComponentIds,
    componentOrder,
    onOrderChange,
    onRemoveComponent
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const [activeId, setActiveId] = React.useState<string | null>(null);

    const handleDragStart = (event: { active: { id: any } }) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            const oldIndex = componentOrder.indexOf(active.id as string);
            const newIndex = componentOrder.indexOf(over.id as string);

            // True Swap behavior: we exchange the contents of the indices
            const nextOrder = [...componentOrder];
            [nextOrder[oldIndex], nextOrder[newIndex]] = [nextOrder[newIndex], nextOrder[oldIndex]];
            onOrderChange(nextOrder);
        }
    };

    const handleDragCancel = () => {
        setActiveId(null);
    };

    const activeComponent = activeId ? COMPONENTS.find(t => t.id === activeId) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="relative [container-type:inline-size] w-full min-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar pb-20">
                <div className={cn(
                    "relative grid gap-6 p-6 auto-rows-[minmax(0,1fr)] transition-all",
                    "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                    "[--cols:1] md:[--cols:2] lg:[--cols:3] xl:[--cols:4]",
                    "grid-auto-rows-[calc((100cqw-((var(--cols)-1)*1.5rem)-3rem)/var(--cols))]"
                )}>
                    {componentOrder.map((id) => {
                        const component = COMPONENTS.find(t => t.id === id);
                        const isVisible = component && visibleComponentIds.includes(component.id);
                        const Component = isVisible ? getComponent(component.component) : null;

                        return (
                            <SortableComponent
                                key={id}
                                id={id}
                                title={component?.title || `Slot ${id}`}
                                size={component?.defaultSize || 'small'}
                                targetView={component?.targetView}
                                onRemove={onRemoveComponent}
                                className={cn(!isVisible && "hidden md:block")}
                            >
                                {Component ? <Component /> : <div className="w-full h-full" />}
                            </SortableComponent>
                        );
                    })}
                </div>
            </div>

            {/* Drag Overlay for high-fidelity preview */}
            <DragOverlay adjustScale={true} zIndex={100}>
                {activeId && activeComponent ? (() => {
                    const Component = getComponent(activeComponent.component);
                    return Component ? (
                        <div className="w-full h-full opacity-80 cursor-grabbing shadow-2xl scale-105 transition-transform">
                            <Component isOverlay={true} />
                        </div>
                    ) : null;
                })() : null}
            </DragOverlay>
        </DndContext>
    );
};
