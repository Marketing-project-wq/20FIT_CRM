import { DevBanner } from "@/components/dev/dev-banner";
import { ImportPreview } from "./preview-client";

export const dynamic = "force-dynamic";

/**
 * Dev-only FIXTURE for the CSV import wizard. /dev/* is 404 in production. The real ImportWizard is
 * rendered with window.fetch STUBBED to canned responses — it never calls the API, never touches the
 * database, never imports anything. Lets a screenshot show the map / summary / report steps (with a
 * suppression count highlighted) without auth or any write.
 */
export default function Page() {
  return (
    <div className="min-h-screen bg-surface p-6">
      <DevBanner mode="fixture" note="Wizard impor CSV — respons API di-stub, tidak ada tulisan ke database." />
      <div className="mt-4">
        <ImportPreview />
      </div>
    </div>
  );
}
