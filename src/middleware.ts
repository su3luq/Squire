import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

const PUBLIC_PATHS = ['/login', '/register', '/registration-closed'];
const AUTH_PATHS = ['/login', '/register'];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  // Not signed in: only public routes
  if (!user) {
    if (!PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  // Signed in: fetch profile to determine role
  // We need a fresh server client here that uses the response cookies
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // No-op; we already refreshed cookies via updateSession
        },
      },
    }
  );
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Signed in, no profile row: send to login (recovery state)
  if (!profile) {
    if (!AUTH_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  // Signed in WITH profile: redirect away from auth pages
  if (AUTH_PATHS.includes(pathname)) {
    const home = profile.role === 'teacher' ? '/teacher' : '/student';
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Role gates: students can't access /teacher, teachers can't access /student
  if (pathname.startsWith('/teacher') && profile.role !== 'teacher') {
    return NextResponse.redirect(new URL('/student', request.url));
  }
  if (pathname.startsWith('/student') && profile.role !== 'student') {
    return NextResponse.redirect(new URL('/teacher', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
