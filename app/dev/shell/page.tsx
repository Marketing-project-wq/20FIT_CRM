import { AppShell } from "@/components/shell/app-shell";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { DevBanner } from "@/components/dev/dev-banner";

/**
 * Dev-only preview of the authenticated shell (no auth required) so the chrome can be verified
 * visually without a live Supabase session. LIVE render: DashboardContent gets NO preview props, so
 * it self-fetches /api/dashboard — WITHOUT a session those fetches 307→/login and every block shows
 * its failure state. That is expected here (this page verifies the CHROME, not the data) and is
 * marked as such, so a screenshot is never misread as a production outage.
 */
export default function DevShellPreview() {
  return (
    <AppShell userEmail="marketing@20fit.id" activePath="/" showAllNav>
      <DevBanner mode="live" />
      <DashboardContent />
    </AppShell>
  );
}
