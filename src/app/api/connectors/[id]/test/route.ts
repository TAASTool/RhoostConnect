import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';

// Correct AFAS REST base URLs per environment
// Source: https://help.afas.nl/help/NL/SE/App_Conect_WebSrv_Addrss.htm
const AFAS_HOST: Record<string, string> = {
  productie:  'rest.afas.online',
  test:       'resttest.afas.online',
  acceptatie: 'restaccept.afas.online',
};

const AFAS_TOKEN_RE = /^<token><version>\d+<\/version><data>[A-Fa-f0-9]+<\/data><\/token>$/;

function afasBaseUrl(deelnemersnummer: string, omgeving: string): string {
  return `https://${deelnemersnummer}.${AFAS_HOST[omgeving]}/ProfitRestServices`;
}

function afasAuthHeader(token: string): string {
  return `AfasToken ${Buffer.from(token).toString('base64')}`;
}

type AfasConnectorEntry = { id: string; description: string };

function normaliseList(data: unknown): AfasConnectorEntry[] {
  if (!Array.isArray(data)) return [];
  return data.map((c: Record<string, unknown>) => ({
    id:          String(c.id          ?? c.Id          ?? ''),
    description: String(c.description ?? c.Description ?? ''),
  }));
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
    return testAfasConnector(config as Record<string, string>);
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

async function testAfasConnector(config: Record<string, string>) {
  const { deelnemersnummer, omgeving, afasToken } = config;

  if (!deelnemersnummer || !omgeving || !afasToken) {
    return NextResponse.json({ success: false, message: 'Onvolledige AFAS configuratie' });
  }
  if (!/^\d{5}$/.test(deelnemersnummer)) {
    return NextResponse.json({ success: false, message: 'Ongeldig deelnemersnummer' });
  }
  if (!AFAS_TOKEN_RE.test(afasToken.trim())) {
    return NextResponse.json({ success: false, message: 'Ongeldig token formaat — verwacht: <token><version>1</version><data>...</data></token>' });
  }
  if (!AFAS_HOST[omgeving]) {
    return NextResponse.json({ success: false, message: `Onbekende omgeving: ${omgeving}` });
  }

  const base = afasBaseUrl(deelnemersnummer, omgeving);
  const auth = afasAuthHeader(afasToken.trim());
  const headers = { 'Authorization': auth, 'Content-Type': 'application/json' };
  const timeout = AbortSignal.timeout(15_000);

  try {
    const [getRes, updateRes] = await Promise.all([
      fetch(`${base}/metainfo/get`,    { headers, signal: timeout }),
      fetch(`${base}/metainfo/update`, { headers, signal: timeout }),
    ]);

    if (!getRes.ok && !updateRes.ok) {
      const detail = await getRes.text().catch(() => '');
      return NextResponse.json({
        success: false,
        message: `AFAS gaf HTTP ${getRes.status} terug`,
        detail,
      });
    }

    const getConnectors    = getRes.ok    ? normaliseList(await getRes.json().catch(() => [])) : [];
    const updateConnectors = updateRes.ok ? normaliseList(await updateRes.json().catch(() => [])) : [];

    return NextResponse.json({
      success: true,
      message: `Verbinding geslaagd — ${getConnectors.length} GetConnector(s), ${updateConnectors.length} UpdateConnector(s)`,
      getConnectors,
      updateConnectors,
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Verbinding mislukt' });
  }
}
