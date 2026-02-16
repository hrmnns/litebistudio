import * as XLSX from 'xlsx';

/**
 * Exports an array of objects to an Excel file.
 * @param data - The data to export (array of objects).
 * @param fileName - The name of the output file (without extension).
 * @param sheetName - The name of the worksheet (default: "Sheet1").
 */
export const exportToExcel = (data: any[], fileName: string, sheetName: string = "Sheet1") => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const fullFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    XLSX.writeFile(wb, fullFileName);
};
