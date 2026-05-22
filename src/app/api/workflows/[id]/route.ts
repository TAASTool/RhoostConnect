import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { canMutate } from '@/lib/rbac';
import { writeAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workflow = await prisma.workflow.findFirst({ where: { id: params.id, tenantId } });
  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ...workflow, definition: JSON.parse(workflow.definitionJson) });
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  definition: z.object({ nodes: z.array(z.any()), edges: z.array(z.any()) }).optional(),
  enabled: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canMutate(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.workflow.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });

  const { name, definition, enabled } = parsed.data;
  const updated = await prisma.workflow.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(definition !== undefined && { definitionJson: JSON.stringify(definition) }),
      ...(enabled !== undefined && { enabled }),
    },
  });

  await writeAuditLog({ tenantId, actorUserId: userId, action: 'updated', entityType: 'Workflow', entityId: params.id });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canMutate(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.workflow.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.workflow.delete({ where: { id: params.id } });
  await writeAuditLog({ tenantId, actorUserId: userId, action: 'deleted', entityType: 'Workflow', entityId: params.id });
  return NextResponse.json({ ok: true });
}
