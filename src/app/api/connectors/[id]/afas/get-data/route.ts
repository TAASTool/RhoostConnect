import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { afasBaseUrl, afasHeaders, validateAfasConfig, AfasConfig } from '@/lib/afas';

// Returns a sample of rows from a GetConnector (for the preview step).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const name = req.nextUrl.searchParams.get('connector');
  if (!name || !/^[A-Za-z0-9_]{1,80}$/.test(name)) {
    return NextResponse.json({ error: 'Invalid connector name' }, { status: 400 });
  }
  const take = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('take') ?? '25', 10) || 25, 1), 500);

  const connector = await prisma.connector.findFirst({ where: { id: params.id, tenantId } });
  if (!connector) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (connector.type !== 'afas_adapter') return NextResponse.json({ error: 'Not an AFAS connector' }, { status: 400 });

  const config = JSON.parse(decrypt(connector.configEncryptedJson)) as unknown as AfasConfig;
  const validationError = validateAfasConfig(config);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const url = `${afasBaseUrl(config)}/connectors/${encodeURIComponent(name)}?skip=0&take=${take}`;
    const res = await fetch(url, { headers: afasHeaders(config), signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `AFAS HTTP ${res.status}`, detail }, { status: 502 });
    }
    const data = await res.json();
    const rows: Record<string, unknown>[] = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return NextResponse.json({ connector: name, columns, rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AFAS request failed' }, { status: 502 });
  }
}
