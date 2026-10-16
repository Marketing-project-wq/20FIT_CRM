"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Upload, Search, Bot, Hand, AlertTriangle, CalendarClock, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORIES, PRODUCTS, STAGES, fmtIdr, type Lead, type Stage } from "@/lib/partnership/types";
import { boardAction, createLeadAction, importLeadsAction, setStageAction } from "./actions";
import { Field, Modal, Notice, Stat, ago, areaCls, chipCls, inputCls, when } from "./ui";

export function Pipeline({ refreshKey, onOpenLead, canAdmin }: { refreshKey: number; onOpenLead: (id: number) => void; canAdmin: boolean }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qText, setQText] = useState("");
  const [cat, setCat] = useState("all");
  const [flag, setFlag] = useState<"all" | "human" | "ai" | "unread">("all");
  const [showClosed, setShowClosed] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();

  const load = () =>
    start(async () => {
      const r = await boardAction();
      if (r.ok) { setLeads(r.leads); setStats(r.stats); setErr(null); } else setErr(r.error);
    });
  useEffect(load, [refreshKey]);
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const shown = useMemo(() => {
    const ql = qText.trim().toLowerCase();
    return (leads ?? []).filter(
      (l) =>
        (cat === "all" || l.category === cat) &&
        (flag === "all" || (flag === "human" && l.needs_human) || (flag === "ai" && l.autopilot && !l.needs_human) || (flag === "unread" && (l.unread ?? 0) > 0)) &&
        (!ql || `${l.company} ${l.contact_name ?? ""} ${l.contact_email ?? ""} ${l.contact_phone ?? ""} ${l.notes ?? ""}`.toLowerCase().includes(ql)),
    );
  }, [leads, qText, cat, flag]);

  const columns = STAGES.filter((s) => showClosed || !["lost", "nurture"].includes(s.key));
  const openValue = (leads ?? []).filter((l) => !["won", "lost", "ghosting", "nurture"].includes(l.stage)).reduce((a, l) => a + (Number(l.value_estimate) || 0), 0);
  const wonValue = (leads ?? []).filter((l) => l.stage === "won").reduce((a, l) => a + (Number(l.value_estimate) || 0), 0);

  function drop(stage: Stage) {
    if (dragId == null) return;
    const id = dragId;
    setDragId(null);
    setLeads((ls) => (ls ?? []).map((l) => (l.id === id ? { ...l, stage } : l)));
    start(async () => {
      const r = await setStageAction(id, stage);
      if (!r.ok) setMsg(r.error);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {err && <Notice tone="red" text={`Pipeline tidak bisa dimuat: ${err}`} />}
      {msg && <Notice tone="blue" text={msg} onClose={() => setMsg(null)} />}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-glass-border bg-glass-border sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Lead aktif" value={(leads ?? []).filter((l) => !["won", "lost", "ghosting", "nurture"].includes(l.stage)).length} />
        <Stat label="Nilai pipeline" value={fmtIdr(openValue)} />
        <Stat label="Deal" value={(leads ?? []).filter((l) => l.stage === "won").length} sub={fmtIdr(wonValue)} />
        <Stat label="Meeting mendatang" value={stats?.upcoming_meetings ?? 0} sub={`${stats?.ai_meetings_30d ?? 0} dijadwalkan AI (30 hr)`} />
        <Stat label="Butuh manusia" value={stats?.needs_human ?? 0} />
        <Stat label="Ghosting" value={stats?.ghosting ?? 0} />
        <Stat label="Pesan AI 24 jam" value={stats?.ai_24h ?? 0} sub={`${stats?.in_24h ?? 0} pesan masuk`} />
        <Stat label="Tugas terjadwal" value={stats?.pending_tasks ?? 0} sub={stats?.failed_tasks_7d ? `${stats.failed_tasks_7d} gagal 7 hr` : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[200px] flex-1 items-center sm:max-w-xs">
          <Search className="absolute left-3 h-4 w-4 text-ink-faint" />
          <input id="lead-search" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Cari perusahaan / kontak…" className={`${inputCls} pl-9`} />
        </label>
        <select id="lead-cat" aria-label="Kategori" className={`${inputCls} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Semua kategori</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {([["all", "Semua"], ["human", "Butuh manusia"], ["ai", "Dipegang AI"], ["unread", "Belum dibaca"]] as const).map(([k, v]) => (
          <button key={k} type="button" className={chipCls(flag === k)} onClick={() => setFlag(k)}>{v}</button>
        ))}
        <button type="button" className={chipCls(showClosed)} onClick={() => setShowClosed((x) => !x)}>Tampilkan Batal & Nanti</button>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setImporting(true)}><Upload /> Import CSV</Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus /> Lead baru</Button>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {columns.map((col) => {
            const items = shown.filter((l) => l.stage === col.key);
            const val = items.reduce((a, l) => a + (Number(l.value_estimate) || 0), 0);
            return (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(col.key)}
                className={`flex w-[260px] shrink-0 flex-col gap-2 rounded-card border border-glass-border p-2 ${dragId != null ? "bg-glass" : ""}`}
              >
                <div className="flex items-baseline justify-between px-1">
                  <span className="font-display text-[15px] font-bold uppercase text-ink">{col.label}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{items.length}{val ? ` · ${fmtIdr(val)}` : ""}</span>
                </div>
                <span className="px-1 font-body text-[11px] text-ink-faint">{col.hint}</span>
                <div className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto">
                  {items.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => onOpenLead(l.id)}
                      className={`card flex flex-col gap-1.5 rounded-card border p-2.5 text-left hover:border-ink-faint ${l.needs_human ? "border-red" : "border-glass-border"}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 font-body text-[13.5px] font-semibold leading-snug text-ink">{l.company}</span>
                        {(l.unread ?? 0) > 0 && <span className="tint-red shrink-0 rounded-full px-1.5 font-mono text-[10.5px]">{l.unread}</span>}
                      </span>
                      <span className="truncate font-body text-[11.5px] text-ink-soft">
                        {l.contact_name ?? "–"}{l.contact_phone ? <> · <MessageCircle className="inline h-3 w-3" /></> : null}{l.contact_email ? <> · <Mail className="inline h-3 w-3" /></> : null}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        <span className="tint-neutral rounded-full px-2 py-0.5 font-body text-[10.5px]">{CATEGORIES[l.category] ?? l.category}</span>
                        {l.products.slice(0, 2).map((p) => <span key={p} className="tint-blue rounded-full px-2 py-0.5 font-body text-[10.5px]">{(PRODUCTS[p] ?? p).split(" (")[0]}</span>)}
                      </span>
                      {l.needs_human && <span className="flex items-start gap-1 font-body text-[11px] text-red"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {l.handoff_reason ?? "Butuh manusia"}</span>}
                      {l.next_meeting_at && <span className="flex items-center gap-1 font-body text-[11px] text-green"><CalendarClock className="h-3 w-3" /> {when(l.next_meeting_at, true)}</span>}
                      <span className="flex items-center justify-between font-mono text-[10.5px] text-ink-faint">
                        <span className="inline-flex items-center gap-1">{l.autopilot && !l.needs_human ? <><Bot className="h-3 w-3" /> AI</> : <><Hand className="h-3 w-3" /> manual</>}</span>
                        <span>{fmtIdr(l.value_estimate)} · {ago(l.last_inbound_at ?? l.last_outbound_at ?? l.updated_at)}</span>
                      </span>
                    </button>
                  ))}
                  {!items.length && <span className="rounded-sm border border-dashed border-glass-border p-3 text-center font-body text-[11.5px] text-ink-faint">Seret kartu ke sini</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {creating && <CreateLead onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); load(); onOpenLead(id); }} />}
      {importing && <ImportLeads onClose={() => setImporting(false)} onDone={(t) => { setImporting(false); setMsg(t); load(); }} />}
      {!canAdmin && null}
    </div>
  );
}

function CreateLead({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [f, setF] = useState({ company: "", category: "sponsor", products: [] as string[], value_estimate: "", city: "", website: "", notes: "", priority: "normal", autopilot: true, contactNow: true, name: "", title: "", phone: "", email: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title="Lead baru" onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Perusahaan / organisasi"><input id="nl-company" className={inputCls} value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Kategori">
          <select id="nl-cat" className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(CATEGORIES).filter(([k]) => k !== "spam").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Produk yang ditawarkan" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1">
            {Object.entries(PRODUCTS).map(([k, v]) => (
              <button key={k} type="button" className={chipCls(f.products.includes(k))} onClick={() => set("products", f.products.includes(k) ? f.products.filter((x) => x !== k) : [...f.products, k])}>{v.split(" (")[0]}</button>
            ))}
          </div>
        </Field>
        <Field label="Nama kontak"><input id="nl-name" className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Jabatan"><input id="nl-title" className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="WhatsApp"><input id="nl-phone" className={inputCls} placeholder="0812…" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><input id="nl-email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Estimasi nilai (Rp)"><input id="nl-value" className={inputCls} type="number" value={f.value_estimate} onChange={(e) => set("value_estimate", e.target.value)} /></Field>
        <Field label="Kota"><input id="nl-city" className={inputCls} value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="Catatan untuk AI & tim" className="sm:col-span-2"><textarea id="nl-notes" className={areaCls} rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Konteks: dari mana kenalnya, kebutuhan, event yang relevan…" /></Field>
        <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id="nl-auto" type="checkbox" checked={f.autopilot} onChange={(e) => set("autopilot", e.target.checked)} /> Dipegang AI (autopilot)</label>
        <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id="nl-now" type="checkbox" checked={f.contactNow} disabled={!f.autopilot} onChange={(e) => set("contactNow", e.target.checked)} /> AI kirim pesan pertama di jam kerja</label>
      </div>
      {err && <p className="mt-3 font-body text-[12px] text-red">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button disabled={busy} onClick={() => start(async () => {
          const r = await createLeadAction({ company: f.company, category: f.category, products: f.products, value_estimate: f.value_estimate || null, city: f.city, website: f.website, notes: f.notes, priority: f.priority, autopilot: f.autopilot, contactNow: f.contactNow, contact: { name: f.name, title: f.title, phone: f.phone, email: f.email } });
          if (r.ok) onCreated(r.id); else setErr(r.error);
        })}>Simpan lead</Button>
      </div>
    </Modal>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') inQ = false; else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === "," || ch === ";") { cur.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; cur.push(cell); rows.push(cur); cur = []; cell = ""; }
    else cell += ch;
  }
  if (cell || cur.length) { cur.push(cell); rows.push(cur); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

function ImportLeads({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [contactNow, setContactNow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Modal title="Import lead dari CSV" onClose={onClose} wide>
      <div className="flex flex-col gap-3 font-body text-[13px] text-ink">
        <p className="text-ink-soft">Kolom yang dikenali: <code>company</code> (wajib), <code>name</code>, <code>title</code>, <code>phone</code>, <code>email</code> (salah satu wajib), <code>category</code> (sponsor/corporate/community/venue_eo/media/kol), <code>products</code> (pisah koma), <code>city</code>, <code>notes</code>, <code>value</code>. Duplikat (email/WA sudah ada) dilewati.</p>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRows(parseCsv(await f.text())); }} />
        {rows.length > 0 && <p><b>{rows.length}</b> baris terbaca. Contoh: {rows.slice(0, 3).map((r) => r.company).join(", ")}</p>}
        <label className="flex items-center gap-2"><input id="csv-now" type="checkbox" checked={contactNow} onChange={(e) => setContactNow(e.target.checked)} /> AI langsung kirim pesan pertama (bertahap, di jam kerja)</label>
        {err && <p className="text-red">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button disabled={busy || !rows.length} onClick={() => start(async () => {
            const r = await importLeadsAction(rows, contactNow);
            if (r.ok) onDone(`${r.created} lead dibuat, ${r.skipped} dilewati.`); else setErr(r.error);
          })}>Import {rows.length || ""} lead</Button>
        </div>
      </div>
    </Modal>
  );
}
