"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Mail, Clock, GitBranch, Split, Square, Play, Pause, Save, Plus, Trash2, FlaskConical, Users, Send, Eye, RefreshCw, Settings2, Zap, X, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ATTR_FIELDS, JOURNEYS, LINES, LINE_LABEL, OUTCOME_LABEL, TRIGGERS, pct, toNum,
  type EnrollmentRow, type FlowDetail, type FlowGraph, type FlowNode, type FlowStats, type NodeStats, type Rule,
} from "@/lib/crm/flow/types";
import {
  getFlowAction, saveFlowAction, setFlowStatusAction, deleteFlowAction, previewAudienceAction, renderEmailPreviewAction,
  sendNodeTestAction, startTestRunAction, runTickAction, listEnrollmentsAction,
} from "../actions";

// ── helpers ──────────────────────────────────────────────────────────────────────────────────
const inputCls =
  "h-9 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";
const areaCls =
  "w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";
const labelCls = "font-body text-[12px] font-semibold text-ink-soft";
const fmt = (v: unknown) => toNum(v).toLocaleString("id-ID");
const rupiah = (v: unknown) => {
  const n = toNum(v);
  if (!n) return "Rp0";
  if (n >= 1e9) return `Rp${(n / 1e9).toFixed(2)} M`;
  if (n >= 1e6) return `Rp${(n / 1e6).toFixed(1)} jt`;
  return `Rp${Math.round(n / 1e3).toLocaleString("id-ID")} rb`;
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const when = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "–";

type Draft = {
  name: string;
  journey: string;
  description: string;
  priority: number;
  holdout_pct: number;
  goal: { lines?: string[]; days?: number; produk_like?: string; ctx_line?: boolean; exit_on_goal?: boolean };
  graph: FlowGraph;
};

type Slot = "start" | "next" | "yes" | "no" | "else" | `b${number}`;

function getSlot(graph: FlowGraph, parent: string, slot: Slot): string | null | undefined {
  if (parent === "__trigger") return graph.start;
  const n = graph.nodes[parent] as unknown as Record<string, unknown>;
  if (!n) return null;
  if (slot.startsWith("b")) return (n.branches as { next?: string | null }[])[Number(slot.slice(1))]?.next;
  return n[slot] as string | null | undefined;
}
function setSlot(graph: FlowGraph, parent: string, slot: Slot, value: string | null) {
  if (parent === "__trigger") { graph.start = value ?? ""; return; }
  const n = graph.nodes[parent] as unknown as Record<string, unknown>;
  if (slot.startsWith("b")) (n.branches as { next?: string | null }[])[Number(slot.slice(1))].next = value;
  else n[slot] = value;
}
function children(n: FlowNode | undefined): (string | null | undefined)[] {
  if (!n) return [];
  if (n.type === "email" || n.type === "wait") return [n.next];
  if (n.type === "condition") return [n.yes, n.no];
  if (n.type === "split") return [...n.branches.map((b) => b.next), n.else];
  return [];
}
function reachable(graph: FlowGraph, from: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = from ? [from] : [];
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id) || !graph.nodes[id]) continue;
    seen.add(id);
    out.push(id);
    for (const c of children(graph.nodes[id])) if (c) queue.push(c);
  }
  return out;
}
function prune(graph: FlowGraph): FlowGraph {
  const keep = new Set(reachable(graph, graph.start));
  const g = clone(graph);
  for (const k of Object.keys(g.nodes)) if (!keep.has(k)) delete g.nodes[k];
  return g;
}
function newId(graph: FlowGraph): string {
  let i = Object.keys(graph.nodes).length + 1;
  while (graph.nodes[`n${i}`]) i++;
  return `n${i}`;
}
function nodeTitle(n: FlowNode): string {
  switch (n.type) {
    case "email": return n.name || n.subject || "Email";
    case "wait": return `Tunggu ${[n.days ? `${n.days} hari` : "", n.hours ? `${n.hours} jam` : "", n.minutes ? `${n.minutes} menit` : ""].filter(Boolean).join(" ") || "0"}`;
    case "condition": return n.label || "Kondisi";
    case "split": return "Cabang";
    case "exit": return n.label || "Selesai";
  }
}
function ruleText(r: Rule | undefined, graph?: FlowGraph): string {
  if (!r) return "–";
  switch (r.kind) {
    case "opened": return `Membuka "${graph?.nodes[r.node] ? nodeTitle(graph.nodes[r.node]) : r.node}"`;
    case "clicked": return `Mengklik "${graph?.nodes[r.node] ? nodeTitle(graph.nodes[r.node]) : r.node}"`;
    case "purchased": return `Beli ${r.ctx_line ? "di lini yang sama" : r.lines?.length ? r.lines.map((l) => LINE_LABEL[l] ?? l).join("/") : "apa saja"}${r.produk_like ? ` (${r.produk_like})` : ""} sejak masuk${r.since_days ? ` − ${r.since_days} hari` : ""}`;
    case "attr": return `${ATTR_FIELDS[r.field]?.label ?? r.field} ${opLabel(r.op)} ${valText(r.value)}`;
    case "ctx": return `Konteks ${r.key} ${opLabel(r.op)} ${valText(r.value)}`;
    case "any": return r.rules.map((x) => ruleText(x, graph)).join(" ATAU ");
    case "all": return r.rules.map((x) => ruleText(x, graph)).join(" DAN ");
    case "not": return `BUKAN (${ruleText(r.rule, graph)})`;
  }
}
const OPS: Record<string, string> = {
  eq: "=", neq: "≠", in: "salah satu", nin: "bukan salah satu", gte: "≥", lte: "≤", gt: ">", lt: "<", null: "kosong", notnull: "terisi",
  like: "mirip", nlike: "tidak mirip", contains: "berisi", ncontains: "tidak berisi", empty: "kosong", true: "ya", false: "tidak",
};
const opLabel = (op: string) => OPS[op] ?? op;
const valText = (v: unknown) => (v == null || v === "" ? "" : Array.isArray(v) ? v.map((x) => LINE_LABEL[String(x)] ?? String(x)).join(", ") : typeof v === "boolean" ? (v ? "ya" : "tidak") : String(v));

function triggerSummary(t: FlowGraph["trigger"]): string {
  const def = TRIGGERS[t.kind];
  const bits = (def?.params ?? [])
    .map((p) => {
      const v = t[p.key];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
      return `${p.label.replace(/ \(.*\)$/, "")}: ${valText(v)}`;
    })
    .filter(Boolean);
  return [def?.label ?? t.kind, ...bits].join(" · ");
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────
export function FlowBuilder({ initial, canActivate, userEmail }: { initial: FlowDetail; canActivate: boolean; userEmail: string | null }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => ({
    name: initial.flow.name,
    journey: initial.flow.journey,
    description: initial.flow.description ?? "",
    priority: initial.flow.priority,
    holdout_pct: initial.flow.holdout_pct,
    goal: initial.flow.goal ?? { lines: [], days: 14 },
    graph: clone(initial.flow.graph),
  }));
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<string>("__trigger");
  const [view, setView] = useState<"real" | "test">("real");
  const [tab, setTab] = useState<"people" | "history">("people");
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "green" | "red" | "amber" | "blue"; text: string; list?: string[] } | null>(null);
  const [insertAt, setInsertAt] = useState<{ parent: string; slot: Slot } | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<{ count: number | null; loading: boolean } | null>(null);
  const [people, setPeople] = useState<EnrollmentRow[] | null>(null);
  const testEmail = userEmail && /@20fit\.id$/i.test(userEmail) ? userEmail : "luthfi@20fit.id";

  const flow = detail.flow;
  const stats: FlowStats = view === "real" ? detail.stats : detail.testStats;

  const update = useCallback((fn: (d: Draft) => void) => {
    setDraft((d) => {
      const n = clone(d);
      fn(n);
      return n;
    });
    setDirty(true);
  }, []);
  const updateGraph = useCallback((fn: (g: FlowGraph) => void) => update((d) => fn(d.graph)), [update]);

  const refresh = useCallback(async () => {
    const r = await getFlowAction(flow.id);
    if (r.ok) setDetail(r.detail);
    const p = await listEnrollmentsAction(flow.id, view === "test");
    if (p.ok) setPeople(p.rows);
  }, [flow.id, view]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Test runs move fast (1 day = 1 minute): poll while a test enrollment is active.
  const testActive = toNum(detail.testStats.totals.active) > 0;
  useEffect(() => {
    if (view !== "test" || !testActive) return;
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [view, testActive, refresh]);

  function save(after?: () => void) {
    start(async () => {
      const graph = prune(draft.graph);
      const r = await saveFlowAction({ id: flow.id, name: draft.name, journey: draft.journey, description: draft.description || null, priority: Number(draft.priority), holdout_pct: Number(draft.holdout_pct), goal: draft.goal, graph });
      if (!r.ok) {
        setNotice({ tone: "red", text: r.error, list: r.errors });
        return;
      }
      setDirty(false);
      setDraft((d) => ({ ...d, graph }));
      setNotice({ tone: r.warnings.length ? "amber" : "green", text: `Tersimpan (versi ${r.version}).`, list: r.warnings });
      await refresh();
      after?.();
    });
  }

  function setStatus(status: "draft" | "active" | "paused") {
    start(async () => {
      const r = await setFlowStatusAction(flow.id, status);
      setConfirmActivate(null);
      if (!r.ok) setNotice({ tone: "red", text: r.error, list: r.errors });
      else setNotice({ tone: "green", text: status === "active" ? "Flow aktif. Peserta baru masuk dalam ±5 menit." : status === "paused" ? "Flow dijeda. Peserta berhenti di posisinya." : "Flow kembali ke Draft." });
      await refresh();
      router.refresh();
    });
  }

  function askActivate() {
    if (dirty) { setNotice({ tone: "amber", text: "Simpan perubahan dulu sebelum mengaktifkan." }); return; }
    setConfirmActivate({ count: null, loading: true });
    start(async () => {
      const r = await previewAudienceAction(flow.id, draft.graph);
      setConfirmActivate({ count: r.ok ? r.count : null, loading: false });
    });
  }

  function runTest() {
    const go = () =>
      start(async () => {
        const r = await startTestRunAction(flow.id, testEmail);
        if (!r.ok) { setNotice({ tone: "red", text: r.error }); return; }
        setView("test");
        setNotice({ tone: "blue", text: `Uji dimulai ke ${testEmail}${r.profil ? ` dengan profil ${r.profil}` : ""}. Waktu tunggu dipercepat: 1 hari = 1 menit. Terkirim ${r.tick.sent} email.` });
        await refresh();
      });
    if (dirty) save(go);
    else go();
  }

  function tickNow() {
    start(async () => {
      const r = await runTickAction();
      if (!r.ok) setNotice({ tone: "red", text: r.error });
      else setNotice({ tone: "blue", text: `Tick: ${r.tick.advanced} peserta maju, ${r.tick.sent} email terkirim${r.tick.errors.length ? `, ${r.tick.errors.length} catatan` : ""}.`, list: r.tick.errors });
      await refresh();
    });
  }

  function insertNode(type: FlowNode["type"]) {
    if (!insertAt) return;
    const { parent, slot } = insertAt;
    updateGraph((g) => {
      const id = newId(g);
      const target = getSlot(g, parent, slot) ?? null;
      let node: FlowNode;
      if (type === "email") node = { type: "email", name: "Email baru", subject: "", preheader: "", headline: "", body: "", cta_label: "", cta_url: "https://20fit.id", next: target };
      else if (type === "wait") node = { type: "wait", days: 1, next: target };
      else if (type === "condition") node = { type: "condition", label: "Sudah beli?", rule: { kind: "purchased", lines: [] }, yes: target, no: target };
      else if (type === "split") node = { type: "split", branches: [{ label: "Cabang 1", rule: { kind: "attr", field: "gender", op: "eq", value: "Perempuan" }, next: target }], else_label: "Lainnya", else: target };
      else node = { type: "exit", label: "Selesai" };
      g.nodes[id] = node;
      setSlot(g, parent, slot, id);
      setSel(id);
    });
    setInsertAt(null);
  }

  function deleteNode(id: string) {
    updateGraph((g) => {
      const n = g.nodes[id];
      if (!n) return;
      const repl = n.type === "email" || n.type === "wait" ? n.next ?? null : n.type === "condition" ? n.yes ?? n.no ?? null : n.type === "split" ? n.branches[0]?.next ?? n.else ?? null : null;
      if (g.start === id) g.start = repl ?? "";
      for (const [pid, p] of Object.entries(g.nodes)) {
        if (pid === id) continue;
        const pp = p as unknown as Record<string, unknown>;
        for (const k of ["next", "yes", "no", "else"]) if (pp[k] === id) pp[k] = repl;
        if (p.type === "split") for (const b of p.branches) if (b.next === id) b.next = repl;
      }
      delete g.nodes[id];
      if (!g.start || !g.nodes[g.start]) {
        const x = newId(g);
        g.nodes[x] = { type: "exit", label: "Selesai" };
        g.start = x;
      }
      const keep = new Set(reachable(g, g.start));
      for (const k of Object.keys(g.nodes)) if (!keep.has(k)) delete g.nodes[k];
    });
    setSel("__trigger");
  }

  const t = stats.totals;
  const emailAgg = useMemo(() => {
    let sent = 0, opened = 0, clicked = 0, bounced = 0, unsub = 0;
    for (const [id, s] of Object.entries(stats.nodes)) {
      if (draft.graph.nodes[id]?.type !== "email" && s.kind !== "email") continue;
      sent += toNum(s.sent); opened += toNum(s.opened); clicked += toNum(s.clicked); bounced += toNum(s.bounced); unsub += toNum(s.unsubscribed);
    }
    return { sent, opened, clicked, bounced, unsub };
  }, [stats, draft.graph.nodes]);
  const convT = toNum(t.entered) ? toNum(t.converted) / toNum(t.entered) : 0;
  const convH = toNum(t.holdout) ? toNum(t.converted_holdout) / toNum(t.holdout) : null;
  const lift = convH != null && convH > 0 ? ((convT - convH) / convH) * 100 : null;

  const status = flow.status;
  const statusBadge = status === "active" ? <Badge tone="green">Aktif</Badge> : status === "paused" ? <Badge tone="amber">Dijeda</Badge> : <Badge>Draft</Badge>;

  return (
    <div className="flex flex-col gap-5">
      {/* header */}
      <div className="flex flex-col gap-3">
        <Link href="/flows" className="inline-flex items-center gap-1 font-body text-[13px] text-ink-soft hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Semua flow</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] text-red">{flow.id}</span>
              {statusBadge}
              <span className="font-mono text-[11px] text-ink-faint">v{flow.version} · {JOURNEYS[draft.journey] ?? draft.journey}</span>
              {dirty && <Badge tone="amber">Belum disimpan</Badge>}
            </div>
            <input
              id="flow-name"
              aria-label="Nama flow"
              value={draft.name}
              onChange={(e) => update((d) => { d.name = e.target.value; })}
              className="w-full min-w-0 bg-transparent font-display text-[28px] font-black uppercase leading-none text-ink focus:outline-none sm:min-w-[420px]"
            />
            {draft.description && <p className="max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">{draft.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSel("__settings")}><Settings2 /> Pengaturan</Button>
            <Button variant={dirty ? "primary" : "secondary"} size="sm" onClick={() => save()} disabled={busy || !dirty}><Save /> Simpan</Button>
            {canActivate && <Button variant="secondary" size="sm" onClick={runTest} disabled={busy} title={`Kirim uji ke ${testEmail}`}><FlaskConical /> Uji ke {testEmail.split("@")[0]}</Button>}
            {canActivate && status !== "active" && <Button size="sm" onClick={askActivate} disabled={busy}><Play /> Aktifkan</Button>}
            {canActivate && status === "active" && <Button variant="secondary" size="sm" onClick={() => setStatus("paused")} disabled={busy}><Pause /> Jeda</Button>}
          </div>
        </div>
      </div>

      {notice && (
        <div className={`tint-${notice.tone} flex items-start justify-between gap-3 rounded-card p-3 font-body text-[13px]`}>
          <div>
            <div>{notice.text}</div>
            {notice.list && notice.list.length > 0 && <ul className="mt-1 list-disc pl-5">{notice.list.map((x) => <li key={x}>{x}</li>)}</ul>}
          </div>
          <button type="button" aria-label="Tutup" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button>
        </div>
      )}
      {(detail.validation.errs.length > 0 || detail.validation.warn.length > 0) && !dirty && (
        <div className="tint-amber rounded-card p-3 font-body text-[13px]">
          <b>Cek sebelum aktif:</b>
          <ul className="mt-1 list-disc pl-5">{[...detail.validation.errs, ...detail.validation.warn].map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}

      {/* KPI */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-glass-border bg-glass p-0.5">
            {(["real", "test"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-3 py-1 font-body text-[12px] ${view === v ? "bg-ink text-white" : "text-ink-soft"}`}>
                {v === "real" ? "Data nyata" : "Data uji"}
              </button>
            ))}
          </div>
          <span className="font-body text-[12px] text-ink-faint">
            {view === "real" ? `Tick terakhir ${when(flow.last_tick_at)} · aktif sejak ${when(flow.activated_at)}` : "Hanya peserta uji (alamat @20fit.id)"}
          </span>
          {canActivate && <Button variant="ghost" size="sm" onClick={tickNow} disabled={busy}><RefreshCw /> Jalankan sekarang</Button>}
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-glass-border bg-glass-border sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["Masuk", fmt(t.entered), `kontrol ${fmt(t.holdout)}`],
            ["Sedang berjalan", fmt(t.active), `selesai ${fmt(t.finished)}`],
            ["Email terkirim", fmt(emailAgg.sent), `bounce ${fmt(emailAgg.bounced)}`],
            ["Open rate", pct(emailAgg.opened, emailAgg.sent), `${fmt(emailAgg.opened)} dibuka`],
            ["CTR", pct(emailAgg.clicked, emailAgg.sent), `${fmt(emailAgg.clicked)} klik`],
            ["Konversi", pct(t.converted, t.entered), `${fmt(t.converted)} orang`],
            ["Lift vs kontrol", lift == null ? "–" : `${lift >= 0 ? "+" : ""}${lift.toFixed(0)}%`, convH == null ? "kontrol belum ada" : `kontrol ${pct(t.converted_holdout, t.holdout)}`],
            ["Pendapatan", rupiah(t.revenue), `unsub ${fmt(emailAgg.unsub)}`],
          ].map(([l, v, s]) => (
            <div key={l} className="card flex min-w-0 flex-col gap-0.5 p-3">
              <span className="font-display text-[22px] font-bold leading-none text-ink">{v}</span>
              <span className="font-body text-[12px] text-ink-soft">{l}</span>
              <span className="truncate font-mono text-[10.5px] text-ink-faint">{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* canvas + panel */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 overflow-x-auto rounded-card border border-glass-border bg-glass p-6">
          <Canvas graph={draft.graph} stats={stats} sel={sel} onSelect={setSel} onInsert={(parent, slot) => setInsertAt({ parent, slot })} trigger={draft.graph.trigger} />
        </div>
        <div className="min-w-0">
          <div className="card sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-y-auto rounded-card border border-glass-border p-4">
            {sel === "__trigger" && <TriggerPanel graph={draft.graph} onChange={updateGraph} flowId={flow.id} />}
            {sel === "__settings" && (
              <SettingsPanel draft={draft} update={update} canDelete={canActivate && status !== "active"} onDelete={() => start(async () => {
                const r = await deleteFlowAction(flow.id);
                if (r.ok) router.push("/flows");
                else setNotice({ tone: "red", text: r.error });
              })} />
            )}
            {draft.graph.nodes[sel] && (
              <NodePanel
                id={sel}
                node={draft.graph.nodes[sel]}
                graph={draft.graph}
                stats={stats.nodes[sel]}
                flowId={flow.id}
                canSend={canActivate}
                testEmail={testEmail}
                onChange={(fn) => updateGraph((g) => fn(g.nodes[sel]))}
                onDelete={() => deleteNode(sel)}
              />
            )}
          </div>
        </div>
      </div>

      {/* people / history */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("people")} className={`rounded-full border px-3 py-1 font-body text-[13px] ${tab === "people" ? "border-ink bg-ink text-white" : "border-glass-border bg-glass text-ink"}`}>
            <Users className="mr-1 inline h-3.5 w-3.5" /> Peserta {view === "test" ? "uji" : ""}
          </button>
          <button type="button" onClick={() => setTab("history")} className={`rounded-full border px-3 py-1 font-body text-[13px] ${tab === "history" ? "border-ink bg-ink text-white" : "border-glass-border bg-glass text-ink"}`}>
            Riwayat versi
          </button>
        </div>
        {tab === "people" && <PeopleTable rows={people} graph={draft.graph} />}
        {tab === "history" && (
          <div className="overflow-x-auto rounded-card border border-glass-border">
            <table className="w-full font-body text-[13px]">
              <thead><tr className="text-left font-mono text-[11px] uppercase text-ink-faint"><th className="px-3 py-2">Versi</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Oleh</th><th className="px-3 py-2">Waktu</th><th className="px-3 py-2">Catatan</th></tr></thead>
              <tbody>{detail.history.map((h, i) => <tr key={i} className="border-t border-glass-border"><td className="px-3 py-2 font-mono">v{h.version}</td><td className="px-3 py-2">{h.status}</td><td className="px-3 py-2">{h.changed_by ?? "–"}</td><td className="px-3 py-2">{when(h.changed_at)}</td><td className="px-3 py-2 text-ink-soft">{h.note}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* insert menu */}
      {insertAt && (
        <Modal title="Tambah langkah" onClose={() => setInsertAt(null)}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              ["email", Mail, "Email", "Kirim email (open, klik, konversi terlacak)"],
              ["wait", Clock, "Tunggu", "Jeda N hari/jam sebelum langkah berikutnya"],
              ["condition", GitBranch, "Kondisi Ya/Tidak", "Dibuka? diklik? sudah beli? atribut?"],
              ["split", Split, "Cabang IF / ELSE IF / ELSE", "Beberapa jalur sesuai aturan, berurutan"],
              ["exit", Square, "Keluar", "Akhiri flow untuk orang ini"],
            ] as const).map(([type, Icon, title, hint]) => (
              <button key={type} type="button" onClick={() => insertNode(type)} className="flex items-start gap-3 rounded-card border border-glass-border bg-glass p-3 text-left hover:border-red">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-red" />
                <span><span className="block font-body text-[14px] font-semibold text-ink">{title}</span><span className="block font-body text-[12px] text-ink-soft">{hint}</span></span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {confirmActivate && (
        <Modal title="Aktifkan flow?" onClose={() => setConfirmActivate(null)}>
          <div className="flex flex-col gap-3 font-body text-[14px] text-ink">
            <p>
              {confirmActivate.loading
                ? "Menghitung audiens…"
                : confirmActivate.count == null
                  ? "Audiens tidak bisa dihitung."
                  : <>Saat ini <b>{fmt(confirmActivate.count)} orang</b> cocok dengan pemicu. Mereka mulai masuk dalam ±5 menit{draft.graph.trigger.daily_cap ? `, maksimal ${fmt(draft.graph.trigger.daily_cap)} orang per hari` : ""}, dan email nyata dikirim ke customer.</>}
            </p>
            <p className="text-[13px] text-ink-soft">Pengaman tetap berlaku: berhenti langganan, maks 1 email marketing/hari & 3/minggu per orang, jam kirim 07–20 WIB, grup kontrol {draft.holdout_pct}%.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmActivate(null)}>Batal</Button>
              <Button onClick={() => setStatus("active")} disabled={busy || confirmActivate.loading}><Zap /> Aktifkan sekarang</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── canvas ───────────────────────────────────────────────────────────────────────────────────
function Canvas({ graph, stats, sel, onSelect, onInsert, trigger }: {
  graph: FlowGraph; stats: FlowStats; sel: string; onSelect: (id: string) => void; onInsert: (parent: string, slot: Slot) => void; trigger: FlowGraph["trigger"];
}) {
  const rendered = new Set<string>();

  const findJoin = (targets: (string | null | undefined)[]): string | null => {
    if (targets.some((x) => !x)) return null;
    const lists = targets.map((x) => reachable(graph, x));
    const sets = lists.slice(1).map((l) => new Set(l));
    for (const id of lists[0]) if (sets.every((s) => s.has(id))) return id;
    return null;
  };

  const renderFrom = (start: string | null | undefined, stop: string | null, parent: string, slot: Slot): JSX.Element[] => {
    const out: JSX.Element[] = [];
    let cur = start;
    let p = parent;
    let s: Slot = slot;
    if (!cur) {
      out.push(<EmptyEnd key={`e-${p}-${s}`} onAdd={() => onInsert(p, s)} />);
      return out;
    }
    while (cur && cur !== stop) {
      if (rendered.has(cur)) {
        const target = graph.nodes[cur];
        out.push(<GotoPill key={`g-${p}-${s}-${cur}`} label={target ? nodeTitle(target) : cur} onClick={() => onSelect(cur as string)} />);
        return out;
      }
      const id: string = cur;
      rendered.add(id);
      const n: FlowNode | undefined = graph.nodes[id];
      if (!n) break;
      out.push(<NodeCard key={id} id={id} node={n} graph={graph} stats={stats.nodes[id]} selected={sel === id} onClick={() => onSelect(id)} />);
      if (n.type === "email" || n.type === "wait") {
        out.push(<Connector key={`c-${id}`} onAdd={() => onInsert(id, "next")} />);
        if (!n.next) { out.push(<EmptyEnd key={`end-${id}`} onAdd={() => onInsert(id, "next")} />); return out; }
        p = id; s = "next"; cur = n.next;
        continue;
      }
      if (n.type === "exit") return out;
      const branches: { label: string; tone: "green" | "red" | "neutral"; target: string | null | undefined; slot: Slot; count?: number }[] =
        n.type === "condition"
          ? [
              { label: "Ya", tone: "green", target: n.yes, slot: "yes", count: stats.nodes[id]?.branches?.yes },
              { label: "Tidak", tone: "red", target: n.no, slot: "no", count: stats.nodes[id]?.branches?.no },
            ]
          : [
              ...n.branches.map((b: { label: string; next?: string | null }, i: number) => ({ label: b.label || `Cabang ${i + 1}`, tone: "neutral" as const, target: b.next, slot: `b${i}` as Slot, count: stats.nodes[id]?.branches?.[`branch:${b.label || "cabang"}`] })),
              { label: n.else_label || "Lainnya", tone: "neutral" as const, target: n.else, slot: "else" as Slot, count: stats.nodes[id]?.branches?.[`branch:${n.else_label || "Lainnya"}`] },
            ];
      const join = findJoin(branches.map((b) => b.target));
      out.push(
        <div key={`br-${id}`} className="flex flex-col items-center">
          <div className="h-5 w-px bg-ink-faint" />
          <div className="flex items-start gap-6">
            {branches.map((b, i) => (
              <div key={i} className="relative flex flex-col items-center">
                <div className="absolute left-0 right-0 top-0 flex">
                  <div className={`h-px flex-1 ${i === 0 ? "bg-transparent" : "bg-ink-faint"}`} />
                  <div className={`h-px flex-1 ${i === branches.length - 1 ? "bg-transparent" : "bg-ink-faint"}`} />
                </div>
                <div className="h-4 w-px bg-ink-faint" />
                <span className={`rounded-full px-2.5 py-0.5 font-body text-[12px] font-semibold ${b.tone === "green" ? "tint-green" : b.tone === "red" ? "tint-red" : "tint-neutral"}`}>
                  {b.label}{b.count != null ? ` · ${fmt(b.count)}` : ""}
                </span>
                <Connector onAdd={() => onInsert(id, b.slot)} />
                {b.target === join && join ? <div className="h-2" /> : renderFrom(b.target, join, id, b.slot)}
              </div>
            ))}
          </div>
        </div>,
      );
      if (!join) return out;
      out.push(<div key={`j-${id}`} className="h-6 w-px bg-ink-faint" />);
      p = id; s = branches[0].slot; cur = join;
    }
    return out;
  };

  return (
    <div className="flex min-w-max flex-col items-center">
      <button
        type="button"
        onClick={() => onSelect("__trigger")}
        className={`card flex w-[420px] max-w-full flex-col gap-2 rounded-card border-2 p-4 text-left ${sel === "__trigger" ? "border-red" : "border-glass-border"}`}
      >
        <span className="flex items-center gap-2 font-display text-[16px] font-bold uppercase text-ink"><Play className="h-4 w-4 text-red" /> Masuk</span>
        <span className="font-body text-[13px] text-ink">{triggerSummary(trigger)}</span>
        <span className="font-body text-[12px] text-ink-soft">
          Audiens: {trigger.audience?.length ? trigger.audience.map((r) => ruleText(r as Rule, graph)).join(" · ") : "semua yang bisa dihubungi"}
          {trigger.exclude_b2b === false ? "" : " · tanpa B2B"}
          {trigger.daily_cap ? ` · maks ${fmt(trigger.daily_cap)}/hari` : ""}
        </span>
      </button>
      <Connector onAdd={() => onInsert("__trigger", "start")} />
      {renderFrom(graph.start, null, "__trigger", "start")}
    </div>
  );
}

function Connector({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="group flex flex-col items-center">
      <div className="h-3 w-px bg-ink-faint" />
      <button type="button" onClick={onAdd} aria-label="Tambah langkah" className="flex h-5 w-5 items-center justify-center rounded-full border border-glass-border bg-glass text-ink-faint opacity-60 hover:border-red hover:text-red group-hover:opacity-100">
        <Plus className="h-3 w-3" />
      </button>
      <div className="h-3 w-px bg-ink-faint" />
    </div>
  );
}
function EmptyEnd({ onAdd }: { onAdd: () => void }) {
  return (
    <button type="button" onClick={onAdd} className="rounded-sm border border-dashed border-glass-border px-3 py-1.5 font-body text-[12px] text-ink-faint hover:border-red hover:text-red">
      + tambah langkah
    </button>
  );
}
function GotoPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tint-blue rounded-full px-3 py-1 font-body text-[12px]">
      → lanjut ke: {label}
    </button>
  );
}

function NodeCard({ id, node, graph, stats, selected, onClick }: { id: string; node: FlowNode; graph: FlowGraph; stats?: NodeStats; selected: boolean; onClick: () => void }) {
  const Icon = node.type === "email" ? Mail : node.type === "wait" ? Clock : node.type === "condition" ? GitBranch : node.type === "split" ? Split : Square;
  const iconTone = node.type === "email" ? "tint-green" : node.type === "wait" ? "tint-blue" : node.type === "exit" ? "tint-red" : "tint-amber";
  const sub =
    node.type === "email" ? node.subject
      : node.type === "condition" ? ruleText(node.rule, graph)
      : node.type === "split" ? node.branches.map((b) => `${b.label}: ${ruleText(b.rule, graph)}`).join(" · ")
      : node.type === "exit" ? `Keluar`
      : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card flex w-[300px] max-w-full flex-col gap-1.5 rounded-card border-2 p-3 text-left transition-colors ${selected ? "border-red" : "border-glass-border hover:border-ink-faint"}`}
    >
      <span className="flex items-center gap-2">
        <span className={`${iconTone} flex h-7 w-7 shrink-0 items-center justify-center rounded-sm`}><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-body text-[14px] font-semibold text-ink">{nodeTitle(node)}</span>
          {sub && <span className="block truncate font-body text-[11.5px] text-ink-soft">{sub}</span>}
        </span>
        <span className="font-mono text-[10px] text-ink-faint">{id}</span>
      </span>
      {node.type === "email" && (
        <span className="grid grid-cols-4 gap-1 border-t border-glass-border pt-1.5 font-mono text-[11px] tabular-nums text-ink-soft">
          <span title="Terkirim"><b className="block text-ink">{fmt(stats?.sent)}</b>kirim</span>
          <span title="Open rate"><b className="block text-ink">{pct(stats?.opened, stats?.sent)}</b>open</span>
          <span title="Click-through rate"><b className="block text-ink">{pct(stats?.clicked, stats?.sent)}</b>CTR</span>
          <span title="Konversi setelah email ini"><b className="block text-ink">{fmt(stats?.conv)}</b>konv</span>
        </span>
      )}
      {node.type === "email" && (node.requires_promo && !node.promo_code) && <span className="tint-amber self-start rounded-full px-2 py-0.5 font-body text-[11px]">butuh kode promo</span>}
      {node.type === "email" && node.transactional && <span className="tint-blue self-start rounded-full px-2 py-0.5 font-body text-[11px]">transaksional</span>}
      {node.type !== "email" && stats && (
        <span className="font-mono text-[11px] text-ink-soft">{fmt(stats.reached)} orang melewati</span>
      )}
    </button>
  );
}

// ── panels ───────────────────────────────────────────────────────────────────────────────────
function PanelTitle({ icon: Icon, title, hint }: { icon: typeof Mail; title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2 font-display text-[18px] font-bold uppercase text-ink"><Icon className="h-4 w-4 text-red" /> {title}</span>
      {hint && <span className="font-body text-[12px] text-ink-soft">{hint}</span>}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className={labelCls}>{label}</span>{children}</label>;
}
function LinesPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {LINES.map((l) => {
        const on = value.includes(l);
        return (
          <button key={l} type="button" onClick={() => onChange(on ? value.filter((x) => x !== l) : [...value, l])}
            className={`rounded-full border px-2 py-0.5 font-body text-[11.5px] ${on ? "border-red bg-red text-white" : "border-glass-border bg-glass text-ink-soft"}`}>
            {LINE_LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}

function TriggerPanel({ graph, onChange, flowId }: { graph: FlowGraph; onChange: (fn: (g: FlowGraph) => void) => void; flowId: string }) {
  const t = graph.trigger;
  const def = TRIGGERS[t.kind];
  const [prev, setPrev] = useState<{ count: number; sample: { email: string; nama: string | null; ref: string }[] } | string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <PanelTitle icon={Play} title="Pemicu & audiens" hint="Siapa yang masuk flow ini, dan kapan." />
      <Field label="Jenis pemicu">
        <select id="trigger-kind" className={inputCls} value={t.kind} onChange={(e) => onChange((g) => { g.trigger = { kind: e.target.value, audience: g.trigger.audience, cooldown_days: g.trigger.cooldown_days, daily_cap: g.trigger.daily_cap, exclude_b2b: g.trigger.exclude_b2b }; })}>
          {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>
      {def && <p className="font-body text-[12px] text-ink-soft">{def.hint}</p>}
      {def?.params.map((p) => (
        <Field key={p.key} label={p.label}>
          {p.type === "lines" ? (
            <LinesPicker value={(t[p.key] as string[]) ?? []} onChange={(v) => onChange((g) => { g.trigger[p.key] = v; })} />
          ) : p.type === "select" ? (
            <select id={`trigger-${p.key}`} className={inputCls} value={String(t[p.key] ?? "")} onChange={(e) => onChange((g) => { const v = e.target.value; g.trigger[p.key] = v === "true" ? true : v === "false" ? false : v || undefined; })}>
              {(p.options ?? []).map((o) => <option key={o} value={o}>{o === "" ? "(semua)" : o === "true" ? "ya" : o === "false" ? "tidak" : o}</option>)}
            </select>
          ) : (
            <input id={`trigger-${p.key}`} className={inputCls} type={p.type === "number" ? "number" : "text"} value={String(t[p.key] ?? "")}
              onChange={(e) => onChange((g) => { g.trigger[p.key] = p.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value || undefined; })} />
          )}
        </Field>
      ))}
      <div className="flex flex-col gap-2 border-t border-glass-border pt-3">
        <span className={labelCls}>Audiens (semua aturan harus cocok)</span>
        {(t.audience ?? []).map((r, i) => (
          <div key={i} className="flex items-start gap-1">
            <div className="min-w-0 flex-1"><RuleEditor rule={r as Rule} graph={graph} onChange={(nr) => onChange((g) => { (g.trigger.audience as Rule[])[i] = nr; })} attrOnly /></div>
            <button type="button" aria-label="Hapus aturan" onClick={() => onChange((g) => { g.trigger.audience = (g.trigger.audience ?? []).filter((_, j) => j !== i); })} className="mt-1 text-ink-faint hover:text-red"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => onChange((g) => { g.trigger.audience = [...(g.trigger.audience ?? []), { kind: "attr", field: "status_pembeli", op: "eq", value: "Active" }]; })}><Plus /> Tambah aturan audiens</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-glass-border pt-3">
        <Field label="Jeda masuk ulang (hari)"><input id="trigger-cooldown" className={inputCls} type="number" value={t.cooldown_days ?? 7} onChange={(e) => onChange((g) => { g.trigger.cooldown_days = Number(e.target.value); })} /></Field>
        <Field label="Maks orang baru/hari"><input id="trigger-cap" className={inputCls} type="number" value={t.daily_cap ?? ""} placeholder="tanpa batas" onChange={(e) => onChange((g) => { g.trigger.daily_cap = e.target.value ? Number(e.target.value) : undefined; })} /></Field>
      </div>
      <label className="flex items-center gap-2 font-body text-[13px] text-ink">
        <input id="trigger-b2b" type="checkbox" checked={t.exclude_b2b !== false} onChange={(e) => onChange((g) => { g.trigger.exclude_b2b = e.target.checked; })} /> Kecualikan kontak B2B (G07)
      </label>
      <div className="flex flex-col gap-2 border-t border-glass-border pt-3">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => start(async () => {
          const r = await previewAudienceAction(flowId, graph);
          setPrev(r.ok ? { count: r.count, sample: r.sample } : r.error);
        })}><Eye /> Hitung audiens sekarang</Button>
        {typeof prev === "string" && <p className="font-body text-[12px] text-red">{prev}</p>}
        {prev && typeof prev === "object" && (
          <div className="font-body text-[12.5px] text-ink">
            <b>{fmt(prev.count)}</b> orang cocok saat ini (belum masuk flow).
            <ul className="mt-1 text-[12px] text-ink-soft">{prev.sample.map((s, i) => <li key={i}>{s.nama ?? "–"} · {s.email}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ draft, update, canDelete, onDelete }: {
  draft: Draft;
  update: (fn: (d: Draft) => void) => void; canDelete: boolean; onDelete: () => void;
}) {
  const up = update;
  const [sure, setSure] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <PanelTitle icon={Settings2} title="Pengaturan flow" />
      <Field label="Journey">
        <select id="flow-journey" className={inputCls} value={draft.journey} onChange={(e) => up((d) => { d.journey = e.target.value; })}>
          {Object.entries(JOURNEYS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
        </select>
      </Field>
      <Field label="Deskripsi"><textarea id="flow-desc" className={areaCls} rows={3} value={draft.description} onChange={(e) => up((d) => { d.description = e.target.value; })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prioritas (G03, makin besar didahulukan)"><input id="flow-priority" className={inputCls} type="number" value={draft.priority} onChange={(e) => up((d) => { d.priority = Number(e.target.value); })} /></Field>
        <Field label="Grup kontrol % (G10)"><input id="flow-holdout" className={inputCls} type="number" min={0} max={50} value={draft.holdout_pct} onChange={(e) => up((d) => { d.holdout_pct = Number(e.target.value); })} /></Field>
      </div>
      <div className="flex flex-col gap-2 border-t border-glass-border pt-3">
        <PanelTitle icon={Target} title="Tujuan konversi" hint="Pembayaran lunas yang dihitung sebagai hasil flow." />
        <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id="goal-ctx" type="checkbox" checked={!!draft.goal.ctx_line} onChange={(e) => up((d) => { d.goal.ctx_line = e.target.checked; })} /> Lini yang sama dengan pemicu</label>
        {!draft.goal.ctx_line && <Field label="Lini (kosong = pembelian apa saja)"><LinesPicker value={draft.goal.lines ?? []} onChange={(v) => up((d) => { d.goal.lines = v; })} /></Field>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Dalam N hari"><input id="goal-days" className={inputCls} type="number" value={draft.goal.days ?? 14} onChange={(e) => up((d) => { d.goal.days = Number(e.target.value); })} /></Field>
          <Field label="Produk mirip (pakai %)"><input id="goal-produk" className={inputCls} value={draft.goal.produk_like ?? ""} onChange={(e) => up((d) => { d.goal.produk_like = e.target.value || undefined; })} /></Field>
        </div>
        <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id="goal-exit" type="checkbox" checked={draft.goal.exit_on_goal !== false} onChange={(e) => up((d) => { d.goal.exit_on_goal = e.target.checked; })} /> Keluarkan dari flow begitu tujuan tercapai</label>
      </div>
      {canDelete && (
        <div className="flex flex-col gap-2 border-t border-glass-border pt-3">
          {!sure ? <Button variant="outline" size="sm" onClick={() => setSure(true)}><Trash2 /> Hapus flow</Button> : (
            <div className="tint-red flex flex-col gap-2 rounded-card p-3 font-body text-[13px]">
              Hapus flow ini? Hanya bisa kalau belum pernah punya peserta nyata.
              <div className="flex gap-2"><Button size="sm" onClick={onDelete}>Ya, hapus</Button><Button size="sm" variant="secondary" onClick={() => setSure(false)}>Batal</Button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NodePanel({ id, node, graph, stats, flowId, canSend, testEmail, onChange, onDelete }: {
  id: string; node: FlowNode; graph: FlowGraph; stats?: NodeStats; flowId: string; canSend: boolean; testEmail: string;
  onChange: (fn: (n: FlowNode) => void) => void; onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {node.type === "email" && <EmailPanel id={id} node={node} stats={stats} flowId={flowId} canSend={canSend} testEmail={testEmail} onChange={onChange} />}
      {node.type === "wait" && (
        <>
          <PanelTitle icon={Clock} title="Tunggu" hint="Mode uji mempercepat: 1 hari = 1 menit." />
          <div className="grid grid-cols-3 gap-2">
            {(["days", "hours", "minutes"] as const).map((k) => (
              <Field key={k} label={k === "days" ? "Hari" : k === "hours" ? "Jam" : "Menit"}>
                <input id={`wait-${k}`} className={inputCls} type="number" min={0} value={node[k] ?? 0} onChange={(e) => onChange((n) => { (n as unknown as Record<string, unknown>)[k] = Number(e.target.value); })} />
              </Field>
            ))}
          </div>
        </>
      )}
      {node.type === "condition" && (
        <>
          <PanelTitle icon={GitBranch} title="Kondisi Ya / Tidak" hint="Dicek saat orang tiba di langkah ini." />
          <Field label="Label"><input id="cond-label" className={inputCls} value={node.label ?? ""} onChange={(e) => onChange((n) => { (n as { label?: string }).label = e.target.value; })} /></Field>
          <RuleEditor rule={node.rule} graph={graph} onChange={(r) => onChange((n) => { (n as { rule: Rule }).rule = r; })} />
          {stats && <p className="font-body text-[12px] text-ink-soft">Ya {fmt(stats.branches?.yes)} · Tidak {fmt(stats.branches?.no)}</p>}
        </>
      )}
      {node.type === "split" && (
        <>
          <PanelTitle icon={Split} title="Cabang IF / ELSE IF / ELSE" hint="Aturan dicek berurutan; yang pertama cocok dipakai." />
          {node.branches.map((b, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-card border border-glass-border p-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-red">{i === 0 ? "IF" : "ELSE IF"}</span>
                <input id={`branch-label-${i}`} aria-label="Label cabang" className={inputCls} value={b.label} onChange={(e) => onChange((n) => { (n as { branches: { label: string }[] }).branches[i].label = e.target.value; })} />
                <button type="button" aria-label="Hapus cabang" className="text-ink-faint hover:text-red" onClick={() => onChange((n) => { const s = n as { branches: unknown[] }; s.branches = s.branches.filter((_, j) => j !== i); })}><Trash2 className="h-4 w-4" /></button>
              </div>
              <RuleEditor rule={b.rule} graph={graph} onChange={(r) => onChange((n) => { (n as { branches: { rule: Rule }[] }).branches[i].rule = r; })} />
              {stats && <span className="font-body text-[11.5px] text-ink-soft">{fmt(stats.branches?.[`branch:${b.label}`])} orang</span>}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => onChange((n) => { const s = n as { branches: { label: string; rule: Rule; next?: string | null }[]; else?: string | null }; s.branches.push({ label: `Cabang ${s.branches.length + 1}`, rule: { kind: "attr", field: "gender", op: "eq", value: "Perempuan" }, next: s.else ?? null }); })}><Plus /> Tambah ELSE IF</Button>
          <Field label="ELSE (label)"><input id="split-else" className={inputCls} value={node.else_label ?? ""} onChange={(e) => onChange((n) => { (n as { else_label?: string }).else_label = e.target.value; })} /></Field>
        </>
      )}
      {node.type === "exit" && (
        <>
          <PanelTitle icon={Square} title="Keluar" />
          <Field label="Label"><input id="exit-label" className={inputCls} value={node.label ?? ""} onChange={(e) => onChange((n) => { (n as { label?: string }).label = e.target.value; })} /></Field>
          {stats && <p className="font-body text-[12px] text-ink-soft">{fmt(stats.reached)} orang selesai di sini.</p>}
        </>
      )}
      <div className="border-t border-glass-border pt-3">
        <Button variant="outline" size="sm" onClick={onDelete}><Trash2 /> Hapus langkah ini</Button>
      </div>
    </div>
  );
}

function EmailPanel({ id, node, stats, flowId, canSend, testEmail, onChange }: {
  id: string; node: Extract<FlowNode, { type: "email" }>; stats?: NodeStats; flowId: string; canSend: boolean; testEmail: string; onChange: (fn: (n: FlowNode) => void) => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (k: string, v: unknown) => onChange((n) => { (n as unknown as Record<string, unknown>)[k] = v; });
  const content = node as unknown as Record<string, unknown>;
  return (
    <div className="flex flex-col gap-3">
      <PanelTitle icon={Mail} title="Email" hint="Variabel: {{first_name}} {{full_name}} {{city}} {{event}} {{produk}} {{jersey}} {{promo_code}}" />
      {stats && (
        <div className="grid grid-cols-3 gap-2 rounded-card border border-glass-border p-2 font-mono text-[11px] tabular-nums text-ink-soft">
          <span><b className="block text-[15px] text-ink">{fmt(stats.sent)}</b>terkirim</span>
          <span><b className="block text-[15px] text-ink">{pct(stats.opened, stats.sent)}</b>open</span>
          <span><b className="block text-[15px] text-ink">{pct(stats.clicked, stats.sent)}</b>CTR</span>
          <span><b className="block text-[15px] text-ink">{fmt(stats.conv)}</b>konversi</span>
          <span><b className="block text-[15px] text-ink">{rupiah(stats.conv_amount)}</b>nilai</span>
          <span><b className="block text-[15px] text-ink">{fmt(stats.bounced)}</b>bounce</span>
          {Object.entries(stats.skips ?? {}).map(([k, v]) => <span key={k} className="col-span-3 text-ink-faint">{OUTCOME_LABEL[k] ?? k}: {fmt(v)}</span>)}
        </div>
      )}
      <Field label="Nama langkah"><input id={`email-name-${id}`} className={inputCls} value={node.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Subjek"><input id={`email-subject-${id}`} className={inputCls} value={node.subject ?? ""} onChange={(e) => set("subject", e.target.value)} /></Field>
      <Field label="Preheader"><input id={`email-pre-${id}`} className={inputCls} value={node.preheader ?? ""} onChange={(e) => set("preheader", e.target.value)} /></Field>
      <Field label="Judul"><input id={`email-head-${id}`} className={inputCls} value={node.headline ?? ""} onChange={(e) => set("headline", e.target.value)} /></Field>
      <Field label="Isi (baris kosong = paragraf baru)"><textarea id={`email-body-${id}`} className={areaCls} rows={6} value={node.body ?? ""} onChange={(e) => set("body", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tombol"><input id={`email-cta-${id}`} className={inputCls} value={node.cta_label ?? ""} onChange={(e) => set("cta_label", e.target.value)} /></Field>
        <Field label="Kode promo"><input id={`email-promo-${id}`} className={inputCls} value={node.promo_code ?? ""} placeholder={node.requires_promo ? "wajib sebelum aktif" : "opsional"} onChange={(e) => set("promo_code", e.target.value)} /></Field>
      </div>
      <Field label="Link tombol (https://, UTM ditambahkan otomatis)"><input id={`email-url-${id}`} className={inputCls} value={node.cta_url ?? ""} onChange={(e) => set("cta_url", e.target.value)} /></Field>
      <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id={`email-req-${id}`} type="checkbox" checked={!!node.requires_promo} onChange={(e) => set("requires_promo", e.target.checked)} /> Wajib kode promo sebelum flow aktif (G11)</label>
      <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id={`email-tx-${id}`} type="checkbox" checked={!!node.transactional} onChange={(e) => set("transactional", e.target.checked)} /> Transaksional (tidak kena batas frekuensi & grup kontrol)</label>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => start(async () => { const r = await renderEmailPreviewAction(content, flowId, id); setHtml(r.ok ? r.html : null); setMsg(r.ok ? `Subjek: ${r.subject}` : r.error); })}><Eye /> Pratinjau</Button>
        {canSend && <Button variant="secondary" size="sm" disabled={busy} onClick={() => start(async () => { const r = await sendNodeTestAction(content, flowId, id, testEmail); setMsg(r.ok ? `Email uji terkirim ke ${r.to}` : r.error); })}><Send /> Kirim uji</Button>}
      </div>
      {msg && <p className="font-body text-[12px] text-ink-soft">{msg}</p>}
      {html && <iframe title="Pratinjau email" sandbox="" srcDoc={html} className="h-[520px] w-full rounded-sm border border-glass-border bg-white" />}
    </div>
  );
}

// ── rule editor ──────────────────────────────────────────────────────────────────────────────
function RuleEditor({ rule, graph, onChange, attrOnly }: { rule: Rule; graph: FlowGraph; onChange: (r: Rule) => void; attrOnly?: boolean }) {
  const [raw, setRaw] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(rule, null, 1));
  const emailNodes = Object.entries(graph.nodes).filter(([, n]) => n.type === "email");
  const kinds: [string, string][] = attrOnly
    ? [["attr", "Atribut customer"], ["any", "Salah satu dari"]]
    : [["purchased", "Sudah beli"], ["opened", "Membuka email"], ["clicked", "Mengklik email"], ["attr", "Atribut customer"], ["ctx", "Konteks pemicu"], ["any", "Salah satu dari (ATAU)"], ["all", "Semua dari (DAN)"], ["not", "Bukan"]];
  if (raw) {
    return (
      <div className="flex flex-col gap-1">
        <textarea aria-label="Aturan JSON" className={`${areaCls} font-mono text-[11.5px]`} rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => { try { onChange(JSON.parse(text) as Rule); setRaw(false); } catch { /* keep editing */ } }}>Pakai</Button>
          <Button size="sm" variant="ghost" onClick={() => setRaw(false)}>Batal</Button>
        </div>
      </div>
    );
  }
  const r = rule as Record<string, unknown>;
  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-glass-border p-2">
      <div className="flex items-center gap-1">
        <select aria-label="Jenis aturan" className={inputCls} value={rule.kind} onChange={(e) => {
          const k = e.target.value;
          onChange(
            k === "purchased" ? { kind: "purchased", lines: [] }
              : k === "opened" || k === "clicked" ? { kind: k, node: emailNodes[0]?.[0] ?? "" }
              : k === "attr" ? { kind: "attr", field: "status_pembeli", op: "eq", value: "Active" }
              : k === "ctx" ? { kind: "ctx", key: "line", op: "eq", value: "TICKET" }
              : k === "not" ? { kind: "not", rule: { kind: "purchased", lines: [] } }
              : { kind: k as "any" | "all", rules: [{ kind: "attr", field: "status_pembeli", op: "eq", value: "Active" }] },
          );
        }}>
          {kinds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="shrink-0 font-mono text-[10px] text-ink-faint hover:text-ink" onClick={() => { setText(JSON.stringify(rule, null, 1)); setRaw(true); }}>JSON</button>
      </div>
      {rule.kind === "purchased" && (
        <>
          <label className="flex items-center gap-2 font-body text-[12px] text-ink"><input type="checkbox" checked={!!rule.ctx_line} onChange={(e) => onChange({ ...rule, ctx_line: e.target.checked })} /> Lini yang sama dengan pemicu</label>
          {!rule.ctx_line && <LinesPicker value={rule.lines ?? []} onChange={(v) => onChange({ ...rule, lines: v })} />}
          <div className="grid grid-cols-2 gap-1">
            <input aria-label="Produk mirip" className={inputCls} placeholder="produk mirip, mis. %Paket%" value={rule.produk_like ?? ""} onChange={(e) => onChange({ ...rule, produk_like: e.target.value || undefined })} />
            <input aria-label="Mundur hari" className={inputCls} type="number" placeholder="mundur N hari" value={rule.since_days ?? ""} onChange={(e) => onChange({ ...rule, since_days: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
        </>
      )}
      {(rule.kind === "opened" || rule.kind === "clicked") && (
        <select aria-label="Email" className={inputCls} value={rule.node} onChange={(e) => onChange({ ...rule, node: e.target.value })}>
          {emailNodes.map(([nid, n]) => <option key={nid} value={nid}>{nid} · {nodeTitle(n)}</option>)}
        </select>
      )}
      {rule.kind === "attr" && <AttrRule rule={rule} onChange={onChange} />}
      {rule.kind === "ctx" && (
        <div className="grid grid-cols-3 gap-1">
          <input aria-label="Kunci konteks" className={inputCls} value={rule.key} onChange={(e) => onChange({ ...rule, key: e.target.value })} />
          <select aria-label="Operator" className={inputCls} value={rule.op} onChange={(e) => onChange({ ...rule, op: e.target.value })}>
            {["eq", "neq", "in", "nin", "gte", "lte", "like", "true", "false", "notnull", "null"].map((o) => <option key={o} value={o}>{opLabel(o)}</option>)}
          </select>
          <input aria-label="Nilai" className={inputCls} value={valText(r.value)} onChange={(e) => onChange({ ...rule, value: ["in", "nin"].includes(rule.op) ? e.target.value.split(",").map((x) => x.trim()) : e.target.value })} />
        </div>
      )}
      {(rule.kind === "any" || rule.kind === "all") && (
        <div className="flex flex-col gap-1 border-l-2 border-glass-border pl-2">
          {rule.rules.map((x, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="font-mono text-[10px] text-ink-faint">{rule.kind === "any" ? "ATAU" : "DAN"}</span>}
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1"><RuleEditor rule={x} graph={graph} attrOnly={attrOnly} onChange={(nr) => onChange({ ...rule, rules: rule.rules.map((y, j) => (j === i ? nr : y)) })} /></div>
                <button type="button" aria-label="Hapus" className="mt-1 text-ink-faint hover:text-red" onClick={() => onChange({ ...rule, rules: rule.rules.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </Fragment>
          ))}
          <button type="button" className="self-start font-body text-[12px] text-red" onClick={() => onChange({ ...rule, rules: [...rule.rules, { kind: "attr", field: "status_pembeli", op: "eq", value: "Active" }] })}>+ aturan</button>
        </div>
      )}
      {rule.kind === "not" && <div className="border-l-2 border-glass-border pl-2"><RuleEditor rule={rule.rule} graph={graph} onChange={(nr) => onChange({ kind: "not", rule: nr })} /></div>}
    </div>
  );
}

function AttrRule({ rule, onChange }: { rule: Extract<Rule, { kind: "attr" }>; onChange: (r: Rule) => void }) {
  const f = ATTR_FIELDS[rule.field] ?? { label: rule.field, type: "text" as const };
  const ops = f.type === "arr" ? ["contains", "ncontains", "like", "nlike", "empty"] : f.type === "bool" ? ["eq"] : f.type === "num" ? ["eq", "neq", "gte", "lte", "gt", "lt", "null", "notnull"] : ["eq", "neq", "in", "nin", "like", "nlike", "null", "notnull"];
  const noValue = ["null", "notnull", "empty"].includes(rule.op);
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
      <select aria-label="Atribut" className={inputCls} value={rule.field} onChange={(e) => { const nf = ATTR_FIELDS[e.target.value]; onChange({ kind: "attr", field: e.target.value, op: nf?.type === "arr" ? "contains" : "eq", value: nf?.type === "bool" ? true : nf?.type === "arr" ? [] : "" }); }}>
        {Object.entries(ATTR_FIELDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <select aria-label="Operator" className={inputCls} value={rule.op} onChange={(e) => onChange({ ...rule, op: e.target.value })}>
        {ops.map((o) => <option key={o} value={o}>{opLabel(o)}</option>)}
      </select>
      {!noValue && (f.type === "bool" ? (
        <select aria-label="Nilai" className={inputCls} value={rule.value === false || rule.value === "false" ? "false" : "true"} onChange={(e) => onChange({ ...rule, value: e.target.value === "true" })}>
          <option value="true">ya</option><option value="false">tidak</option>
        </select>
      ) : f.type === "arr" && ["contains", "ncontains"].includes(rule.op) && ["lines", "paid_lines"].includes(rule.field) ? (
        <div className="sm:col-span-3"><LinesPicker value={(rule.value as string[]) ?? []} onChange={(v) => onChange({ ...rule, value: v })} /></div>
      ) : f.type === "line" ? (
        <select aria-label="Nilai" className={inputCls} value={Array.isArray(rule.value) ? String(rule.value[0] ?? "") : String(rule.value ?? "")} onChange={(e) => onChange({ ...rule, value: e.target.value })}>
          {LINES.map((l) => <option key={l} value={l}>{LINE_LABEL[l]}</option>)}
        </select>
      ) : (
        <input aria-label="Nilai" className={inputCls} type={f.type === "num" ? "number" : "text"} value={valText(rule.value)}
          onChange={(e) => onChange({ ...rule, value: ["in", "nin"].includes(rule.op) ? e.target.value.split(",").map((x) => x.trim()) : f.type === "num" ? Number(e.target.value) : e.target.value })} />
      ))}
    </div>
  );
}

// ── people ───────────────────────────────────────────────────────────────────────────────────
function PeopleTable({ rows, graph }: { rows: EnrollmentRow[] | null; graph: FlowGraph }) {
  if (!rows) return <p className="font-body text-[13px] text-ink-soft">Memuat peserta…</p>;
  if (!rows.length) return <div className="rounded-card border border-dashed border-glass-border p-6 text-center font-body text-[13px] text-ink-soft">Belum ada peserta. Flow Draft tidak mengambil peserta; pakai tombol Uji untuk mencoba jalurnya.</div>;
  return (
    <div className="overflow-x-auto rounded-card border border-glass-border">
      <table className="w-full min-w-[820px] font-body text-[12.5px]">
        <thead><tr className="text-left font-mono text-[11px] uppercase text-ink-faint"><th className="px-3 py-2">Orang</th><th className="px-3 py-2">Masuk</th><th className="px-3 py-2">Posisi</th><th className="px-3 py-2">Jejak</th><th className="px-3 py-2">Konversi</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-glass-border align-top">
              <td className="px-3 py-2"><span className="block text-ink">{r.nama ?? "–"}</span><span className="font-mono text-[11px] text-ink-faint">{r.email}{r.holdout ? " · kontrol" : ""}</span></td>
              <td className="px-3 py-2 text-ink-soft">{when(r.entered_at)}</td>
              <td className="px-3 py-2">
                {r.status === "active" ? <><Badge tone="blue">berjalan</Badge><span className="mt-1 block text-[11px] text-ink-faint">{r.node && graph.nodes[r.node] ? nodeTitle(graph.nodes[r.node]) : r.node} · {when(r.next_at)}</span></> : <Badge tone="neutral">{r.exit_reason ?? r.status}</Badge>}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {(r.steps ?? []).map((s, i) => (
                    <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] ${s.kind === "email" ? (s.outcome === "sent" ? (s.clicked ? "tint-green" : s.opened ? "tint-blue" : "tint-neutral") : "tint-amber") : "tint-neutral"}`}>
                      {graph.nodes[s.node] ? nodeTitle(graph.nodes[s.node]) : s.node}
                      {s.kind === "email" ? ` · ${s.outcome === "sent" ? (s.clicked ? "diklik" : s.opened ? "dibuka" : "terkirim") : OUTCOME_LABEL[s.outcome] ?? s.outcome}` : s.kind === "condition" ? ` · ${s.outcome === "yes" ? "ya" : "tidak"}` : s.kind === "split" ? ` · ${s.outcome.replace("branch:", "")}` : ""}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">{r.converted_at ? <span className="text-green">{rupiah(r.conversion_amount)}<span className="block text-[11px] text-ink-faint">{when(r.converted_at)}</span></span> : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)" }} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="card w-full max-w-lg rounded-card border border-glass-border p-5 shadow-glass-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[20px] font-bold uppercase text-ink">{title}</h2>
          <button type="button" aria-label="Tutup" onClick={onClose} className="text-ink-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
