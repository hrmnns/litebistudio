-- Core Infrastructure Tables
CREATE TABLE IF NOT EXISTS sys_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS sys_user_widgets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sql_statement_id TEXT,
    sql_query TEXT NOT NULL,
    visualization_config TEXT, -- JSON
    visual_builder_config TEXT, -- JSON string of QueryConfig (for reload)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sys_user_widgets_sql_statement ON sys_user_widgets(sql_statement_id);

CREATE TABLE IF NOT EXISTS sys_worklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    display_label TEXT,
    display_context TEXT,
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'normal',
    due_at TIMESTAMP,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_dashboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    layout TEXT, -- JSON string of SavedWidget[]
    is_default INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_report_packs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    config TEXT, -- JSON string of ReportPackConfig
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_sql_statement (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sql_text TEXT NOT NULL,
    description TEXT DEFAULT '',
    scope TEXT NOT NULL DEFAULT 'global',
    tags TEXT DEFAULT '',
    is_favorite INTEGER NOT NULL DEFAULT 0,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, scope)
);

CREATE INDEX IF NOT EXISTS idx_sys_sql_scope_name ON sys_sql_statement(scope, name);
CREATE INDEX IF NOT EXISTS idx_sys_sql_last_used ON sys_sql_statement(last_used_at DESC);

CREATE TABLE IF NOT EXISTS sys_health_snapshot (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'database',
    status TEXT NOT NULL,
    score INTEGER NOT NULL,
    checks_run INTEGER NOT NULL DEFAULT 0,
    findings_json TEXT NOT NULL, -- JSON array of findings
    metadata_json TEXT, -- Optional JSON metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sys_health_snapshot_created_at ON sys_health_snapshot(created_at DESC);
