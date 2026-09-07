import { BarList } from "./bar-list";
import type { Dict, Lang } from "@/lib/i18n";
import { formatCount, formatDate, formatDateTime } from "@/lib/i18n";
import type { Reach, Load, DeliveryHealth } from "@/lib/crm/bod";

export interface BodData {
  measuredAt: string;
  reach: Reach;
  loads: Load[];
  loadsTruncated: boolean;
  units: { unit: string; people: number }[];
  unitsRefreshedAt: string | null;
  health: DeliveryHealth;
  notInCrmDistinct: number;
  notInCrmPerSourceSum: number;
}

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

export function BodContent({ data, t, lang }: { data: BodData; t: Dict; lang: Lang }) {
  const b = t.bod;
  const { reach, health } = data;

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
        {/* ONE timestamp for the whole page. Everything above it was measured in the same request. */}
        <p className="font-mono text-[12px] text-ink-faint">
          {b.measuredAt} {formatDateTime(data.measuredAt, lang)} {b.tz}
        </p>
      </header>

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
          <Note>{data.loadsTruncated ? b.growthTruncated : b.growthNote}</Note>
        </Card>

        <Card n={3} title={b.unitsTitle}>
          <BarList items={unitBars} lang={lang} />
          <Note>
            {b.unitsNote}
            {" "}
            {/* This card alone has its own freshness — see app/(app)/bod/page.tsx for why. */}
            <span className="font-mono">
              {b.unitsMeasuredAt} {data.unitsRefreshedAt ? formatDateTime(data.unitsRefreshedAt, lang) : "—"}
            </span>
          </Note>
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
