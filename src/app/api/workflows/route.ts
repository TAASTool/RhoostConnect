import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { canMutate } from '@/lib/rbac';
import { writeAuditLog } from '@/lib/audit';

const nodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  config: z.record(z.unknown()).optional().default({}),
});

const edgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  when: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.object({
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
  }),
  enabled: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workflows = await prisma.workflow.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { runs: true } } },
  });

  return NextResponse.json(workflows.map((w) => ({
    id: w.id, name: w.name, enabled: w.enabled, createdAt: w.createdAt, updatedAt: w.updatedAt,
    runCount: w._count.runs,
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

  const { name, definition, enabled } = parsed.data;
  const workflow = await prisma.workflow.create({
    data: { tenantId, name, definitionJson: JSON.stringify(definition), enabled },
  });

  await writeAuditLog({ tenantId, actorUserId: userId, action: 'created', entityType: 'Workflow', entityId: workflow.id });
  return NextResponse.json(workflow, { status: 201 });
}
