import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetsView } from './WidgetsView';

type MockWidget = {
    id: string;
    name: string;
    sql_query: string;
    visualization_config: string;
    visual_builder_config?: string | null;
};

let mockWidgets: MockWidget[] = [];
let mockRows: Array<Record<string, unknown>> = [];

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' }
    })
}));

vi.mock('../components/ui/PageLayout', () => ({
    PageLayout: ({ header, children }: { header: { actions?: React.ReactNode }; children: React.ReactNode }) => (
        <div>
            <div>{header.actions}</div>
            <div>{children}</div>
        </div>
    )
}));

vi.mock('../../hooks/useLocalStorage', async () => {
    const ReactModule = await import('react');
    return {
        useLocalStorage: <T,>(_key: string, initialValue: T) => ReactModule.useState<T>(initialValue)
    };
});

vi.mock('../../hooks/useAsync', () => ({
    useAsync: (fn: () => unknown) => {
        const source = String(fn);
        if (source.includes('getUserWidgets')) {
            return { data: mockWidgets, refresh: vi.fn() };
        }
        if (source.includes('listSqlStatements')) {
            return { data: [], refresh: vi.fn() };
        }
        if (source.includes('getDashboards')) {
            return { data: [], refresh: vi.fn() };
        }
        return { data: null, refresh: vi.fn() };
    }
}));

vi.mock('../../hooks/useReportExport', () => ({
    useReportExport: () => ({
        isExporting: false,
        exportToPdf: vi.fn()
    })
}));

vi.mock('../../lib/context/DashboardContext', () => ({
    useDashboard: () => ({
        togglePresentationMode: vi.fn(),
        isReadOnly: false,
        isAdminMode: false
    })
}));

vi.mock('../../lib/repositories/SystemRepository', () => ({
    SystemRepository: {
        getUserWidgets: vi.fn(async () => mockWidgets),
        executeRaw: vi.fn(async () => mockRows),
        getTableSchema: vi.fn(async () => []),
        saveUserWidget: vi.fn(async () => undefined),
        deleteUserWidget: vi.fn(async () => undefined)
    }
}));

vi.mock('../components/VisualQueryBuilder', () => ({
    VisualQueryBuilder: ({ onChange }: { onChange: (sql: string, config: { table: string }) => void }) => (
        <button onClick={() => onChange('SELECT * FROM demo', { table: 'demo' })}>mock-set-source</button>
    )
}));

vi.mock('../components/SqlAssistant', () => ({
    SqlAssistant: () => null
}));

vi.mock('../../components/ui/DataTable', () => ({
    DataTable: () => <div>data-table</div>
}));

vi.mock('../components/PivotTable', () => ({
    PivotTable: () => <div>pivot-table</div>
}));

vi.mock('../components/Modal', () => ({
    Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => (isOpen ? <div>{children}</div> : null)
}));

vi.mock('../components/RecordDetailModal', () => ({
    RecordDetailModal: () => null
}));

describe('WidgetsView workspace flow', () => {
    beforeEach(() => {
        mockRows = [];
        mockWidgets = [];
        vi.clearAllMocks();
    });

    it('renders workspace tabs in editor shell', () => {
        render(<WidgetsView />);

        expect(screen.getByRole('button', { name: 'querybuilder.workspace_tab_manage' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'querybuilder.workspace_tab_editor' })).toBeInTheDocument();
    });

    it('shows saved widgets in manage tab', async () => {
        mockWidgets = [
            {
                id: 'w-1',
                name: 'Saved Widget',
                sql_query: 'SELECT 1',
                visualization_config: JSON.stringify({ type: 'text', color: '#3b82f6' }),
                visual_builder_config: null
            }
        ];

        render(<WidgetsView />);

        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.workspace_tab_manage' }));
        expect(await screen.findByText('Saved Widget')).toBeInTheDocument();
    });

    it('can switch between manage and editor with saved widgets present', async () => {
        mockWidgets = [
            {
                id: 'w-2',
                name: 'Guard Widget',
                sql_query: 'SELECT 1',
                visualization_config: JSON.stringify({ type: 'text', color: '#3b82f6' }),
                visual_builder_config: null
            }
        ];

        render(<WidgetsView />);

        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.workspace_tab_manage' }));
        expect(await screen.findByText('Guard Widget')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.workspace_tab_editor' }));
        expect(screen.getByRole('button', { name: 'querybuilder.workspace_tab_editor' })).toBeInTheDocument();
    });
});

