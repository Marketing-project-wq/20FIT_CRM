import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Routes reachable without a session. Everything else requires login. */
const PUBLIC_PATHS = ["/login", "/health"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  // Dev-only visual verification pages (/dev/tokens, /dev/shell) are never
  // reachable in production.
  if (process.env.NODE_ENV !== "production" && pathname.startsWith("/dev")) {
    return true;
  }
  return false;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirectedFrom", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

/**
 * Refreshes the Supabase auth session on every request and enforces the gate:
 * unauthenticated users may only reach public paths. Fails closed — if the
 * project is misconfigured or unreachable, non-public paths still go to /login.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const publicPath = isPublicPath(pathname);

  // /health and dev-only pages never need a session — don't call the auth server.
  const skipAuth =
    pathname === "/health" ||
    pathname.startsWith("/health/") ||
    (process.env.NODE_ENV !== "production" && pathname.startsWith("/dev"));
  if (skipAuth) {
    return NextResponse.next({ request });
  }

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
    // Auth server unreachable — treat as signed out (fail closed below).
    user = null;
  }

  if (!user && !publicPath) {
    return redirectToLogin(request);
  }

  // A signed-in user has no reason to sit on the login page.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
