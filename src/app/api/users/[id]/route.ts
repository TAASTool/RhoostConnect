import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { canManageUsers } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['Owner', 'Admin', 'Operator', 'Viewer']).optional(),
  password: z.string().min(8).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  const currentUserId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageUsers(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const user = await prisma.user.findFirst({ where: { id: params.id, tenantId } });
  if (!user) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { email, role: newRole, password } = parsed.data;
  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(email !== undefined && { email }),
      ...(newRole !== undefined && { role: newRole }),
      ...(password !== undefined && { passwordHash: await bcrypt.hash(password, 12) }),
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id');
  const currentUserId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') ?? '';
  if (!tenantId || !currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageUsers(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (params.id === currentUserId) return NextResponse.json({ error: 'Je kunt jezelf niet verwijderen' }, { status: 400 });

  const user = await prisma.user.findFirst({ where: { id: params.id, tenantId } });
  if (!user) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 });

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
