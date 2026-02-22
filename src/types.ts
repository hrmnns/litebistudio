// ─── Component Types ───────────────────────────────────────────

export type ComponentSize = 'small' | 'medium' | 'large';

export interface ComponentConfig {
    id: string;
    title: string;
    component: string;
    targetView?: string;
    defaultSize: ComponentSize;
}

// ─── Data Record (Generalized) ───────────────────────────────────

export interface DataRecord {
    id: number;
    /** Index signature for dynamic key field access */
    [key: string]: string | number | boolean | null | undefined;
}

// ─── Anomaly (extends DataRecord with scoring) ───────────────

export interface Anomaly extends DataRecord {
    RiskScore: number;
    AnomalyType: 'Cost Drift' | 'New Item' | 'Data Quality' | 'Review';
}

// ─── Systems ──────────────────────────────────────────────────

export type SystemStatus = 'online' | 'offline' | 'unknown';

export interface SystemRecord {
    id: number;
    name: string;
    url: string | null;
    status: SystemStatus;
    category: string | null;
    is_favorite: number; // SQLite boolean
    sort_order: number;
}

// ─── Worklist ─────────────────────────────────────────────────

export type WorklistStatus = 'open' | 'in_progress' | 'done' | 'closed';

export interface WorklistEntry {
    id: number;
    source_table: string;
    source_id: number;
    display_label: string | null;
    display_context: string | null;
    added_at: string;
    status: WorklistStatus;
}

// ─── KPI ──────────────────────────────────────────────────────

export interface KpiRecord {
    metric: string;
    value: number;
    unit: string;
    category: string;
    date: string;
    period: string;
}

export interface DataSummary {
    total_count: number;
    latest_date: string;
    unit?: string;
}

// ─── Settings ─────────────────────────────────────────────────

export interface SettingRecord {
    key: string;
    value: string | null;
}

// ─── Utility ──────────────────────────────────────────────────


export interface TableColumn {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
}

// ─── Reporting & Dashboards ──────────────────────────────────────

export interface AlertRule {
    operator: '>' | '<' | '>=' | '<=' | '==';
    value: number;
    color: string;
}

export interface WidgetConfig {
    type: 'table' | 'bar' | 'line' | 'area' | 'pie' | 'kpi' | 'composed' | 'radar' | 'scatter' | 'pivot';
    xAxis?: string;
    yAxes?: string[];
    yAxis?: string;
    color?: string;
    showLabels?: boolean;
    barSeries?: string[];
    lineSeries?: string[];
    rules?: AlertRule[];
    pivotRows?: string[];
    pivotCols?: string[];
    pivotMeasures?: { field: string, agg: 'sum' | 'count' | 'avg' | 'min' | 'max' }[];
}

// ─── Report Packages ────────────────────────────────────────────────

export interface ReportPackItem {
    type: 'dashboard' | 'widget';
    id: string;
}

export interface ReportPackConfig {
    coverTitle: string;
    coverSubtitle?: string;
    author?: string;
    showTOC: boolean;
    items: ReportPackItem[];
}

export interface ReportPack {
    id: string;
    name: string;
    description: string;
    config: ReportPackConfig;
    created_at?: string;
    updated_at?: string;
}

/** Generic database row — use sparingly, prefer specific types */
export type DbRow = Record<string, unknown>;
