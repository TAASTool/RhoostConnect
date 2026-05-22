import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  const workflow = await prisma.workflow.findFirst({ where: { id: params.id, tenantId } });
  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [runs, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where: { workflowId: params.id, tenantId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
      include: { logs: { orderBy: { ts: 'asc' }, take: 50 } },
    }),
    prisma.workflowRun.count({ where: { workflowId: params.id, tenantId } }),
  ]);

  return NextResponse.json({ runs, total, limit, offset });
}
