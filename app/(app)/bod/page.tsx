import { permanentRedirect } from "next/navigation";

// The board summary is now the TOP LAYER of the Dashboard (K-64), not a second page. This route
// stays as a PERMANENT redirect (308) so links already shared keep resolving — and so no second
// page can drift out of sync or age on its own. Owner instruction was explicit: do not create a new
// page. A director-only view that hides the operational detail was NOT built here; it would be a new
// page, so it goes to the owner as a proposal rather than a decision taken alone.
export default function BodRedirect() {
  permanentRedirect("/");
}
