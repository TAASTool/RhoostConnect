import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const installs = await prisma.appInstall.findMany({
    where: { tenantId },
    include: { appDefinition: true },
    orderBy: { installedAt: 'desc' },
  });

  return NextResponse.json(installs.map((i) => ({
    id: i.id, status: i.status, installedAt: i.installedAt,
    app: { id: i.appDefinition.id, key: i.appDefinition.key, name: i.appDefinition.name, description: i.appDefinition.description, version: i.appDefinition.version },
  })));
}
