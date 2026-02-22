import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryBuilderView } from './QueryBuilderView';

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
        t: (key: string) => key
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
    useAsync: () => ({
        data: mockWidgets,
        refresh: vi.fn()
    })
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

describe('QueryBuilderView guided flow', () => {
    beforeEach(() => {
        mockRows = [];
        mockWidgets = [];
        vi.clearAllMocks();
    });

    it('keeps visualize step locked until query run returns data in guided mode', async () => {
        mockRows = [{ id: 1, label: 'A' }];
        render(<QueryBuilderView />);

        const visualizeStepBefore = screen.getByRole('button', { name: 'querybuilder.step_visualize' });
        expect(visualizeStepBefore).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.next' }));
        fireEvent.click(screen.getByText('mock-set-source'));
        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.apply' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'querybuilder.step_visualize' })).not.toBeDisabled();
            expect(screen.getByRole('button', { name: 'querybuilder.next' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.next' }));

        await waitFor(() => {
            expect(screen.getByText('querybuilder.graph_type')).toBeInTheDocument();
        });
    });

    it('resets report selection without confirm dialog when switching to new report', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        mockWidgets = [
            {
                id: 'w-1',
                name: 'Saved Widget',
                sql_query: 'SELECT 1',
                visualization_config: JSON.stringify({ type: 'text', color: '#3b82f6' }),
                visual_builder_config: null
            }
        ];

        render(<QueryBuilderView />);

        fireEvent.click(await screen.findByText('Saved Widget'));
        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.step_source_run' }));

        const sqlEditor = await screen.findByRole('textbox');
        fireEvent.change(sqlEditor, { target: { value: 'SELECT 2' } });

        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.step_start' }));
        fireEvent.click(screen.getByRole('button', { name: /querybuilder.new_query_card_title/i }));

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(screen.getByText('querybuilder.mode_new_active')).toBeInTheDocument();
        expect(screen.queryByText('querybuilder.mode_editing_active')).not.toBeInTheDocument();

        confirmSpy.mockRestore();
    });

    it('registers beforeunload protection when unsaved changes exist', async () => {
        mockWidgets = [
            {
                id: 'w-2',
                name: 'Guard Widget',
                sql_query: 'SELECT 1',
                visualization_config: JSON.stringify({ type: 'text', color: '#3b82f6' }),
                visual_builder_config: null
            }
        ];

        render(<QueryBuilderView />);

        fireEvent.click(await screen.findByText('Guard Widget'));
        fireEvent.click(screen.getByRole('button', { name: 'querybuilder.step_source_run' }));

        const sqlEditor = await screen.findByRole('textbox');
        fireEvent.change(sqlEditor, { target: { value: 'SELECT 3' } });

        const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
        Object.defineProperty(event, 'returnValue', {
            configurable: true,
            writable: true,
            value: undefined
        });

        window.dispatchEvent(event);

        expect(event.returnValue).toBe('');
    });
});
