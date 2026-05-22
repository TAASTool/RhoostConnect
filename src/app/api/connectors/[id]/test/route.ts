import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';

const AFAS_BASE: Record<string, string> = {
  productie: 'afas.online',
  test: 'afas-test.online',
  acceptatie: 'afas-acc.online',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connector = await prisma.connector.findFirst({
    where: { id: params.id, tenantId },
    include: { endpoints: { take: 1 } },
  });
  if (!connector) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const config = JSON.parse(decrypt(connector.configEncryptedJson));

  if (connector.type === 'afas_adapter') {
    return testAfasConnector(config);
  }

  const baseUrl = config.baseUrl;
  if (!baseUrl) return NextResponse.json({ success: false, message: 'No base URL configured' });

  try {
    const headers: Record<string, string> = {};
    if (config.auth?.type === 'bearer') headers['Authorization'] = `Bearer ${config.auth.token}`;
    if (config.auth?.type === 'basic') {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64')}`;
    }
    const testUrl = connector.endpoints[0] ? `${baseUrl}${connector.endpoints[0].path}` : baseUrl;
    const res = await fetch(testUrl, { method: 'GET', headers, signal: AbortSignal.timeout(10_000) });
    return NextResponse.json({ success: res.ok, status: res.status, message: res.ok ? 'Connection successful' : `HTTP ${res.status}` });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Connection failed' });
  }
}

async function testAfasConnector(config: Record<string, string>) {
  const { deelnemersnummer, omgeving, afasToken } = config;

  if (!deelnemersnummer || !omgeving || !afasToken) {
    return NextResponse.json({ success: false, message: 'Incomplete AFAS configuration' });
  }

  const domain = AFAS_BASE[omgeving];
  if (!domain) return NextResponse.json({ success: false, message: `Unknown environment: ${omgeving}` });

  const baseUrl = `https://${deelnemersnummer}.${domain}/ProfitRestServices`;
  const tokenB64 = Buffer.from(afasToken).toString('base64');

  try {
    const res = await fetch(`${baseUrl}/connectors`, {
      method: 'GET',
      headers: {
        'Authorization': `AfasToken ${tokenB64}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ success: false, message: `AFAS API returned HTTP ${res.status}`, detail: text });
    }

    const data = await res.json();
    const connectors: Array<{ id: string; description: string; type: string }> = Array.isArray(data)
      ? data.map((c: any) => ({ id: c.Id ?? c.id, description: c.Description ?? c.description ?? '', type: c.Type ?? c.type ?? '' }))
      : [];

    return NextResponse.json({
      success: true,
      message: `Verbinding geslaagd — ${connectors.length} connector(s) gevonden`,
      connectors,
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Verbinding mislukt' });
  }
}
