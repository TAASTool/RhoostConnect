import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const schema = z.object({
  setupKey: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  platformName: z.string().min(1).max(100).optional(),
});

// Creates the first super_admin. Requires SUPER_ADMIN_SETUP_KEY env var to match.
// Only succeeds if no super_admin exists yet.
export async function POST(req: NextRequest) {
  const setupKey = process.env.SUPER_ADMIN_SETUP_KEY;
  if (!setupKey) {
    return NextResponse.json({ error: 'Setup is not enabled (SUPER_ADMIN_SETUP_KEY not set)' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });

  const { setupKey: providedKey, email, password, platformName } = parsed.data;
  if (providedKey !== setupKey) {
    return NextResponse.json({ error: 'Ongeldige setup key' }, { status: 403 });
  }

  const existing = await prisma.user.findFirst({ where: { role: 'super_admin' } });
  if (existing) {
    return NextResponse.json({ error: 'Er bestaat al een super admin account' }, { status: 409 });
  }

  const tenant = await prisma.tenant.create({
    data: { name: platformName ?? 'Rhoost Platform' },
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email, passwordHash, role: 'super_admin' },
  });

  const token = await signToken({ sub: user.id, tenantId: tenant.id, email: user.email, role: 'super_admin' });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, role: 'super_admin' } }, { status: 201 });
  res.cookies.set('rc_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400 });
  return res;
}
