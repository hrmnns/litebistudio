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
    dflt_value: unknown;
    pk: number;
}

// ─── Reporting & Dashboards ──────────────────────────────────────

export interface AlertRule {
    operator: '>' | '<' | '>=' | '<=' | '==';
    value: number;
    color: string;
}

export interface WidgetConfig {
    type: 'table' | 'bar' | 'line' | 'area' | 'pie' | 'kpi' | 'composed' | 'radar' | 'scatter' | 'pivot' | 'text' | 'markdown' | 'status' | 'section' | 'kpi_manual' | 'kpu_manual' | 'image';
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
    textContent?: string;
    markdownContent?: string;
    textSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    textAlign?: 'left' | 'center' | 'right';
    textBold?: boolean;
    textItalic?: boolean;
    textUnderline?: boolean;
    statusLevel?: 'ok' | 'warning' | 'critical' | 'info';
    statusTitle?: string;
    statusMessage?: string;
    statusPulse?: boolean;
    sectionTitle?: string;
    sectionSubtitle?: string;
    sectionAlign?: 'left' | 'center' | 'right';
    sectionDividerStyle?: 'line' | 'double' | 'none';
    kpiTitle?: string;
    kpiValue?: string;
    kpiUnit?: string;
    kpiTarget?: string;
    kpiTrend?: 'up' | 'down' | 'flat';
    kpiAlign?: 'left' | 'center' | 'right';
    kpiNote?: string;
    imageUrl?: string;
    imageAlt?: string;
    imageCaption?: string;
    imageFit?: 'contain' | 'cover';
    imageAlign?: 'left' | 'center' | 'right';
    // Legacy compatibility for previously saved widgets
    kpuTitle?: string;
    kpuValue?: string;
    kpuUnit?: string;
    kpuTarget?: string;
    kpuTrend?: 'up' | 'down' | 'flat';
    kpuAlign?: 'left' | 'center' | 'right';
    kpuNote?: string;
}

// ─── Report Packages ────────────────────────────────────────────────

export interface ReportPackItem {
    type: 'dashboard' | 'widget';
    id: string;
    titleOverride?: string;
    orientation?: 'portrait' | 'landscape';
    pageTemplate?: 'summary' | 'kpi' | 'detail';
    pageComment?: string;
    pageStatus?: 'ok' | 'warning' | 'critical' | 'info';
    statusThreshold?: string;
}

export interface ReportPackConfig {
    coverTitle: string;
    coverSubtitle?: string;
    author?: string;
    coverLogoUrl?: string;
    themeColor?: string;
    showTOC: boolean;
    exportOptions?: {
        showHeader?: boolean;
        showFooter?: boolean;
        headerText?: string;
        footerText?: string;
        footerMode?: 'all' | 'content_only';
        dataAsOf?: string;
        includeAuditAppendix?: boolean;
    };
    items: ReportPackItem[];
}

export interface ReportPack {
    id: string;
    name: string;
    description: string;
    category?: string;
    config: ReportPackConfig;
    created_at?: string;
    updated_at?: string;
}

/** Generic database row — use sparingly, prefer specific types */
export type DbRow = Record<string, unknown>;

