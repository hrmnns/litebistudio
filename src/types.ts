// ─── Tile Types ───────────────────────────────────────────────

export type TileSize = 'small' | 'medium' | 'large';

export interface TileConfig {
    id: string;
    title: string;
    component: string;
    targetView?: string;
    defaultSize: TileSize;
}

// ─── Invoice Items ────────────────────────────────────────────

export interface InvoiceItem {
    id: number;
    FiscalYear: number;
    Period: string;
    PostingDate: string;
    VendorName: string | null;
    VendorId: string | null;
    DocumentId: string;
    LineId: number;
    CostCenter: string | null;
    GLAccount: string | null;
    Category: string | null;
    SubCategory: string | null;
    Service: string | null;
    System: string | null;
    RunChangeInnovation: string | null;
    Amount: number;
    Currency: string;
    Quantity: number | null;
    Unit: string | null;
    UnitPrice: number | null;
    ContractId: string | null;
    POId: string | null;
    IsRecurring: string | null;
    Description: string | null;
    SourceTag: string | null;
    /** Index signature for dynamic key field access */
    [key: string]: string | number | boolean | null | undefined;
}

// ─── Anomaly (extends InvoiceItem with scoring) ───────────────

export interface Anomaly extends InvoiceItem {
    PrevAmount: number | null;
    PrevPeriod: string | null;
    ScoreDrift: number;
    ScoreNew: number;
    ScoreQuality: number;
    ScoreValue: number;
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

export type WorklistStatus = 'open' | 'ok' | 'error' | 'clarification';

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

export interface ItCostsTrend {
    Period: string;
    total: number;
    year: number;
    date: string;
    invoice_count: number;
    item_count: number;
    synthetic_invoices: number;
}
export interface ItCostsSummary {
    total_amount: number;
    active_vendors: number;
    latest_date: string;
    latest_year: number;
    unit?: string;
}
export interface InvoiceItemHistory {
    Period: string;
    Amount: number;
    RecordCount: number;
    id: number;
    DocumentId: string;
    LineId: number;
    VendorName: string | null;
    Description: string | null;
    CostCenter: string | null;
    GLAccount: string | null;
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

/** Generic database row — use sparingly, prefer specific types */
export type DbRow = Record<string, unknown>;
