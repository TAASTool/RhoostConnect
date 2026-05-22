import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';

const AFAS_HOST: Record<string, string> = {
  productie:  'rest.afas.online',
  test:       'resttest.afas.online',
  acceptatie: 'restaccept.afas.online',
};

const AFAS_TOKEN_RE = /^<token><version>\d+<\/version><data>[A-Fa-f0-9]+<\/data><\/token>$/;

type AfasEntry = { id: string; description: string };

interface AfasMetaInfo {
  getConnectors?:    AfasEntry[];
  updateConnectors?: AfasEntry[];
  customConnectors?: AfasEntry[];
  info?: { appName?: string; envid?: string; tokenExpiry?: string; group?: string };
}

function toEntries(arr: unknown): AfasEntry[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c: unknown) => {
      const o = c as Record<string, unknown>;
      return {
        id:          String(o.id ?? o.Id ?? ''),
        description: String(o.description ?? o.Description ?? ''),
      };
    })
    .filter(e => e.id);
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

  const base = `https://${deelnemersnummer}.${AFAS_HOST[omgeving]}/ProfitRestServices`;
  const tokenB64 = Buffer.from(afasToken.trim()).toString('base64');
  const headers = {
    'Authorization': `AfasToken ${tokenB64}`,
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(`${base}/MetaInfo`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ success: false, message: `AFAS gaf HTTP ${res.status} terug`, detail });
    }

    const meta: AfasMetaInfo = await res.json();

    const getConnectors    = toEntries(meta.getConnectors);
    const updateConnectors = toEntries(meta.updateConnectors);
    const customConnectors = toEntries(meta.customConnectors);

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
