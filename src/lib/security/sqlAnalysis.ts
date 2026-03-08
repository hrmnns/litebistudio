export type SqlStatementKind =
    | 'read'
    | 'write'
    | 'unknown';

export interface SqlStatementAnalysis {
    raw: string;
    tokens: string[];
    kind: SqlStatementKind;
    primaryCommand: string;
    isSelectLike: boolean;
    hasLimit: boolean;
    touchesSystemTables: boolean;
}

const WRITE_COMMANDS = new Set([
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'CREATE',
    'ALTER',
    'REPLACE',
    'TRUNCATE',
    'VACUUM',
    'ATTACH',
    'DETACH',
    'REINDEX',
    'ANALYZE'
]);

const READ_COMMANDS = new Set([
    'SELECT',
    'PRAGMA',
    'EXPLAIN'
]);

function isWordChar(ch: string): boolean {
    return /[A-Za-z0-9_]/.test(ch);
}

function tokenizeSql(sql: string): string[] {
    const tokens: string[] = [];
    const length = sql.length;
    let i = 0;

    while (i < length) {
        const ch = sql[i];
        const next = i + 1 < length ? sql[i + 1] : '';

        if (ch === '-' && next === '-') {
            i += 2;
            while (i < length && sql[i] !== '\n') i += 1;
            continue;
        }

        if (ch === '/' && next === '*') {
            i += 2;
            while (i + 1 < length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
            i = Math.min(i + 2, length);
            continue;
        }

        if (ch === '\'' || ch === '"' || ch === '`') {
            const quote = ch;
            i += 1;
            while (i < length) {
                if (sql[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (sql[i] === quote) {
                    if (quote === '\'' && i + 1 < length && sql[i + 1] === '\'') {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        if (isWordChar(ch)) {
            let j = i + 1;
            while (j < length && isWordChar(sql[j])) j += 1;
            tokens.push(sql.slice(i, j).toUpperCase());
            i = j;
            continue;
        }

        i += 1;
    }

    return tokens;
}

export function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    const length = sql.length;
    let start = 0;
    let i = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    while (i < length) {
        const ch = sql[i];
        const next = i + 1 < length ? sql[i + 1] : '';

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            i += 1;
            continue;
        }

        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
            if (ch === '-' && next === '-') {
                inLineComment = true;
                i += 2;
                continue;
            }
            if (ch === '/' && next === '*') {
                inBlockComment = true;
                i += 2;
                continue;
            }
        }

        if (!inDoubleQuote && !inBacktick && ch === '\'') {
            if (inSingleQuote && next === '\'') {
                i += 2;
                continue;
            }
            inSingleQuote = !inSingleQuote;
            i += 1;
            continue;
        }

        if (!inSingleQuote && !inBacktick && ch === '"') {
            inDoubleQuote = !inDoubleQuote;
            i += 1;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && ch === '`') {
            inBacktick = !inBacktick;
            i += 1;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && !inBacktick && ch === ';') {
            const statement = sql.slice(start, i).trim();
            if (statement.length > 0) statements.push(statement);
            start = i + 1;
            i += 1;
            continue;
        }

        i += 1;
    }

    const tail = sql.slice(start).trim();
    if (tail.length > 0) statements.push(tail);
    return statements;
}

function classifyTokens(tokens: string[]): { kind: SqlStatementKind; primaryCommand: string; isSelectLike: boolean; hasLimit: boolean } {
    if (tokens.length === 0) {
        return { kind: 'unknown', primaryCommand: 'UNKNOWN', isSelectLike: false, hasLimit: false };
    }

    const first = tokens[0];
    const hasLimit = tokens.includes('LIMIT');

    if (WRITE_COMMANDS.has(first)) {
        return { kind: 'write', primaryCommand: first, isSelectLike: false, hasLimit };
    }

    if (READ_COMMANDS.has(first)) {
        return { kind: 'read', primaryCommand: first, isSelectLike: first === 'SELECT', hasLimit };
    }

    if (first === 'WITH') {
        const follow = tokens.find((token, idx) => idx > 0 && (token === 'SELECT' || token === 'INSERT' || token === 'UPDATE' || token === 'DELETE' || token === 'REPLACE'));
        if (!follow) {
            return { kind: 'unknown', primaryCommand: 'WITH', isSelectLike: false, hasLimit };
        }
        if (follow === 'SELECT') {
            return { kind: 'read', primaryCommand: 'WITH_SELECT', isSelectLike: true, hasLimit };
        }
        return { kind: 'write', primaryCommand: `WITH_${follow}`, isSelectLike: false, hasLimit };
    }

    return { kind: 'unknown', primaryCommand: first, isSelectLike: false, hasLimit };
}

export function analyzeSqlStatements(sql: string): SqlStatementAnalysis[] {
    const statements = splitSqlStatements(sql);
    return statements.map((raw) => {
        const tokens = tokenizeSql(raw);
        const base = classifyTokens(tokens);
        const touchesSystemTables = tokens.some((token) => token.startsWith('SYS_'));
        return {
            raw,
            tokens,
            ...base,
            touchesSystemTables
        };
    });
}

export function isReadOnlySql(sql: string): boolean {
    const analysis = analyzeSqlStatements(sql);
    if (analysis.length === 0) return true;
    return analysis.every((statement) => statement.kind === 'read');
}

export function hasSystemWriteWithoutAdmin(sql: string, adminModeActive: boolean): boolean {
    if (adminModeActive) return false;
    return analyzeSqlStatements(sql).some((statement) => statement.kind === 'write' && statement.touchesSystemTables);
}

export function getSystemTableWriteBlockedMessage(language: string): string {
    if (language.toLowerCase().startsWith('de')) {
        return 'Schreibzugriffe auf Systemtabellen (sys_*) sind nur im Admin-Modus erlaubt.';
    }
    return 'Write access to system tables (sys_*) is only allowed in admin mode.';
}

