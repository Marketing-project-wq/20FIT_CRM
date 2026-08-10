import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirectedFrom", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

/**
 * Refreshes the Supabase auth session and enforces the gate: only /login and
 * /health are reachable without a session. Fails closed — if the project is
 * misconfigured or unreachable, protected paths still go to /login.
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

  const publicPath = pathname === "/login" || pathname.startsWith("/login/");

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

  // A signed-in user has no reason to sit on the login page.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
