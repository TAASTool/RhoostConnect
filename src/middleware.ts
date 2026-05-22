import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/admin/setup',
  '/admin/setup',
];
const WEBHOOK_PATH = /^\/api\/webhooks\//;

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-secret');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || WEBHOOK_PATH.test(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get('rc_token')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;

    // /admin/* requires super_admin
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
      if (role !== 'super_admin') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.redirect(new URL('/app/dashboard', req.url));
      }
    }

    const res = NextResponse.next();
    res.headers.set('x-user-id', payload.sub as string);
    res.headers.set('x-tenant-id', payload.tenantId as string);
    res.headers.set('x-user-role', role);
    return res;
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
