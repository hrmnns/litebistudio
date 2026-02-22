import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import type { ComponentSize } from '../types';
import { cn } from '../lib/utils';

const getSizeClass = (size: ComponentSize) => {
    switch (size) {
        case 'large':
            return 'col-span-1 md:col-span-2 row-span-2';
        case 'medium':
            return 'col-span-1 md:col-span-2';
        case 'small':
            return 'col-span-1';
        default:
            return 'col-span-1';
    }
};

interface SortableComponentProps {
    id: string;
    title: string;
    size: ComponentSize;
    targetView?: string;
    onRemove?: (id: string) => void;
    children: React.ReactNode;
    className?: string;
}

export const SortableComponent: React.FC<SortableComponentProps> = ({
    id, size, targetView, onRemove, children, className
}) => {
    const navigate = useNavigate();

    // Use Draggable for movement
    const {
        attributes,
        listeners,
        setNodeRef: setDraggableRef,
        transform,
        isDragging
    } = useDraggable({ id });

    // Also use Droppable to allow components to be swapped with other components
    const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id });

    // Combine refs
    const setNodeRef = (node: HTMLElement | null) => {
        setDraggableRef(node);
        setDroppableRef(node);
    };

    const style = {
        transform: CSS.Translate.toString(transform),
        // Significant dimming of source component to emphasize the overlay
        opacity: isDragging ? 0.2 : 1,
        zIndex: isDragging ? 10 : 0,
    };

    const childrenWithProps = React.Children.map(children, child => {
        if (React.isValidElement(child)) {
            // Only inject props into custom components, not plain DOM elements like 'div'
            if (typeof child.type === 'string') return child;

            return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
                onRemove: onRemove ? () => onRemove(id) : undefined,
                dragHandleProps: listeners,
                onClick: targetView ? () => navigate(targetView) : undefined,
                targetView: targetView
            });
        }
        return child;
    });

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                getSizeClass(size),
                "relative transition-all duration-200",
                isOver && !isDragging && "scale-[1.02] z-10 ring-4 ring-blue-500/30 ring-offset-2 rounded-2xl",
                className
            )}
            {...attributes}
        >
            {childrenWithProps}
        </div>
    );
};
