import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canMutate } from '@/lib/rbac';
import { runWorkflow } from '@/lib/workflow-runner';
import { writeAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canMutate(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const workflow = await prisma.workflow.findFirst({ where: { id: params.id, tenantId } });
  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let triggerData: Record<string, unknown> = {};
  try { const b = await req.json(); triggerData = b ?? {}; } catch { /* no body is fine */ }

  const runId = await runWorkflow(params.id, tenantId, triggerData);
  await writeAuditLog({ tenantId, actorUserId: userId, action: 'executed', entityType: 'Workflow', entityId: params.id, meta: { runId } });
  return NextResponse.json({ runId }, { status: 202 });
}
