import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToExcel } from './exportUtils';
import * as XLSX from 'xlsx';

// Mock the entire xlsx module
vi.mock('xlsx', () => {
    return {
        utils: {
            json_to_sheet: vi.fn(() => 'mockSheet'),
            book_new: vi.fn(() => 'mockBook'),
            book_append_sheet: vi.fn(),
        },
        writeFile: vi.fn(),
    };
});

describe('exportUtils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should export data to excel with correct parameters', () => {
        const data = [{ id: 1, name: 'Test' }];
        const fileName = 'test_export';
        const sheetName = 'MySheet';

        exportToExcel(data, fileName, sheetName);

        expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith(data);
        expect(XLSX.utils.book_new).toHaveBeenCalled();
        expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith('mockBook', 'mockSheet', 'MySheet');
        expect(XLSX.writeFile).toHaveBeenCalledWith('mockBook', 'test_export.xlsx');
    });

    it('should use default sheet name if not provided', () => {
        const data = [{ id: 1 }];
        exportToExcel(data, 'test');
        expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith('mockBook', 'mockSheet', 'Sheet1');
    });

    it('should not append double extension', () => {
        const data = [{ id: 1 }];
        exportToExcel(data, 'test.xlsx');
        expect(XLSX.writeFile).toHaveBeenCalledWith('mockBook', 'test.xlsx');
    });
});
