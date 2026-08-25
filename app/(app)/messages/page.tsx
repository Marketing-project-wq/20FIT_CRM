import { redirect } from "next/navigation";

// Nav rebuild (11→7): /messages is gone. The send history is now a tab under Templates.
export default function MessagesRedirect() {
  redirect("/templates?tab=history");
}
