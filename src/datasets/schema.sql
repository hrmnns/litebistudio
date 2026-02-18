-- Core Infrastructure Tables
CREATE TABLE IF NOT EXISTS sys_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS sys_user_widgets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sql_query TEXT NOT NULL,
    visualization_config TEXT, -- JSON
    visual_builder_config TEXT, -- JSON string of QueryConfig (for reload)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_worklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    display_label TEXT,
    display_context TEXT,
    status TEXT DEFAULT 'pending',
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
