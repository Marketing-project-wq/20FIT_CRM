import { redirect } from "next/navigation";

// Exports removed (nav rebuild, 7→6): CSV export is gone entirely — it was the only data exit that
// did NOT honour unsubscribe, and the product manages audiences + sends directly rather than moving
// data out. The criteria builder it hosted now lives only in Campaigns. Old bookmarks land there.
export default function ExportsRedirect() {
  redirect("/campaigns");
}
