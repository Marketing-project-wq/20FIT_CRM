import { BarList } from "./bar-list";
import type { Dict, Lang } from "@/lib/i18n";
import { formatCount, formatDate, formatDateTime } from "@/lib/i18n";
import { isBodSnapshotStale, bodSnapshotAgeHours, type BodSnapshot } from "@/lib/crm/bod";

export type BodData = BodSnapshot;

/**
 * The five cards. Five is a limit on how many things must be read at once — not on how many
 * numbers may appear. A card carrying four related figures is still one thing to read; five cards
 * each carrying one figure would be five.
 *
 * Every number on this screen is computed at request time. None is written into a translation
 * string, which is the rule K-60 exists to state — and which four captions on the operational
 * dashboard had quietly broken.
 */

function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-ink-faint">{n}</span> · {title}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Figure({ value, label, tone }: { value: string; label: string; tone?: "green" | "amber" | "red" }) {
  const colour = tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : tone === "red" ? "text-red" : "text-ink";
  return (
    <div>
      <p className={`font-display text-[28px] font-semibold leading-none tabular-nums ${colour}`}>{value}</p>
      <p className="mt-1 font-body text-[12px] leading-snug text-ink-soft">{label}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 font-body text-[12px] leading-relaxed text-ink-faint">{children}</p>;
}

export function DirectorSummary({
  data,
  t,
  lang,
  nowMs,
}: {
  data: BodData;
  t: Dict;
  lang: Lang;
  /** Injected so the staleness banner is testable without mocking a clock. The page passes
   *  Date.now(); it is used ONLY to decide whether the snapshot is old, never to stamp it. */
  nowMs: number;
}) {
  const b = t.bod;
  const { reach, health } = data;
  const stale = isBodSnapshotStale(data.measuredAt, nowMs);
  const ageHours = bodSnapshotAgeHours(data.measuredAt, nowMs);

  // Share of the audience ever contacted. Computed, and shown to one decimal because rounding 0.15%
  // to "0%" would turn a real number into a claim that nobody has been contacted.
  const contactedPct = reach.poolTotal > 0 ? ((reach.everContacted / reach.poolTotal) * 100).toFixed(1) : "0.0";

  const loadBars = data.loads.map((l) => ({ label: formatDate(l.at, lang), value: l.count }));
  const unitBars = data.units.map((u) => ({
    label: b.units[u.unit as keyof typeof b.units] ?? u.unit,
    value: u.people,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-extrabold leading-none text-ink">{b.title}</h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">{b.subtitle}</p>
        </div>
        {/* ONE timestamp for THIS SECTION, and it is the SNAPSHOT'S OWN — never the clock. The
            "one measurement time" promise is per-section now, not per-page (K-61 amended, K-64):
            this summary is the top layer of the Dashboard, the operational detail below carries its
            own separate freshness, and the boundary between them is stated, not implied. If
            tonight's refresh fails, this stamp stops moving instead of advancing over stale numbers
            (K-63). That is why the value comes from data.measuredAt and there is no `new Date()`
            anywhere in this component. */}
        <p className="font-mono text-[12px] text-ink-faint">
          {b.measuredAt} {data.measuredAt ? formatDateTime(data.measuredAt, lang) : "—"} {b.tz}
        </p>
      </header>

      {/* The stopped clock, said in words. Without this the reader must notice that a date is two
          days old — and nobody reads a board screen that way. */}
      {stale && (
        <p className="tint-red rounded-sm px-4 py-3 font-body text-[13px] font-semibold leading-relaxed" role="alert">
          {ageHours === null
            ? b.staleNever
            : b.staleWarning.replace("{hours}", formatCount(ageHours, lang))}
        </p>
      )}

      {/* B3 — the freshness boundary, said plainly. The three cron jobs refresh CALCULATIONS; not
          one of them adds a person. Anyone reading "updated daily" would otherwise assume both. */}
      <p className="tint-amber rounded-sm px-4 py-3 font-body text-[13px] leading-relaxed">
        {data.loads.length > 0
          ? b.freshnessNote.replace("{date}", formatDate(data.loads[data.loads.length - 1].at, lang))
          : b.freshnessNoteNoLoad}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card n={1} title={b.reachTitle}>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Figure value={formatCount(reach.emailable, lang)} label={b.reachEmail} tone="green" />
            <Figure value={formatCount(reach.whatsappable, lang)} label={b.reachWhatsapp} tone="green" />
            <Figure value={formatCount(reach.poolTotal, lang)} label={b.reachTotal} />
            <Figure
              value={`${formatCount(reach.everContacted, lang)} · ${contactedPct}%`}
              label={b.reachEverContacted}
              tone="amber"
            />
          </div>
          <Note>{b.reachNote}</Note>
        </Card>

        <Card n={2} title={b.growthTitle}>
          {loadBars.length > 0 ? (
            <BarList items={loadBars} lang={lang} />
          ) : (
            <p className="font-body text-[13px] text-ink-soft">{b.growthEmpty}</p>
          )}
          <Note>{b.growthNote}</Note>
        </Card>

        <Card n={3} title={b.unitsTitle}>
          <BarList items={unitBars} lang={lang} />
          {/* No per-card timestamp: the whole section shares the header's one (K-61/K-63/K-64).
              What the card DOES have to say is which unit is missing — `shop` is not in the daily
              snapshot, and counting it live would have handed this section a second freshness.
              Naming it is honest; dropping it silently would shrink a total nobody could reconcile. */}
          <Note>{b.unitsNote} {b.unitsShopExcluded}</Note>
        </Card>

        <Card n={4} title={b.healthTitle}>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Figure value={formatCount(health.delivered, lang)} label={b.healthDelivered} tone="green" />
            <Figure value={formatCount(health.bounced, lang)} label={b.healthBounced} tone="amber" />
            <Figure value={formatCount(health.unsubscribed, lang)} label={b.healthUnsubscribed} tone="amber" />
            <Figure value={formatCount(health.workflowQueued, lang)} label={b.healthQueued} />
          </div>
          {/* The 18,119 are on this card by decision, not by accident: a screen that showed only the
              121 delivered would repeat the exact error this sprint was opened to fix — a send that
              failed 18k times was filed as "sent". */}
          <Note>{b.healthNote.replace("{failed}", formatCount(health.failed, lang))}</Note>
        </Card>

        <Card n={5} title={b.gapTitle}>
          {/* The one-line definition sits ABOVE the number, not in the footnote. A reader who has
              only the figure will reconstruct its meaning from somewhere else — and the per-source
              breakdown on the operational screen invites exactly the sum this number is not. */}
          <p className="mb-3 font-body text-[12px] font-semibold leading-snug text-ink-soft">{b.gapWhatItCounts}</p>
          <Figure value={formatCount(data.notInCrmDistinct, lang)} label={b.gapLabel} tone="red" />
          <Note>{b.gapNote}</Note>
        </Card>
      </div>
    </div>
  );
}
