import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { canManageUsers } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['Owner', 'Admin', 'Operator', 'Viewer']).default('Viewer'),
});

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageUsers(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageUsers(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { email, password, role: newRole } = parsed.data;

  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) return NextResponse.json({ error: 'E-mail is al in gebruik' }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { tenantId, email, passwordHash, role: newRole },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
