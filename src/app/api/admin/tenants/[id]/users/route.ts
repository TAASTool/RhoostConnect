import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['Owner', 'Admin', 'Operator', 'Viewer']).default('Viewer'),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const users = await prisma.user.findMany({
    where: { tenantId: params.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { email, password, role } = parsed.data;

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const existing = await prisma.user.findFirst({ where: { tenantId: params.id, email } });
  if (existing) return NextResponse.json({ error: 'Email already in use for this tenant' }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { tenantId: params.id, email, passwordHash, role },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
