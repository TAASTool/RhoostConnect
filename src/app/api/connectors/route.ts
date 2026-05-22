import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';
import { canMutate } from '@/lib/rbac';
import { writeAuditLog } from '@/lib/audit';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['http_rest', 'webhook', 'afas_adapter']),
  config: z.object({
    baseUrl: z.string().url().optional().or(z.literal('')),
    auth: z.object({
      type: z.enum(['none', 'bearer', 'basic', 'api_key']),
      token: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      apiKey: z.string().optional(),
      apiKeyHeader: z.string().optional(),
    }).optional(),
    retries: z.number().int().min(0).max(10).optional(),
    timeoutMs: z.number().int().min(100).max(60000).optional(),
    // AFAS-specific fields
    deelnemersnummer: z.string().regex(/^\d{5}$/, 'Must be 5 digits').optional(),
    omgeving: z.enum(['productie', 'test', 'acceptatie']).optional(),
    afasToken: z.string().optional(),
  }),
}).superRefine((data, ctx) => {
  if (data.type === 'afas_adapter') {
    if (!data.config.deelnemersnummer) ctx.addIssue({ code: 'custom', path: ['config', 'deelnemersnummer'], message: 'Required for AFAS connector' });
    if (!data.config.omgeving) ctx.addIssue({ code: 'custom', path: ['config', 'omgeving'], message: 'Required for AFAS connector' });
    if (!data.config.afasToken) ctx.addIssue({ code: 'custom', path: ['config', 'afasToken'], message: 'Required for AFAS connector' });
  }
});

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connectors = await prisma.connector.findMany({
    where: { tenantId },
    include: { endpoints: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(connectors.map((c) => ({
    id: c.id, name: c.name, type: c.type, status: c.status,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
    endpointCount: c.endpoints.length,
  })));
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canMutate(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { name, type, config } = parsed.data;
  const configEncryptedJson = encrypt(JSON.stringify(config));

  const connector = await prisma.connector.create({
    data: { tenantId, name, type, configEncryptedJson, status: 'active' },
  });

  await writeAuditLog({ tenantId, actorUserId: userId, action: 'created', entityType: 'Connector', entityId: connector.id });
  return NextResponse.json(connector, { status: 201 });
}
