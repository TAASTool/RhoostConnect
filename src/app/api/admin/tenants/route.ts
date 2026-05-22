import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional().default('free'),
  contactPerson: z.string().max(100).optional(),
  contactEmail: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  // First admin user
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

// GET /api/admin/tenants — list all tenants with KPIs
export async function GET() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { users: true, connectors: true, workflows: true, workflowRuns: true } },
      workflowRuns: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true, status: true } },
    },
  });

  return NextResponse.json(tenants.map((t) => ({
    id: t.id,
    name: t.name,
    plan: t.plan,
    contactPerson: t.contactPerson,
    contactEmail: t.contactEmail,
    phone: t.phone,
    createdAt: t.createdAt,
    userCount: t._count.users,
    connectorCount: t._count.connectors,
    workflowCount: t._count.workflows,
    runCount: t._count.workflowRuns,
    lastRunAt: t.workflowRuns[0]?.startedAt ?? null,
    lastRunStatus: t.workflowRuns[0]?.status ?? null,
  })));
}

// POST /api/admin/tenants — create new tenant + first admin user
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { name, plan, contactPerson, contactEmail, phone, adminEmail, adminPassword } = parsed.data;

  const tenant = await prisma.tenant.create({
    data: { name, plan, contactPerson, contactEmail, phone },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email: adminEmail, passwordHash, role: 'Owner' },
  });

  return NextResponse.json({ tenant, user: { id: user.id, email: user.email, role: user.role } }, { status: 201 });
}
