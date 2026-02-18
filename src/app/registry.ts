
import type React from 'react';
import { ClockComponent } from './components/dashboard/ClockComponent';
import { DataInspectorComponent } from './components/dashboard/DataInspectorComponent';
import { SystemStatusComponent } from './components/dashboard/SystemStatusComponent';
import { DatabaseStatusComponent } from './components/dashboard/DatabaseStatusComponent';
import { WorklistComponent } from './components/dashboard/WorklistComponent';
import { Clock, Activity, HardDrive, Search, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const COMPONENT_REGISTRY: Record<string, React.FC<any>> = {
    'ClockComponent': ClockComponent,
    'DataInspectorComponent': DataInspectorComponent,
    'SystemStatusComponent': SystemStatusComponent,
    'DatabaseStatusComponent': DatabaseStatusComponent,
    'WorklistComponent': WorklistComponent
};

export interface SystemWidgetMetadata {
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    defaultColSpan?: number;
}

export const SYSTEM_WIDGETS: SystemWidgetMetadata[] = [
    { id: 'SystemStatusComponent', title: 'System-Status', description: 'Gesundheitsstatus der Plattform', icon: Activity, defaultColSpan: 1 },
    { id: 'DataInspectorComponent', title: 'Data Inspector', description: 'Direkter Zugriff auf Tabellendaten', icon: Search, defaultColSpan: 1 },
    { id: 'DatabaseStatusComponent', title: 'Datenbank-Info', description: 'Speichernutzung und Statistiken', icon: HardDrive, defaultColSpan: 1 },
    { id: 'ClockComponent', title: 'Uhrzeit', description: 'Einfache Uhr', icon: Clock, defaultColSpan: 1 },
    { id: 'WorklistComponent', title: 'Arbeitsvorrat', description: 'Statistik gemerkter Datensätze', icon: ClipboardList, defaultColSpan: 1 },
];

export const getComponent = (name: string) => {
    return COMPONENT_REGISTRY[name] || null;
};
