import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — anon key only. Safe to bundle to the client.
 * Never import lib/supabase/admin here.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
