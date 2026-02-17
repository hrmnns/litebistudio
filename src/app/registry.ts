import type React from 'react';
import { ItCostsComponent } from './components/dashboard/ItCostsComponent';
import { SystemsComponent } from './components/dashboard/SystemsComponent';
import { ItForecastComponent } from './components/dashboard/ItForecastComponent';
import { ClockComponent } from './components/dashboard/ClockComponent';
import { DataInspectorComponent } from './components/dashboard/DataInspectorComponent';
import { AnomalyRadarComponent } from './components/dashboard/AnomalyRadarComponent';
import { SystemStatusComponent } from './components/dashboard/SystemStatusComponent';
import { WorklistComponent } from './components/dashboard/WorklistComponent';
import { DatabaseStatusComponent } from './components/dashboard/DatabaseStatusComponent';

export const COMPONENT_REGISTRY: Record<string, React.FC<any>> = {
    'ItCostsComponent': ItCostsComponent,
    'SystemsComponent': SystemsComponent,
    'ItForecastComponent': ItForecastComponent,
    'ClockComponent': ClockComponent,
    'DataInspectorComponent': DataInspectorComponent,
    'AnomalyRadarComponent': AnomalyRadarComponent,
    'SystemStatusComponent': SystemStatusComponent,
    'WorklistComponent': WorklistComponent,
    'DatabaseStatusComponent': DatabaseStatusComponent
};

export const getComponent = (name: string) => {
    return COMPONENT_REGISTRY[name] || null;
};
