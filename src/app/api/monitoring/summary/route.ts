import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [runsOk, runsFailed, activeWorkflows, activeConnectors, recentRuns] = await Promise.all([
    prisma.workflowRun.count({ where: { tenantId, status: 'success', startedAt: { gte: since24h } } }),
    prisma.workflowRun.count({ where: { tenantId, status: 'failed', startedAt: { gte: since24h } } }),
    prisma.workflow.count({ where: { tenantId, enabled: true } }),
    prisma.connector.count({ where: { tenantId, status: 'active' } }),
    prisma.workflowRun.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: 10,
      include: { workflow: { select: { name: true } } },
    }),
  ]);

  const mostFailing = await prisma.workflowRun.groupBy({
    by: ['workflowId'],
    where: { tenantId, status: 'failed', startedAt: { gte: since24h } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  return NextResponse.json({ runsOk, runsFailed, activeWorkflows, activeConnectors, recentRuns, mostFailing });
}
