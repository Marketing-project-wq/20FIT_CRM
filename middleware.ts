import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every request except Next internals and static asset files.
     * /login and /health are allowed through inside updateSession.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt)$).*)",
  ],
};
