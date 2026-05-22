import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { afasBaseUrl, afasHeaders, validateAfasConfig, toConnectorEntries, AfasConfig } from '@/lib/afas';

interface AfasMetaInfo {
  getConnectors?:    unknown;
  updateConnectors?: unknown;
  customConnectors?: unknown;
  info?: { appName?: string; envid?: string; tokenExpiry?: string; group?: string };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connector = await prisma.connector.findFirst({
    where: { id: params.id, tenantId },
    include: { endpoints: { take: 1 } },
  });
  if (!connector) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const config = JSON.parse(decrypt(connector.configEncryptedJson)) as Record<string, unknown>;

  if (connector.type === 'afas_adapter') {
    return testAfasConnector(config as unknown as AfasConfig);
  }

  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : '';
  if (!baseUrl) return NextResponse.json({ success: false, message: 'No base URL configured' });

  const auth = config.auth as Record<string, string> | undefined;
  try {
    const headers: Record<string, string> = {};
    if (auth?.type === 'bearer') headers['Authorization'] = `Bearer ${auth.token}`;
    if (auth?.type === 'basic') {
      headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
    }
    const testUrl = connector.endpoints[0] ? `${baseUrl}${connector.endpoints[0].path}` : baseUrl;
    const res = await fetch(testUrl, { method: 'GET', headers, signal: AbortSignal.timeout(10_000) });
    return NextResponse.json({ success: res.ok, status: res.status, message: res.ok ? 'Connection successful' : `HTTP ${res.status}` });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Connection failed' });
  }
}

async function testAfasConnector(config: AfasConfig) {
  const validationError = validateAfasConfig(config);
  if (validationError) return NextResponse.json({ success: false, message: validationError });

  try {
    const res = await fetch(`${afasBaseUrl(config)}/MetaInfo`, {
      method: 'GET',
      headers: afasHeaders(config),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ success: false, message: `AFAS gaf HTTP ${res.status} terug`, detail });
    }

    const meta: AfasMetaInfo = await res.json();
    const getConnectors    = toConnectorEntries(meta.getConnectors);
    const updateConnectors = toConnectorEntries(meta.updateConnectors);
    const customConnectors = toConnectorEntries(meta.customConnectors);

    return NextResponse.json({
      success: true,
      message: `Verbinding geslaagd — ${getConnectors.length} Get, ${updateConnectors.length} Update, ${customConnectors.length} Custom connector(s)`,
      getConnectors,
      updateConnectors,
      customConnectors,
      info: meta.info ?? null,
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Verbinding mislukt' });
  }
}
