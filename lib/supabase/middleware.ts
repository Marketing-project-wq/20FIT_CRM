import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Paths reachable WITHOUT a session (the auth gate's allowlist): /login (+ subpaths), the
 * password-recovery pages, and the public self-service unsubscribe (page + its API). A recipient
 * clicking an unsubscribe link in an email has no CRM session — the link's SIGNED token is the
 * authorization, verified in /api/unsubscribe, not a login. /health and /dev are handled by their
 * own earlier returns. Pure + exported so a test enforces this list — a future addition can't slip
 * through unnoticed.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/unsubscribe" ||
    pathname === "/api/unsubscribe" ||
    // Mailtrap delivery webhook: an external POST with no CRM session — its authorization is the
    // request SIGNATURE (verified in the route), the same shape as the unsubscribe token.
    pathname === "/api/mailtrap/webhook"
  );
}

/**
 * Paths an ALREADY-authenticated user is bounced away from to `/`. /login and
 * /forgot-password qualify (a signed-in user needs neither). /reset-password does NOT —
 * submitting the code calls verifyOtp, which creates a temporary session, so bouncing an
 * authenticated user off /reset-password would break the reset itself.
 */
export function bouncesAuthenticated(pathname: string): boolean {
  return pathname === "/login" || pathname === "/forgot-password";
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirectedFrom", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

/**
 * Refreshes the Supabase auth session and enforces the gate. Reachable WITHOUT a session:
 * /login, /health, /dev (dev only), and the password-recovery pages /forgot-password and
 * /reset-password (a locked-out user has no session but must reach them). Fails closed — if
 * the project is misconfigured or unreachable, protected paths still go to /login.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // Dev-only verification pages (/dev/tokens, /dev/shell):
  //  - production: 404 for EVERYONE, authenticated or not. Returned here, before
  //    any auth logic, so login state is irrelevant — these never exist live.
  //  - development: reachable without a session.
  if (pathname === "/dev" || pathname.startsWith("/dev/")) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next({ request });
  }

  // /health is a public liveness endpoint and never needs a session.
  if (pathname === "/health" || pathname.startsWith("/health/")) {
    return NextResponse.next({ request });
  }

  const publicPath = isPublicPath(pathname);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Misconfigured environment: never expose a protected page.
  if (!url || !anon) {
    return publicPath ? NextResponse.next({ request }) : redirectToLogin(request);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null; // fail closed below
  }

  if (!user && !publicPath) {
    return redirectToLogin(request);
  }

  // A signed-in user has no reason to sit on the login page — or to REQUEST a reset
  // (/forgot-password). But NOT /reset-password: submitting the code calls verifyOtp, which
  // establishes a temporary session, so bouncing an authenticated user off /reset-password
  // would break the reset itself. So /reset-password is deliberately absent here.
  if (user && bouncesAuthenticated(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
