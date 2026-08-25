import { redirect } from "next/navigation";

// Nav rebuild (11→7): /segments is gone. The criteria builder + AI assistant now live in Campaigns
// (to send) and Exports (to export) via the shared SegmentBuilder. Old bookmarks land on Campaigns.
export default function SegmentsRedirect() {
  redirect("/campaigns");
}
