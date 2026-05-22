import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const tenantId = req.headers.get('x-tenant-id');
  if (!userId || !tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return NextResponse.json({ id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, tenantName: tenant?.name });
}
