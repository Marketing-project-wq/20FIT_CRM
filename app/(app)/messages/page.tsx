import { redirect } from "next/navigation";

// Nav rebuild (11→7): /messages is gone. Send history is now the Deliveries tab under Campaigns,
// where scheduled + running + done + stopped sends live as one timeline.
export default function MessagesRedirect() {
  redirect("/campaigns?tab=kiriman");
}
