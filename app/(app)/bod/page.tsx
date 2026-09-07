import { redirect } from "next/navigation";

/**
 * `/bod` was a separate board screen for a few hours on 7 Sep 2026. It is now the TOP LAYER of the
 * Dashboard (K-61, revised): the owner's instruction was to improve the Dashboard, not to add a
 * second page beside it — and a second screen reading the same data would have drifted from the
 * first on its own, which is the failure this whole sprint has been closing.
 *
 * The route stays as a permanent redirect so links already shared keep working. It is NOT a page:
 * there is nothing here that can age.
 */
export default function BodRedirect() {
  redirect("/");
}
