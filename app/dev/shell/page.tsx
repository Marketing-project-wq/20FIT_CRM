import { AppShell } from "@/components/shell/app-shell";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

/**
 * Dev-only preview of the authenticated shell (no auth required) so the chrome
 * can be verified visually without a live Supabase session.
 */
export default function DevShellPreview() {
  return (
    <AppShell userEmail="marketing@20fit.id" activePath="/" showAllNav>
      <DashboardContent />
    </AppShell>
  );
}
