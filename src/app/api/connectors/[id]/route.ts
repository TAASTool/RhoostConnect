import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';
import { canMutate } from '@/lib/rbac';
import { writeAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connector = await prisma.connector.findFirst({
    where: { id: params.id, tenantId },
    include: { endpoints: true },
  });
  if (!connector) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const config = JSON.parse(decrypt(connector.configEncryptedJson));
  if (config.auth?.password) config.auth.password = '***';
  if (config.auth?.token) config.auth.token = '***';
  if (config.auth?.apiKey) config.auth.apiKey = '***';

  return NextResponse.json({ ...connector, config });
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  endpoints: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string().min(1),
    headersJson: z.string().optional(),
    bodyTemplateJson: z.string().optional(),
    mappingJson: z.string().optional(),
  })).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canMutate(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.connector.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { name, config, status, endpoints } = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name;
  if (status) updateData.status = status;
  if (config) {
    const existingConfig = JSON.parse(decrypt(existing.configEncryptedJson));
    const merged = { ...existingConfig, ...config };
    updateData.configEncryptedJson = encrypt(JSON.stringify(merged));
  }

  const connector = await prisma.connector.update({ where: { id: params.id }, data: updateData });

  if (endpoints) {
    await prisma.connectorEndpoint.deleteMany({ where: { connectorId: params.id } });
    await prisma.connectorEndpoint.createMany({
      data: endpoints.map((e) => ({
        connectorId: params.id, name: e.name, method: e.method, path: e.path,
        headersJson: e.headersJson, bodyTemplateJson: e.bodyTemplateJson, mappingJson: e.mappingJson,
      })),
    });
  }

  await writeAuditLog({ tenantId, actorUserId: userId, action: 'updated', entityType: 'Connector', entityId: connector.id });
  return NextResponse.json(connector);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canMutate(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.connector.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.connector.delete({ where: { id: params.id } });
  await writeAuditLog({ tenantId, actorUserId: userId, action: 'deleted', entityType: 'Connector', entityId: params.id });
  return NextResponse.json({ ok: true });
}
