"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitBranch, Plus, Search, Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JOURNEYS, TRIGGERS, pct, toNum, type FlowSummary } from "@/lib/crm/flow/types";
import { saveFlowAction, seedBlueprintAction } from "./actions";

const STATUS: Record<string, { label: string; tone: "neutral" | "green" | "amber" | "blue" }> = {
  draft: { label: "Draft", tone: "neutral" },
  test: { label: "Uji", tone: "blue" },
  active: { label: "Aktif", tone: "green" },
  paused: { label: "Dijeda", tone: "amber" },
};

const rupiah = (v: unknown) => {
  const n = toNum(v);
  if (!n) return "–";
  if (n >= 1e9) return `Rp${(n / 1e9).toFixed(1)} M`;
  if (n >= 1e6) return `Rp${(n / 1e6).toFixed(1)} jt`;
  return `Rp${Math.round(n / 1e3)} rb`;
};

export function FlowsList({ flows, error, canActivate }: { flows: FlowSummary[]; error: string | null; canActivate: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [journey, setJourney] = useState("all");
  const [status, setStatus] = useState("all");
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return flows.filter(
      (f) =>
        (journey === "all" || f.journey === journey) &&
        (status === "all" || f.status === status) &&
        (!ql || `${f.id} ${f.name} ${f.description ?? ""}`.toLowerCase().includes(ql)),
    );
  }, [flows, q, journey, status]);

  const totals = useMemo(() => {
    const t = { active: 0, entered: 0, sent: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 };
    for (const f of flows) {
      if (f.status === "active") t.active++;
      t.entered += toNum(f.entered);
      t.sent += toNum(f.sent);
      t.opened += toNum(f.opened);
      t.clicked += toNum(f.clicked);
      t.converted += toNum(f.converted);
      t.revenue += toNum(f.revenue);
    }
    return t;
  }, [flows]);

  const groups = Object.keys(JOURNEYS).map((k) => ({ k, items: shown.filter((f) => f.journey === k) })).filter((g) => g.items.length);

  function createNew() {
    start(async () => {
      const id = `F${Date.now().toString(36).toUpperCase()}`;
      const r = await saveFlowAction({
        id,
        name: "Flow baru",
        journey: "X",
        description: null,
        priority: 50,
        holdout_pct: 10,
        goal: { lines: [], days: 14 },
        graph: {
          trigger: { kind: "purchase", lines: ["TICKET"], lookback_hours: 48 },
          start: "n1",
          nodes: {
            n1: { type: "email", name: "Email 1", subject: "Halo {{first_name}}", headline: "Judul email", body: "Isi email.", cta_label: "Lihat", cta_url: "https://20fit.id", next: "n2" },
            n2: { type: "exit", label: "Selesai" },
          },
        },
      });
      if (r.ok) router.push(`/flows/${id}`);
      else setMsg(r.error);
    });
  }

  function seed() {
    start(async () => {
      const r = await seedBlueprintAction();
      setMsg(r.ok ? `${r.inserted} flow blueprint dimuat (Draft).` : r.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Flow</h1>
          <p className="max-w-2xl font-body text-[14px] leading-relaxed text-ink-soft">
            Journey otomatis lintas Ticket, Photo, Clinic, Arena, App dan Media. Setiap flow punya pemicu, cabang IF/ELSE, email, dan
            tujuan konversi. Angka diambil dari Customer 360 dan log kirim CRM.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canActivate && flows.length < 60 && (
            <Button variant="secondary" onClick={seed} disabled={busy}>
              <Download /> Muat 60 flow blueprint
            </Button>
          )}
          <Button onClick={createNew} disabled={busy}>
            <Plus /> Flow baru
          </Button>
        </div>
      </div>

      {error && <div className="tint-red rounded-card p-4 font-body text-[13px]">Mesin flow tidak bisa dihubungi: {error}</div>}
      {msg && <div className="tint-blue rounded-card p-3 font-body text-[13px]">{msg}</div>}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-glass-border bg-glass-border sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["Flow", String(flows.length)],
          ["Aktif", String(totals.active)],
          ["Peserta masuk", totals.entered.toLocaleString("id-ID")],
          ["Email terkirim", totals.sent.toLocaleString("id-ID")],
          ["Open rate", pct(totals.opened, totals.sent)],
          ["CTR", pct(totals.clicked, totals.sent)],
          ["Konversi", `${totals.converted.toLocaleString("id-ID")} · ${rupiah(totals.revenue)}`],
        ].map(([l, v]) => (
          <div key={l} className="card flex flex-col gap-1 p-4">
            <span className="font-display text-[22px] font-bold leading-none text-ink">{v}</span>
            <span className="font-body text-[12px] text-ink-soft">{l}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[["all", "Semua journey"], ...Object.entries(JOURNEYS)].map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setJourney(k)}
              className={`rounded-full border px-3 py-1 font-body text-[13px] ${journey === k ? "border-ink bg-ink text-white" : "border-glass-border bg-glass text-ink"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[["all", "Semua status"], ["draft", "Draft"], ["active", "Aktif"], ["paused", "Dijeda"]].map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className={`rounded-full border px-3 py-1 font-body text-[13px] ${status === k ? "border-ink bg-ink text-white" : "border-glass-border bg-glass text-ink"}`}
            >
              {v}
            </button>
          ))}
          <label className="relative ml-auto flex min-w-[220px] flex-1 items-center sm:max-w-xs">
            <Search className="absolute left-3 h-4 w-4 text-ink-faint" />
            <input
              id="flow-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari flow: physio, foto, ulang tahun…"
              className="h-9 w-full rounded-sm border border-glass-border bg-glass pl-9 pr-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
            />
          </label>
        </div>
      </div>

      {flows.length === 0 && !error && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-16 text-center">
          <GitBranch className="h-8 w-8 text-ink-faint" />
          <p className="max-w-md font-body text-[14px] text-ink-soft">Belum ada flow. Muat 60 flow dari blueprint 360 atau buat flow baru.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.k} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3 border-b-2 border-ink pb-1">
            <h2 className="font-display text-[20px] font-bold uppercase text-ink">{JOURNEYS[g.k]}</h2>
            <span className="font-body text-[12px] text-ink-soft">{g.items.length} flow</span>
          </div>
          <div className="overflow-x-auto rounded-card border border-glass-border">
            <table className="w-full min-w-[860px] font-body text-[13px]">
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2">Flow</th>
                  <th className="px-3 py-2">Pemicu</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Masuk</th>
                  <th className="px-3 py-2 text-right">Terkirim</th>
                  <th className="px-3 py-2 text-right">Open</th>
                  <th className="px-3 py-2 text-right">CTR</th>
                  <th className="px-3 py-2 text-right">Konversi</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((f) => (
                  <tr key={f.id} className="border-t border-glass-border hover:bg-glass">
                    <td className="px-3 py-2.5">
                      <Link href={`/flows/${f.id}`} className="flex flex-col">
                        <span className="text-ink">
                          <span className="mr-2 font-mono text-[12px] text-red">{f.id}</span>
                          <span className="font-semibold">{f.name}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-[12px] text-ink-soft">{f.description}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {TRIGGERS[f.trigger_kind]?.label ?? f.trigger_kind}
                      <span className="ml-2 inline-flex items-center gap-1 text-ink-faint"><Mail className="h-3 w-3" />{toNum(f.email_count)}</span>
                    </td>
                    <td className="px-3 py-2.5"><Badge tone={STATUS[f.status]?.tone ?? "neutral"}>{STATUS[f.status]?.label ?? f.status}</Badge></td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{toNum(f.entered).toLocaleString("id-ID")}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{toNum(f.sent).toLocaleString("id-ID")}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{pct(f.opened, f.sent)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{pct(f.clicked, f.sent)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {toNum(f.converted).toLocaleString("id-ID")} <span className="text-ink-faint">{pct(f.converted, f.entered)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
