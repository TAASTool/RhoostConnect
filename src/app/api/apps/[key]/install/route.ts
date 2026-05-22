import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canMutate } from '@/lib/rbac';
import { writeAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canMutate(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const appDef = await prisma.appDefinition.findUnique({ where: { key: params.key } });
  if (!appDef) return NextResponse.json({ error: 'App not found' }, { status: 404 });

  const existing = await prisma.appInstall.findFirst({ where: { tenantId, appDefinitionId: appDef.id } });
  if (existing) return NextResponse.json({ error: 'Already installed' }, { status: 409 });

  const manifest = JSON.parse(appDef.manifestJson);
  const install = await prisma.appInstall.create({
    data: { tenantId, appDefinitionId: appDef.id, status: 'active' },
  });

  if (manifest.workflowTemplate) {
    await prisma.workflow.create({
      data: {
        tenantId, name: manifest.workflowTemplate.name,
        definitionJson: JSON.stringify(manifest.workflowTemplate.definition),
        enabled: false,
      },
    });
  }

  await writeAuditLog({ tenantId, actorUserId: userId, action: 'installed', entityType: 'App', entityId: appDef.id, meta: { appKey: params.key } });
  return NextResponse.json({ installId: install.id, appKey: params.key }, { status: 201 });
}
