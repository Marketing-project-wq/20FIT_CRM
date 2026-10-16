"use client";

import { useEffect, useState, useTransition } from "react";
import { Bot, Play, Save, Plus, Trash2, RefreshCw, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, type Activity, type AgentSettings, type KbEntry } from "@/lib/partnership/types";
import { agentOverviewAction, deleteKbAction, saveKbAction, saveSettingsAction, simulateAction, tickNowAction } from "./actions";
import { Field, Notice, Stat, areaCls, chipCls, inputCls, when } from "./ui";

type Sub = "aktivitas" | "playground" | "pengetahuan" | "playbook";
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function AgentTab({ canAdmin, onOpenLead }: { canAdmin: boolean; onOpenLead: (id: number) => void }) {
  const [sub, setSub] = useState<Sub>("aktivitas");
  const [data, setData] = useState<{ stats: Record<string, number> | null; activity: Activity[]; settings: AgentSettings; kb: KbEntry[] } | null>(null);
  const [notice, setNotice] = useState<{ tone: "red" | "green" | "blue"; text: string } | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [busy, start] = useTransition();

  const load = () => start(async () => { const r = await agentOverviewAction(); if (r.ok) setData(r); else setNotice({ tone: "red", text: r.error }); });
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, []);

  if (!data) return <p className="font-body text-[13px] text-ink-faint">Memuat…</p>;
  const s = data.stats ?? {};
  const acts = data.activity.filter((a) => kindFilter === "all" || (kindFilter === "ai" ? a.actor === "ai" : kindFilter === "handoff" ? a.kind === "handoff" : kindFilter === "error" ? /error|failed/.test(a.kind) : a.kind === kindFilter));

  return (
    <div className="flex flex-col gap-4">
      {notice && <Notice tone={notice.tone} text={notice.text} onClose={() => setNotice(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={data.settings.enabled ? "green" : "red"}>{data.settings.enabled ? "Agent aktif" : "Agent mati"}</Badge>
        <span className="font-body text-[12.5px] text-ink-soft">Model {data.settings.model} · persona “{data.settings.persona_name}”</span>
        {canAdmin && <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await tickNowAction(); setNotice(r.ok ? { tone: "blue", text: `Tick: ${r.tick.tasks} tugas, ${r.tick.gmail} email baru${r.tick.results.length ? `\n${r.tick.results.join("\n")}` : ""}` } : { tone: "red", text: r.error }); load(); })}><RefreshCw /> Jalankan sekarang</Button>}
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-glass-border bg-glass-border sm:grid-cols-4">
        <Stat label="Pesan AI 24 jam" value={s.ai_24h ?? 0} sub={`${s.in_24h ?? 0} pesan masuk`} />
        <Stat label="Meeting dijadwalkan AI (30 hr)" value={s.ai_meetings_30d ?? 0} sub={`${s.upcoming_meetings ?? 0} meeting mendatang`} />
        <Stat label="Butuh manusia" value={s.needs_human ?? 0} />
        <Stat label="Tugas otomatis" value={s.pending_tasks ?? 0} sub={s.failed_tasks_7d ? `${s.failed_tasks_7d} gagal 7 hari` : "tidak ada yang gagal"} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([["aktivitas", "Aktivitas AI"], ["playground", "Playground"], ["pengetahuan", "Knowledge base"], ["playbook", "Playbook & jadwal"]] as const).map(([k, v]) => (
          <button key={k} type="button" className={chipCls(sub === k)} onClick={() => setSub(k)}>{v}</button>
        ))}
      </div>

      {sub === "aktivitas" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {([["all", "Semua"], ["ai", "Keputusan AI"], ["handoff", "Diserahkan ke manusia"], ["meeting", "Meeting"], ["stage", "Tahap"], ["takeover", "Diambil alih"], ["error", "Gagal"]] as const).map(([k, v]) => (
              <button key={k} type="button" className={chipCls(kindFilter === k)} onClick={() => setKindFilter(k)}>{v}</button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-card border border-glass-border">
            <table className="w-full min-w-[760px] font-body text-[12.5px]">
              <thead><tr className="text-left font-mono text-[11px] uppercase text-ink-faint"><th className="px-3 py-2">Waktu</th><th className="px-3 py-2">Lead</th><th className="px-3 py-2">Kejadian</th><th className="px-3 py-2">Alasan AI</th><th className="px-3 py-2">Oleh</th></tr></thead>
              <tbody>
                {acts.map((a) => (
                  <tr key={a.id} className="border-t border-glass-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{when(a.at, true)}</td>
                    <td className="px-3 py-2">{a.lead_id ? <button type="button" className="text-left text-ink hover:text-red" onClick={() => onOpenLead(a.lead_id)}>{a.company}</button> : "–"}</td>
                    <td className={`px-3 py-2 ${/handoff|error|failed/.test(a.kind) ? "text-red" : "text-ink"}`}>{a.title}</td>
                    <td className="px-3 py-2 italic text-ink-soft">{typeof a.detail?.reasoning === "string" ? a.detail.reasoning : ""}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-faint">{a.actor}</td>
                  </tr>
                ))}
                {!acts.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-faint">Belum ada aktivitas.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {sub === "playground" && <Playground />}
      {sub === "pengetahuan" && <KbEditor kb={data.kb} canAdmin={canAdmin} onSaved={load} />}
      {sub === "playbook" && <Playbook settings={data.settings} canAdmin={canAdmin} onSaved={(t) => { setNotice({ tone: "green", text: t }); load(); }} />}
    </div>
  );
}

function Playground() {
  const [text, setText] = useState("Halo, kami dari brand minuman isotonik. Tertarik jadi sponsor event lari 20FIT tahun depan. Bisa minta info paketnya?");
  const [channel, setChannel] = useState<"wa" | "email">("wa");
  const [category, setCategory] = useState("sponsor");
  const [company, setCompany] = useState("PT Contoh Minuman");
  const [out, setOut] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-card border border-glass-border p-3">
        <p className="font-body text-[12.5px] text-ink-soft"><FlaskConical className="mr-1 inline h-4 w-4" />Coba pesan partner dan lihat keputusan AI. Tidak ada yang terkirim, tidak ada data yang berubah.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Kanal"><select id="pg-ch" className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as "wa" | "email")}><option value="wa">WhatsApp</option><option value="email">Email</option></select></Field>
          <Field label="Kategori"><select id="pg-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Perusahaan"><input id="pg-co" className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
        </div>
        <Field label="Pesan partner"><textarea id="pg-text" className={areaCls} rows={6} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <Button disabled={busy} onClick={() => start(async () => { const r = await simulateAction({ text, channel, category, company }); if (r.ok) { setOut(r.decision); setErr(null); } else setErr(r.error); })}><Play /> Tanya AI</Button>
        {err && <p className="font-body text-[12px] text-red">{err}</p>}
      </div>
      <div className="flex flex-col gap-2 rounded-card border border-glass-border p-3">
        {!out && <span className="font-body text-[12.5px] text-ink-faint">Hasil muncul di sini.</span>}
        {out && (
          <>
            <span className="font-body text-[12px] text-ink-soft">Intent: <b className="text-ink">{String(out.intent)}</b> · tahap: <b className="text-ink">{String(out.stage ?? "–")}</b> · meeting: <b className="text-ink">{String((out.meeting as { action?: string })?.action ?? "none")}</b>{(out.handoff as { needed?: boolean })?.needed ? <> · <b className="text-red">handoff: {String((out.handoff as { reason?: string }).reason ?? "")}</b></> : null}</span>
            <div className="tint-blue whitespace-pre-wrap rounded-card p-3 font-body text-[13.5px]">{String(out.reply || "(tidak membalas)")}</div>
            <span className="font-body text-[12px] italic text-ink-soft">{String(out.reasoning ?? "")}</span>
            <details><summary className="cursor-pointer font-mono text-[11px] text-ink-faint">JSON lengkap</summary><pre className="overflow-x-auto font-mono text-[11px] text-ink">{JSON.stringify(out, null, 2)}</pre></details>
          </>
        )}
      </div>
    </div>
  );
}

function KbEditor({ kb, canAdmin, onSaved }: { kb: KbEntry[]; canAdmin: boolean; onSaved: () => void }) {
  const [edit, setEdit] = useState<Partial<KbEntry> | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <p className="font-body text-[12.5px] text-ink-soft">Hanya isi knowledge base yang boleh diklaim AI sebagai fakta. Harga sengaja tidak dicantumkan supaya AI mengajak meeting / menyerahkan ke tim.</p>
      {canAdmin && <Button size="sm" variant="secondary" className="self-start" onClick={() => setEdit({ title: "", product: "umum", content: "", active: true })}><Plus /> Tambah pengetahuan</Button>}
      {edit && (
        <div className="flex flex-col gap-2 rounded-card border border-red p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Judul" className="sm:col-span-2"><input id="kb-title" className={inputCls} value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Produk / topik"><input id="kb-product" className={inputCls} value={edit.product ?? ""} onChange={(e) => setEdit({ ...edit, product: e.target.value })} /></Field>
          </div>
          <Field label="Isi"><textarea id="kb-content" className={areaCls} rows={9} value={edit.content ?? ""} onChange={(e) => setEdit({ ...edit, content: e.target.value })} /></Field>
          <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id="kb-active" type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Aktif dipakai AI</label>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => start(async () => { const r = await saveKbAction({ id: edit.id, title: edit.title ?? "", product: edit.product ?? "umum", content: edit.content ?? "", active: edit.active !== false }); if (r.ok) { setEdit(null); onSaved(); } })}><Save /> Simpan</Button>
            <Button size="sm" variant="secondary" onClick={() => setEdit(null)}>Batal</Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {kb.map((k) => (
          <div key={k.id} className={`flex flex-col gap-1 rounded-card border border-glass-border p-3 ${k.active ? "" : "opacity-60"}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="font-body text-[13.5px] font-semibold text-ink">{k.title}</span>
              <span className="flex items-center gap-1">
                <Badge>{k.product}</Badge>
                {canAdmin && <Button size="sm" variant="ghost" onClick={() => setEdit(k)}>Ubah</Button>}
                {canAdmin && <button type="button" aria-label="Hapus" className="text-ink-faint hover:text-red" onClick={() => start(async () => { await deleteKbAction(k.id); onSaved(); })}><Trash2 className="h-4 w-4" /></button>}
              </span>
            </span>
            <p className="line-clamp-6 whitespace-pre-line font-body text-[12px] text-ink-soft">{k.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Playbook({ settings, canAdmin, onSaved }: { settings: AgentSettings; canAdmin: boolean; onSaved: (t: string) => void }) {
  const [s, setS] = useState<AgentSettings>(settings);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const num = (v: string) => Number(v) || 0;
  const dayPicker = (k: "proactive_days" | "meeting_days") => (
    <div className="flex flex-wrap gap-1">{DAYS.map((d, i) => <button key={d} type="button" className={chipCls(s[k].includes(i))} onClick={() => set(k, s[k].includes(i) ? s[k].filter((x) => x !== i) : [...s[k], i].sort())}>{d}</button>)}</div>
  );
  return (
    <div className="flex flex-col gap-4">
      {!canAdmin && <Notice tone="blue" text="Hanya Super Admin / CRM Manager yang bisa mengubah playbook." />}
      <fieldset disabled={!canAdmin} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-card border border-glass-border p-3">
          <h3 className="flex items-center gap-1.5 font-display text-[15px] font-bold uppercase text-ink"><Bot className="h-4 w-4 text-red" /> Identitas & gaya</h3>
          <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id="pb-enabled" type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Agent aktif (mati = AI hanya membuat draft)</label>
          <Field label="Nama persona"><input id="pb-persona" className={inputCls} value={s.persona_name} onChange={(e) => set("persona_name", e.target.value)} /></Field>
          <Field label="Gaya bahasa"><textarea id="pb-tone" className={areaCls} rows={3} value={s.tone} onChange={(e) => set("tone", e.target.value)} /></Field>
          <Field label="Tanda tangan email"><textarea id="pb-sig" className={areaCls} rows={3} value={s.signature} onChange={(e) => set("signature", e.target.value)} /></Field>
          <Field label="Model (OpenRouter)"><input id="pb-model" className={inputCls} value={s.model} onChange={(e) => set("model", e.target.value)} /></Field>
        </section>
        <section className="flex flex-col gap-2 rounded-card border border-glass-border p-3">
          <h3 className="font-display text-[15px] font-bold uppercase text-ink">Follow-up & ghosting</h3>
          <Field label="Jeda follow-up (hari, pisah koma) — setelah semuanya habis: Ghosting"><input id="pb-fu" className={inputCls} value={s.followup_days.join(", ")} onChange={(e) => set("followup_days", e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0))} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sapa lagi lead ghosting setelah (hari)"><input id="pb-revive" type="number" className={inputCls} value={s.revive_after_days} onChange={(e) => set("revive_after_days", num(e.target.value))} /></Field>
            <Field label="Hubungi lagi lead 'nanti' setelah (hari)"><input id="pb-nurture" type="number" className={inputCls} value={s.nurture_after_days} onChange={(e) => set("nurture_after_days", num(e.target.value))} /></Field>
            <Field label="Diam setelah tim balas manual (jam)"><input id="pb-take" type="number" className={inputCls} value={s.manual_takeover_hours} onChange={(e) => set("manual_takeover_hours", num(e.target.value))} /></Field>
            <Field label="Maks pesan AI per percakapan / 24 jam"><input id="pb-max" type="number" className={inputCls} value={s.max_ai_messages_per_day} onChange={(e) => set("max_ai_messages_per_day", num(e.target.value))} /></Field>
          </div>
          <label className="flex items-center gap-2 font-body text-[13px] text-ink"><input id="pb-coldwa" type="checkbox" checked={s.cold_wa_allowed} onChange={(e) => set("cold_wa_allowed", e.target.checked)} /> Boleh kirim WA pertama ke lead yang belum pernah chat</label>
          <Field label="Batas WA pertama per hari (melindungi nomor dari blokir)"><input id="pb-coldlim" type="number" className={inputCls} value={s.cold_wa_daily_limit} onChange={(e) => set("cold_wa_daily_limit", num(e.target.value))} /></Field>
        </section>
        <section className="flex flex-col gap-2 rounded-card border border-glass-border p-3">
          <h3 className="font-display text-[15px] font-bold uppercase text-ink">Jam kirim (WIB)</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Pesan proaktif mulai"><input id="pb-ph0" type="number" className={inputCls} value={s.proactive_hours[0]} onChange={(e) => set("proactive_hours", [num(e.target.value), s.proactive_hours[1]])} /></Field>
            <Field label="sampai"><input id="pb-ph1" type="number" className={inputCls} value={s.proactive_hours[1]} onChange={(e) => set("proactive_hours", [s.proactive_hours[0], num(e.target.value)])} /></Field>
          </div>
          <Field label="Hari pesan proaktif">{dayPicker("proactive_days")}</Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Membalas pesan masuk mulai"><input id="pb-rh0" type="number" className={inputCls} value={s.reply_hours[0]} onChange={(e) => set("reply_hours", [num(e.target.value), s.reply_hours[1]])} /></Field>
            <Field label="sampai"><input id="pb-rh1" type="number" className={inputCls} value={s.reply_hours[1]} onChange={(e) => set("reply_hours", [s.reply_hours[0], num(e.target.value)])} /></Field>
          </div>
        </section>
        <section className="flex flex-col gap-2 rounded-card border border-glass-border p-3">
          <h3 className="font-display text-[15px] font-bold uppercase text-ink">Meeting</h3>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Durasi (menit)"><input id="pb-mm" type="number" className={inputCls} value={s.meeting_minutes} onChange={(e) => set("meeting_minutes", num(e.target.value))} /></Field>
            <Field label="Jam mulai"><input id="pb-mh0" type="number" className={inputCls} value={s.meeting_hours[0]} onChange={(e) => set("meeting_hours", [num(e.target.value), s.meeting_hours[1]])} /></Field>
            <Field label="Jam selesai"><input id="pb-mh1" type="number" className={inputCls} value={s.meeting_hours[1]} onChange={(e) => set("meeting_hours", [s.meeting_hours[0], num(e.target.value)])} /></Field>
          </div>
          <Field label="Hari meeting">{dayPicker("meeting_days")}</Field>
          <Field label="Jeda antar meeting (menit)"><input id="pb-buf" type="number" className={inputCls} value={s.meeting_buffer_min} onChange={(e) => set("meeting_buffer_min", num(e.target.value))} /></Field>
          <Field label="Lokasi tatap muka (satu per baris)"><textarea id="pb-locs" className={areaCls} rows={3} value={s.offline_locations.join("\n")} onChange={(e) => set("offline_locations", e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))} /></Field>
        </section>
        <section className="flex flex-col gap-2 rounded-card border border-glass-border p-3 lg:col-span-2">
          <h3 className="font-display text-[15px] font-bold uppercase text-ink">Email & notifikasi</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <Field label="Kirim email lewat">
              <select id="pb-via" className={inputCls} value={s.email_via} onChange={(e) => set("email_via", e.target.value as AgentSettings["email_via"])}>
                <option value="resend">Resend (pengirim di bawah)</option>
                <option value="gmail">Gmail yang tersambung</option>
              </select>
            </Field>
            <Field label="Pengirim Resend"><input id="pb-from" className={inputCls} value={s.email_from} onChange={(e) => set("email_from", e.target.value)} /></Field>
            <Field label="Reply-To (kosong = Gmail tersambung)"><input id="pb-reply" className={inputCls} value={s.email_reply_to} placeholder="otomatis: kotak Gmail tersambung" onChange={(e) => set("email_reply_to", e.target.value)} /></Field>
            <Field label="Notifikasi tim (handoff, lead baru, meeting)"><input id="pb-notify" className={inputCls} value={s.notify_email} onChange={(e) => set("notify_email", e.target.value)} /></Field>
          </div>
        </section>
      </fieldset>
      {err && <p className="font-body text-[12px] text-red">{err}</p>}
      {canAdmin && <Button className="self-start" disabled={busy} onClick={() => start(async () => { const r = await saveSettingsAction(s); if (r.ok) onSaved("Playbook disimpan."); else setErr(r.error); })}><Save /> Simpan playbook</Button>}
    </div>
  );
}
