import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import type { Role } from '@/types';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });

  const { email, password, tenantId } = parsed.data;

  const user = await prisma.user.findFirst({
    where: tenantId ? { email, tenantId } : { email },
    include: { tenant: true },
  });

  if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const token = await signToken({ sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role as Role });
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, role: user.role },
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
  });
  res.cookies.set('rc_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400 });
  return res;
}
