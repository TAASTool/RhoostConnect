import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 10_000;

// Parses an uploaded .csv or .xlsx file (first sheet) into { columns, rows }.
export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Bestand te groot (max 5 MB)' }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';

  try {
    const { columns, rows } = isCsv ? parseCsv(buf.toString('utf-8')) : await parseXlsx(buf);
    return NextResponse.json({ columns, rows: rows.slice(0, MAX_ROWS) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Parsing mislukt' }, { status: 422 });
  }
}

function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const delim = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const split = (line: string) => line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
  const columns = split(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    columns.forEach((col, i) => { row[col] = cells[i] ?? ''; });
    return row;
  });
  return { columns, rows };
}

async function parseXlsx(buf: Buffer): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { columns: [], rows: [] };

  const cellText = (v: ExcelJS.CellValue): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      const o = v as unknown as Record<string, unknown>;
      if ('text' in o) return String(o.text);
      if ('result' in o) return String(o.result);
      if ('richText' in o && Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map((r) => r.text).join('');
      if (v instanceof Date) return v.toISOString();
      return String(v);
    }
    return String(v);
  };

  const columns: string[] = [];
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => { columns[col - 1] = cellText(cell.value) || `col${col}`; });

  const rows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => { obj[col] = cellText(row.getCell(i + 1).value); });
    rows.push(obj);
  });

  return { columns, rows };
}
