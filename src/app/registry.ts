
import type React from 'react';
import { ClockComponent } from './components/dashboard/ClockComponent';
import { DataInspectorComponent } from './components/dashboard/DataInspectorComponent';
import { SystemStatusComponent } from './components/dashboard/SystemStatusComponent';
import { DatabaseStatusComponent } from './components/dashboard/DatabaseStatusComponent';
import { WorklistComponent } from './components/dashboard/WorklistComponent';
import { Clock, Activity, HardDrive, Search, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type DashboardComponentProps = Record<string, unknown>;

export const COMPONENT_REGISTRY: Record<string, React.FC<DashboardComponentProps>> = {
    'ClockComponent': ClockComponent,
    'DataInspectorComponent': DataInspectorComponent,
    'SystemStatusComponent': SystemStatusComponent,
    'DatabaseStatusComponent': DatabaseStatusComponent,
    'WorklistComponent': WorklistComponent
};

export interface SystemWidgetMetadata {
    id: string;
    titleKey: string;
    descriptionKey: string;
    icon: LucideIcon;
    defaultColSpan?: number;
}

export const SYSTEM_WIDGETS: SystemWidgetMetadata[] = [
    { id: 'SystemStatusComponent', titleKey: 'widgets.system_status.title', descriptionKey: 'widgets.system_status.description', icon: Activity, defaultColSpan: 1 },
    { id: 'DataInspectorComponent', titleKey: 'widgets.data_inspector.title', descriptionKey: 'widgets.data_inspector.description', icon: Search, defaultColSpan: 1 },
    { id: 'DatabaseStatusComponent', titleKey: 'widgets.database_status.title', descriptionKey: 'widgets.database_status.description', icon: HardDrive, defaultColSpan: 1 },
    { id: 'ClockComponent', titleKey: 'widgets.clock.title', descriptionKey: 'widgets.clock.description', icon: Clock, defaultColSpan: 1 },
    { id: 'WorklistComponent', titleKey: 'widgets.worklist.title', descriptionKey: 'widgets.worklist.description', icon: ClipboardList, defaultColSpan: 1 },
];

export const getComponent = (name: string) => {
    return COMPONENT_REGISTRY[name] || null;
};
