/**
 * DevBanner — the REQUIRED page-level marker every /dev/* preview must render, so a screenshot can
 * never again be misread as production (it has twice: a fixture page read as production, and a
 * live-but-session-less page read as a production outage — same root cause, different direction).
 *
 * Two modes, and the distinction is the whole point:
 *   - "fixture" → the page feeds components hand-set sample data; numbers/states are authored in a
 *     file, NOT from the database. Realistic, but not production truth.
 *   - "live"    → the page renders production components with NO preview props, so they self-fetch
 *     real endpoints. WITHOUT a login session every block fails — that is a preview artefact, not a
 *     production defect. Marking it says so on the render itself.
 *
 * A guard (lib/dev/dev-marker-scan) fails the build if any dev page.tsx omits this banner.
 * Rendered as a plain strip at the very top of the page (above the app chrome), so it is always in
 * the first screenshot viewport and never overlaps the sticky top bar.
 */
export function DevBanner({ mode, note }: { mode: "fixture" | "live"; note?: string }) {
  const fixture = mode === "fixture";
  return (
    <div
      data-dev-banner={mode}
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-1.5 font-mono text-[11px] ${fixture ? "tint-amber" : "tint-red"}`}
    >
      <span className="font-bold uppercase tracking-wide">
        Dev · {fixture ? "fixture" : "data langsung"}
      </span>
      <span>
        {note ??
          (fixture
            ? "Data contoh — bukan produksi. Angka & keadaan disetel di berkas, bukan dari database."
            : "Merender komponen produksi dengan data LANGSUNG (butuh sesi login). Tanpa sesi setiap blok gagal — itu artefak pratinjau, BUKAN kerusakan produksi.")}
      </span>
    </div>
  );
}
