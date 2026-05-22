import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { afasBaseUrl, afasHeaders, validateAfasConfig, flattenUpdateFields, AfasConfig } from '@/lib/afas';

// Returns the flattened field list (with required flags) for one UpdateConnector.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const name = req.nextUrl.searchParams.get('connector');
  if (!name || !/^[A-Za-z0-9_]{1,80}$/.test(name)) {
    return NextResponse.json({ error: 'Invalid connector name' }, { status: 400 });
  }

  const connector = await prisma.connector.findFirst({ where: { id: params.id, tenantId } });
  if (!connector) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (connector.type !== 'afas_adapter') return NextResponse.json({ error: 'Not an AFAS connector' }, { status: 400 });

  const config = JSON.parse(decrypt(connector.configEncryptedJson)) as unknown as AfasConfig;
  const validationError = validateAfasConfig(config);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const res = await fetch(`${afasBaseUrl(config)}/metainfo/update/${encodeURIComponent(name)}`, {
      headers: afasHeaders(config),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `AFAS HTTP ${res.status}`, detail }, { status: 502 });
    }
    const meta = await res.json();
    return NextResponse.json({ connector: name, fields: flattenUpdateFields(meta) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AFAS request failed' }, { status: 502 });
  }
}
