import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
  contactPerson: z.string().max(100).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      users: { orderBy: { createdAt: 'asc' }, select: { id: true, email: true, role: true, createdAt: true } },
      _count: { select: { connectors: true, workflows: true, workflowRuns: true } },
      workflowRuns: { orderBy: { startedAt: 'desc' }, take: 5, select: { id: true, startedAt: true, status: true, workflowId: true } },
    },
  });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id: tenant.id,
    name: tenant.name,
    plan: tenant.plan,
    contactPerson: tenant.contactPerson,
    contactEmail: tenant.contactEmail,
    phone: tenant.phone,
    createdAt: tenant.createdAt,
    users: tenant.users,
    connectorCount: tenant._count.connectors,
    workflowCount: tenant._count.workflows,
    runCount: tenant._count.workflowRuns,
    recentRuns: tenant.workflowRuns,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { name, plan, contactPerson, contactEmail, phone } = parsed.data;
  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(plan !== undefined && { plan }),
      ...(contactPerson !== undefined && { contactPerson }),
      ...(contactEmail !== undefined && { contactEmail: contactEmail || null }),
      ...(phone !== undefined && { phone }),
    },
  });

  return NextResponse.json(tenant);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.tenant.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
