import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';

const schema = z.object({
  tenantName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { tenantName, email, password } = parsed.data;

  const tenant = await prisma.tenant.create({ data: { name: tenantName } });
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });

  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email, passwordHash, role: 'Owner' },
  });

  const token = await signToken({ sub: user.id, tenantId: tenant.id, email: user.email, role: 'Owner' });
  const res = NextResponse.json({ user: { id: user.id, email: user.email, role: user.role }, tenantId: tenant.id }, { status: 201 });
  res.cookies.set('rc_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400 });
  return res;
}
