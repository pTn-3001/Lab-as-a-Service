import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface JwtPayload {
  sub?: string;
  exp?: number;
  systemRole?: string;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith('/admin');
  const isInstructorRoute = pathname.startsWith('/instructor');

  if (!isAdminRoute && !isInstructorRoute) {
    return NextResponse.next();
  }

  const token = request.cookies.get('laas-token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const payload = decodeJwt(token);

  if (!payload) {
    const res = NextResponse.redirect(new URL('/', request.url));
    res.cookies.delete('laas-token');
    return res;
  }

  // Expired token
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    const res = NextResponse.redirect(new URL('/', request.url));
    res.cookies.delete('laas-token');
    return res;
  }

  const role = payload.systemRole;

  // /admin requires ADMIN role
  if (isAdminRoute && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // /instructor requires INSTRUCTOR or ADMIN role
  if (isInstructorRoute && role !== 'INSTRUCTOR' && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/instructor/:path*'],
};
