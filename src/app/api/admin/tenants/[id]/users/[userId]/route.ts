import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['Owner', 'Admin', 'Operator', 'Viewer']).optional(),
  password: z.string().min(8).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { email, role, password } = parsed.data;
  const user = await prisma.user.findFirst({ where: { id: params.userId, tenantId: params.id } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: {
      ...(email !== undefined && { email }),
      ...(role !== undefined && { role }),
      ...(password !== undefined && { passwordHash: await bcrypt.hash(password, 12) }),
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const user = await prisma.user.findFirst({ where: { id: params.userId, tenantId: params.id } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  await prisma.user.delete({ where: { id: params.userId } });
  return NextResponse.json({ ok: true });
}
