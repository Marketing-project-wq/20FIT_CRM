import { redirect } from "next/navigation";

// Settings 4-tab rebuild (FINAL TUGAS 2): role administration now lives in the "20FIT Manager" tab of
// the Settings hub. The old deep link redirects there so bookmarks don't 404. The server actions in
// ./actions.ts stay — the manager tab's form imports them.
export default function RolesRedirect() {
  redirect("/settings?tab=manager");
}
