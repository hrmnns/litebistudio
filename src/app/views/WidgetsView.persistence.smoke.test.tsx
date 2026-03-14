import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { WidgetsView } from './WidgetsView';
import { clearPageState } from '../../lib/state/pageStateStore';

type MockWidget = {
    id: string;
    name: string;
    description?: string | null;
    sql_statement_id?: string | null;
    sql_query: string;
    visualization_config: string;
    visual_builder_config?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
};

type MockSqlStatement = {
    id: string;
    name: string;
    description?: string | null;
    sql_text: string;
    scope?: string;
    is_favorite?: number;
    created_at?: string | null;
    updated_at?: string | null;
};

let mockWidgets: MockWidget[] = [];
let mockSqlStatements: MockSqlStatement[] = [];
let mockRows: Array<Record<string, unknown>> = [];

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback || key,
        i18n: { language: 'de' }
    })
}));

vi.mock('../../hooks/useAsync', () => ({
    useAsync: (loader: unknown) => {
        const src = String(loader);
        if (src.includes('getUserWidgets')) {
            return { data: mockWidgets, refresh: vi.fn() };
        }
        if (src.includes('listSqlStatements')) {
            return { data: mockSqlStatements, refresh: vi.fn() };
        }
        if (src.includes('getDashboards')) {
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
        listSqlStatements: vi.fn(async () => mockSqlStatements),
        getDashboards: vi.fn(async () => []),
        executeRaw: vi.fn(async () => mockRows),
        abortActiveQueries: vi.fn(async () => undefined),
        saveUserWidget: vi.fn(async () => undefined),
        getStorageStatus: vi.fn(async () => ({ mode: 'persistent' }))
    }
}));

vi.mock('../components/ui/SelectionListDialog', () => ({
    SelectionListDialog: () => null
}));

vi.mock('../components/ui/RightOverlayPanel', () => ({
    RightOverlayPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('../../components/ui/DataTable', () => ({
    DataTable: () => <div>mock-table</div>
}));

vi.mock('../components/PivotTable', () => ({
    PivotTable: () => <div>mock-pivot</div>
}));

vi.mock('../components/RecordDetailModal', () => ({
    RecordDetailModal: () => null
}));

vi.mock('../../lib/appDialog', () => ({
    appDialog: {
        info: vi.fn(async () => undefined),
        error: vi.fn(async () => undefined),
        confirm: vi.fn(async () => true),
        confirm3: vi.fn(async () => 'secondary'),
        prompt2: vi.fn(async () => null)
    }
}));

describe('WidgetsView persistence smoke', () => {
    beforeEach(() => {
        cleanup();
        window.localStorage.clear();
        clearPageState('widgets_view');
        mockRows = [
            { month: '2026-01', value: 10 },
            { month: '2026-02', value: 12 }
        ];
        mockSqlStatements = [
            {
                id: 'stmt-1',
                name: 'Smoke Statement',
                sql_text: 'SELECT month, value FROM demo',
                description: 'desc',
                scope: 'global',
                is_favorite: 0
            }
        ];
        mockWidgets = [
            {
                id: 'widget-1',
                name: 'Smoke Widget',
                sql_statement_id: 'stmt-1',
                sql_query: 'SELECT month, value FROM demo',
                visualization_config: JSON.stringify({ type: 'table', color: '#3b82f6' })
            }
        ];
    });

    it('keeps active preview tab across remount', async () => {
        const rendered = render(<WidgetsView />);

        const tableTab = await screen.findByRole('button', { name: 'Tabelle' });
        fireEvent.click(tableTab);

        await waitFor(() => {
            expect(
                tableTab.className.includes('bg-blue-50')
                || tableTab.className.includes('bg-[rgb(var(--ui-primary))/0.12]')
            ).toBe(true);
        });

        rendered.unmount();
        render(<WidgetsView />);

        const restoredTableTab = await screen.findByRole('button', { name: 'Tabelle' });
        await waitFor(() => {
            expect(
                restoredTableTab.className.includes('bg-blue-50')
                || restoredTableTab.className.includes('bg-[rgb(var(--ui-primary))/0.12]')
            ).toBe(true);
        });
    }, 15000);

    it('starts clean when no prior page state exists', async () => {
        render(<WidgetsView />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Widget\s*-\s*Unbenannt/ })).toBeInTheDocument();
        });

        expect(screen.queryByRole('heading', { name: /Widget\s*-\s*Unbenannt\s*\*/ })).not.toBeInTheDocument();
    });

    it('keeps default clean state across remount if user made no changes', async () => {
        render(<WidgetsView />);
        cleanup();
        render(<WidgetsView />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Widget\s*-\s*Unbenannt/ })).toBeInTheDocument();
        });
        expect(screen.queryByRole('heading', { name: /Widget\s*-\s*Unbenannt\s*\*/ })).not.toBeInTheDocument();
    });

});
