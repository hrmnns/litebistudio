import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TablesView } from './TablesView';
import { clearPageState } from '../../lib/state/pageStateStore';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback || key,
        i18n: { language: 'de' }
    })
}));

vi.mock('@uiw/react-codemirror', () => ({
    default: ({ value, onChange, placeholder }: { value: string; onChange?: (v: string) => void; placeholder?: string }) => (
        <textarea
            aria-label="sql-editor"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
        />
    )
}));

vi.mock('../components/ui/PageLayout', () => ({
    PageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('../components/RecordDetailModal', () => ({
    RecordDetailModal: () => null
}));

vi.mock('../components/CreateTableModal', () => ({
    CreateTableModal: () => null
}));

vi.mock('../components/ui/SelectionListDialog', () => ({
    SelectionListDialog: () => null
}));

vi.mock('../../components/ui/DataTable', () => ({
    DataTable: () => <div>mock-data-table</div>
}));

vi.mock('../../lib/context/DashboardContext', () => ({
    useDashboard: () => ({
        isAdminMode: true
    })
}));

vi.mock('../../hooks/useReportExport', () => ({
    useReportExport: () => ({
        isExporting: false,
        exportToPdf: vi.fn(),
        exportPackageToPdf: vi.fn(),
        exportPackageToHtml: vi.fn(),
        exportPackageToPpt: vi.fn(),
        exportToImage: vi.fn()
    })
}));

vi.mock('../../lib/appDialog', () => ({
    appDialog: {
        info: vi.fn(async () => undefined),
        error: vi.fn(async () => undefined),
        warning: vi.fn(async () => undefined),
        confirm: vi.fn(async () => true),
        confirm3: vi.fn(async () => 'secondary'),
        prompt: vi.fn(async () => null),
        prompt2: vi.fn(async () => null)
    }
}));

vi.mock('../../lib/repositories/SystemRepository', () => ({
    SystemRepository: {
        getUserWidgets: vi.fn(async () => []),
        listSqlStatements: vi.fn(async () => []),
        getDataSources: vi.fn(async () => []),
        inspectTable: vi.fn(async () => []),
        executeRaw: vi.fn(async () => []),
        countTableRows: vi.fn(async () => 0),
        getTableSchema: vi.fn(async () => []),
        markSqlStatementUsed: vi.fn(async () => undefined),
        saveSqlStatement: vi.fn(async () => undefined),
        deleteSqlStatement: vi.fn(async () => undefined),
        setSqlStatementFavorite: vi.fn(async () => undefined)
    }
}));

const renderSqlWorkspace = () => render(
    <MemoryRouter>
        <TablesView
            onBack={() => undefined}
            fixedMode="sql"
            titleKey="sidebar.sql_workspace"
            breadcrumbKey="sidebar.sql_workspace"
        />
    </MemoryRouter>
);

describe('SQL Workspace controls smoke', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        clearPageState('tables_view');
        clearPageState('sql_workspace_view');
    });

    it('disables run button when editor has no executable SQL', async () => {
        renderSqlWorkspace();
        const editor = await screen.findByLabelText('sql-editor');
        fireEvent.change(editor, { target: { value: '-- comment only' } });

        const runButton = await screen.findByTitle('Not available');
        expect(runButton).toBeDisabled();
    });

    it('enables run button when executable SQL is present', async () => {
        renderSqlWorkspace();
        const editor = await screen.findByLabelText('sql-editor');
        fireEvent.change(editor, { target: { value: 'SELECT 1;' } });

        await waitFor(() => {
            const runButton = screen.getByTitle('Ausführen');
            expect(runButton).toBeEnabled();
        });
    });

    it('restores editor SQL after remount via global page state', async () => {
        const rendered = renderSqlWorkspace();
        const editor = await screen.findByLabelText('sql-editor');
        fireEvent.change(editor, { target: { value: 'SELECT 42;' } });

        rendered.unmount();
        renderSqlWorkspace();

        const restoredEditor = await screen.findByLabelText('sql-editor');
        expect((restoredEditor as HTMLTextAreaElement).value).toContain('SELECT 42;');
    });
});

