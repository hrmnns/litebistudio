-- Obsolete tables kpi_data and operations_events removed

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  FiscalYear INTEGER NOT NULL,
  Period TEXT NOT NULL,
  PostingDate TEXT NOT NULL,
  VendorName TEXT,
  VendorId TEXT,
  DocumentId TEXT NOT NULL,
  LineId INTEGER NOT NULL,
  CostCenter TEXT,
  GLAccount TEXT,
  Category TEXT,
  SubCategory TEXT,
  Service TEXT,
  System TEXT,
  RunChangeInnovation TEXT,
  Amount REAL NOT NULL,
  Currency TEXT NOT NULL,
  Quantity REAL,
  Unit TEXT,
  UnitPrice REAL,
  ContractId TEXT,
  POId TEXT,
  IsRecurring TEXT,
  Description TEXT,
  SourceTag TEXT
);
 
CREATE TABLE IF NOT EXISTS systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT,
  status TEXT DEFAULT 'unknown',
  category TEXT,
  is_favorite INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS worklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_table TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  display_label TEXT,
  display_context TEXT,
  added_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'open',
  UNIQUE(source_table, source_id)
);
