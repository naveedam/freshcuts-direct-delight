import ExcelJS from 'exceljs';

/**
 * Utility functions wrapping ExcelJS to replace the vulnerable xlsx (SheetJS) package.
 */

/** Read an Excel/CSV file buffer and return rows as JSON objects */
export async function readExcelFile(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount === 0) {
    return { headers: [], rows: [] };
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '');
  });

  const rows: Record<string, unknown>[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const val = row.getCell(idx + 1).value;
      obj[header] = val ?? '';
      if (val !== null && val !== undefined && val !== '') hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }

  return { headers, rows };
}

/** Create and download an Excel file from JSON data with multiple sheets */
export async function writeExcelFile(
  fileName: string,
  sheets: { name: string; data: Record<string, unknown>[] }[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    if (sheet.data.length === 0) continue;

    const columns = Object.keys(sheet.data[0]);
    ws.columns = columns.map(key => ({ header: key, key, width: Math.max(key.length + 2, 12) }));

    for (const row of sheet.data) {
      ws.addRow(row);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
