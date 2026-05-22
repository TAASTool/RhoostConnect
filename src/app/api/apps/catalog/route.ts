import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [defs, installs] = await Promise.all([
    prisma.appDefinition.findMany({ orderBy: { name: 'asc' } }),
    prisma.appInstall.findMany({ where: { tenantId }, select: { appDefinitionId: true, status: true } }),
  ]);

  const installedMap = new Map(installs.map((i) => [i.appDefinitionId, i.status]));
  return NextResponse.json(defs.map((d) => ({
    id: d.id, key: d.key, name: d.name, description: d.description, version: d.version,
    manifest: JSON.parse(d.manifestJson),
    installed: installedMap.has(d.id),
    installStatus: installedMap.get(d.id),
  })));
}
