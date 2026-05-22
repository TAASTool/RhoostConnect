import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connector = await prisma.connector.findFirst({
    where: { id: params.id, tenantId },
    include: { endpoints: { take: 1 } },
  });
  if (!connector) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const config = JSON.parse(decrypt(connector.configEncryptedJson));
  const baseUrl = config.baseUrl;

  if (!baseUrl) {
    return NextResponse.json({ success: false, message: 'No base URL configured' });
  }

  try {
    const headers: Record<string, string> = {};
    if (config.auth?.type === 'bearer') headers['Authorization'] = `Bearer ${config.auth.token}`;
    if (config.auth?.type === 'basic') {
      const b64 = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${b64}`;
    }
    const testUrl = connector.endpoints[0] ? `${baseUrl}${connector.endpoints[0].path}` : baseUrl;
    const res = await fetch(testUrl, { method: 'GET', headers, signal: AbortSignal.timeout(10_000) });
    return NextResponse.json({ success: res.ok, status: res.status, message: res.ok ? 'Connection successful' : `HTTP ${res.status}` });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Connection failed' });
  }
}
