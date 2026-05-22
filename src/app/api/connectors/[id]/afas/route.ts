import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { afasBaseUrl, afasHeaders, validateAfasConfig, toConnectorEntries, AfasConfig } from '@/lib/afas';

// Returns the list of Get/Update/Custom connectors authorised for this AFAS token.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connector = await prisma.connector.findFirst({ where: { id: params.id, tenantId } });
  if (!connector) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (connector.type !== 'afas_adapter') return NextResponse.json({ error: 'Not an AFAS connector' }, { status: 400 });

  const config = JSON.parse(decrypt(connector.configEncryptedJson)) as unknown as AfasConfig;
  const validationError = validateAfasConfig(config);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const res = await fetch(`${afasBaseUrl(config)}/MetaInfo`, {
      headers: afasHeaders(config),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `AFAS HTTP ${res.status}`, detail }, { status: 502 });
    }
    const meta = await res.json();
    return NextResponse.json({
      getConnectors:    toConnectorEntries(meta.getConnectors),
      updateConnectors: toConnectorEntries(meta.updateConnectors),
      customConnectors: toConnectorEntries(meta.customConnectors),
      info: meta.info ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AFAS request failed' }, { status: 502 });
  }
}
