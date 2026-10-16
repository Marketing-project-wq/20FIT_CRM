"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Bot, Hand, AlertTriangle, MessageCircle, Mail, CalendarPlus, Send, Trash2, Plus, Sparkles, Video, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, PRODUCTS, STAGES, STAGE_LABEL, TASK_LABEL, fmtIdr, type Activity, type Contact, type Conversation, type Lead, type Meeting, type Task } from "@/lib/partnership/types";
import {
  addContactAction, cancelTaskAction, contactNowAction, deleteLeadAction, leadDetailAction, setStageAction, startConversationAction, updateLeadAction,
} from "./actions";
import { MeetingForm } from "./calendar-tab";
import { Field, Modal, Notice, areaCls, chipCls, inputCls, when } from "./ui";

type Detail = { lead: Lead; contacts: Contact[]; conversations: Conversation[]; meetings: Meeting[]; activity: Activity[]; tasks: Task[] };

export function LeadDrawer({ id, canAdmin, onClose, onChanged, onOpenConversation }: { id: number; canAdmin: boolean; onClose: () => void; onChanged: () => void; onOpenConversation: (id: number) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Lead> | null>(null);
  const [newContact, setNewContact] = useState(false);
  const [compose, setCompose] = useState<{ contact: Contact; channel: "wa" | "email" } | null>(null);
  const [meeting, setMeeting] = useState(false);
  const [busy, start] = useTransition();

  const load = () => start(async () => {
    const r = await leadDetailAction(id);
    if (r.ok) { setD(r); setErr(null); } else setErr(r.error);
  });
  useEffect(load, [id]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setNotice(r.error ?? "Gagal"); else if (ok) setNotice(ok);
      load();
      onChanged();
    });

  const l = d?.lead;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "color-mix(in srgb, var(--ink) 30%, transparent)" }} onClick={onClose}>
      <div className="card flex h-full w-full max-w-[640px] flex-col overflow-y-auto border-l border-glass-border p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="font-mono text-[11px] text-ink-faint">Lead #{id}</span>
            <h2 className="font-display text-[24px] font-black uppercase leading-tight text-ink">{l?.company ?? "…"}</h2>
          </div>
          <button type="button" aria-label="Tutup" onClick={onClose} className="text-ink-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        {err && <Notice tone="red" text={err} />}
        {notice && <Notice tone="blue" text={notice} onClose={() => setNotice(null)} />}
        {l && d && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <select id="ld-stage" aria-label="Tahap" className={`${inputCls} w-auto`} value={l.stage} onChange={(e) => act(() => setStageAction(id, e.target.value as Lead["stage"]))}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button type="button" className={chipCls(l.autopilot)} onClick={() => act(() => updateLeadAction(id, { autopilot: !l.autopilot }))}>
                {l.autopilot ? <><Bot className="mr-1 inline h-3.5 w-3.5" />AI autopilot</> : <><Hand className="mr-1 inline h-3.5 w-3.5" />Manual</>}
              </button>
              <Badge>{CATEGORIES[l.category] ?? l.category}</Badge>
              <span className="font-mono text-[11px] text-ink-faint">sumber {l.source}</span>
            </div>
            {l.needs_human && (
              <div className="tint-red flex items-start justify-between gap-3 rounded-card p-3 font-body text-[13px]">
                <span className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {l.handoff_reason ?? "Butuh manusia"}</span>
                <Button size="sm" variant="secondary" onClick={() => act(() => updateLeadAction(id, { needs_human: false, handoff_reason: null }), "Ditandai selesai — AI boleh lanjut.")}>Selesai</Button>
              </div>
            )}
            {l.summary && <div className="rounded-card border border-glass-border p-3 font-body text-[13px] text-ink"><span className="mb-1 flex items-center gap-1 font-semibold text-ink-soft"><Sparkles className="h-3.5 w-3.5" /> Ringkasan AI</span>{l.summary}</div>}

            <div className="grid grid-cols-2 gap-2 font-body text-[13px]">
              <span className="text-ink-soft">Nilai</span><span className="text-ink">{fmtIdr(l.value_estimate)}</span>
              <span className="text-ink-soft">Produk</span><span className="text-ink">{l.products.map((p) => (PRODUCTS[p] ?? p).split(" (")[0]).join(", ") || "–"}</span>
              <span className="text-ink-soft">Kota</span><span className="text-ink">{l.city ?? "–"}</span>
              <span className="text-ink-soft">PIC</span><span className="text-ink">{l.owner_email ?? "–"}</span>
              <span className="text-ink-soft">Terakhir masuk / keluar</span><span className="text-ink">{when(l.last_inbound_at)} / {when(l.last_outbound_at)}</span>
            </div>
            {l.notes && <p className="whitespace-pre-line rounded-sm bg-glass p-2 font-body text-[12.5px] text-ink">{l.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdit({ company: l.company, category: l.category, products: l.products, value_estimate: l.value_estimate, city: l.city, notes: l.notes, owner_email: l.owner_email })}>Ubah data</Button>
              <Button size="sm" variant="secondary" disabled={busy || !d.contacts.length} onClick={() => act(() => contactNowAction(id))}><Bot /> AI hubungi sekarang</Button>
              <Button size="sm" onClick={() => setMeeting(true)}><CalendarPlus /> Jadwalkan meeting</Button>
            </div>

            <section className="flex flex-col gap-2">
              <h3 className="font-display text-[16px] font-bold uppercase text-ink">Kontak</h3>
              {d.contacts.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-glass-border p-2 font-body text-[13px]">
                  <span className="min-w-0"><b className="text-ink">{c.name ?? "–"}</b>{c.title ? <span className="text-ink-soft"> · {c.title}</span> : null}<span className="block font-mono text-[11.5px] text-ink-soft">{c.phone ?? ""} {c.email ?? ""}</span></span>
                  <span className="flex gap-1">
                    {c.phone && <Button size="sm" variant="ghost" onClick={() => setCompose({ contact: c, channel: "wa" })}><MessageCircle /> WA</Button>}
                    {c.email && <Button size="sm" variant="ghost" onClick={() => setCompose({ contact: c, channel: "email" })}><Mail /> Email</Button>}
                  </span>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setNewContact(true)}><Plus /> Tambah kontak</Button>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="font-display text-[16px] font-bold uppercase text-ink">Percakapan</h3>
              {!d.conversations.length && <p className="font-body text-[12.5px] text-ink-faint">Belum ada percakapan.</p>}
              {d.conversations.map((c) => (
                <button key={c.id} type="button" onClick={() => onOpenConversation(c.id)} className="flex items-center justify-between gap-2 rounded-sm border border-glass-border p-2 text-left font-body text-[13px] hover:border-ink-faint">
                  <span className="min-w-0"><span className="inline-flex items-center gap-1 text-ink">{c.channel === "wa" ? <MessageCircle className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />} {c.channel === "wa" ? "WhatsApp" : c.subject ?? "Email"}</span><span className="block truncate text-[12px] text-ink-soft">{c.last_preview}</span></span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">{c.mode === "manual" ? "manual" : "AI"} · {when(c.last_message_at)}</span>
                </button>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="font-display text-[16px] font-bold uppercase text-ink">Meeting</h3>
              {!d.meetings.length && <p className="font-body text-[12.5px] text-ink-faint">Belum ada meeting.</p>}
              {d.meetings.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-sm border border-glass-border p-2 font-body text-[13px]">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-ink">{m.kind === "online" ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />} {when(m.start_at, true)}</span>
                    {m.meet_url && <a href={m.meet_url} target="_blank" rel="noreferrer" className="block truncate text-[12px] text-red">{m.meet_url}</a>}
                    {m.location && <span className="block truncate text-[12px] text-ink-soft">{m.location}</span>}
                    {m.outcome && <span className="block text-[12px] text-ink-soft">{m.outcome}</span>}
                  </span>
                  <Badge tone={m.status === "scheduled" ? "blue" : m.status === "done" ? "green" : m.status === "no_show" ? "red" : "neutral"}>{m.status}</Badge>
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="font-display text-[16px] font-bold uppercase text-ink">Otomasi terjadwal</h3>
              {!d.tasks.length && <p className="font-body text-[12.5px] text-ink-faint">Tidak ada.</p>}
              {d.tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 font-body text-[12.5px]">
                  <span className="text-ink">{TASK_LABEL[t.kind] ?? t.kind} · <span className="text-ink-soft">{when(t.due_at, true)}</span></span>
                  <button type="button" className="text-ink-faint hover:text-red" aria-label="Batalkan" onClick={() => act(() => cancelTaskAction(t.id))}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="font-display text-[16px] font-bold uppercase text-ink">Jejak</h3>
              <ol className="flex flex-col gap-1.5 border-l-2 border-glass-border pl-3">
                {d.activity.map((a) => (
                  <li key={a.id} className="font-body text-[12.5px]">
                    <span className={`${a.actor === "ai" ? "text-red" : "text-ink"}`}>{a.title}</span>
                    <span className="block font-mono text-[10.5px] text-ink-faint">{when(a.at, true)} · {a.actor}</span>
                    {typeof a.detail?.reasoning === "string" && a.detail.reasoning && <span className="block text-[11.5px] italic text-ink-soft">“{a.detail.reasoning}”</span>}
                  </li>
                ))}
              </ol>
            </section>

            {canAdmin && (
              <Button size="sm" variant="outline" onClick={() => { if (window.confirm(`Hapus ${l.company} beserta semua percakapannya?`)) act(async () => { const r = await deleteLeadAction(id); if (r.ok) onClose(); return r; }); }}>
                <Trash2 /> Hapus lead
              </Button>
            )}
          </div>
        )}

        {edit && l && (
          <Modal title="Ubah lead" onClose={() => setEdit(null)} wide>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Perusahaan"><input id="el-company" className={inputCls} value={edit.company ?? ""} onChange={(e) => setEdit({ ...edit, company: e.target.value })} /></Field>
              <Field label="Kategori">
                <select id="el-cat" className={inputCls} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Produk" className="sm:col-span-2">
                <div className="flex flex-wrap gap-1">{Object.entries(PRODUCTS).map(([k, v]) => <button key={k} type="button" className={chipCls(!!edit.products?.includes(k))} onClick={() => setEdit({ ...edit, products: edit.products?.includes(k) ? edit.products.filter((x) => x !== k) : [...(edit.products ?? []), k] })}>{v.split(" (")[0]}</button>)}</div>
              </Field>
              <Field label="Estimasi nilai (Rp)"><input id="el-value" className={inputCls} type="number" value={edit.value_estimate ?? ""} onChange={(e) => setEdit({ ...edit, value_estimate: e.target.value || null })} /></Field>
              <Field label="Kota"><input id="el-city" className={inputCls} value={edit.city ?? ""} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
              <Field label="PIC (email)"><input id="el-owner" className={inputCls} value={edit.owner_email ?? ""} onChange={(e) => setEdit({ ...edit, owner_email: e.target.value })} /></Field>
              <Field label="Catatan" className="sm:col-span-2"><textarea id="el-notes" className={areaCls} rows={4} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>Batal</Button>
              <Button onClick={() => { act(() => updateLeadAction(id, edit)); setEdit(null); }}>Simpan</Button>
            </div>
          </Modal>
        )}
        {newContact && <NewContact leadId={id} onClose={() => setNewContact(false)} onSaved={() => { setNewContact(false); load(); }} />}
        {compose && l && <Compose leadId={id} contact={compose.contact} channel={compose.channel} company={l.company} onClose={() => setCompose(null)} onSent={(cid) => { setCompose(null); onOpenConversation(cid); }} />}
        {meeting && l && (
          <Modal title={`Meeting dengan ${l.company}`} onClose={() => setMeeting(false)} wide>
            <MeetingForm leadId={id} onDone={(m) => { setMeeting(false); setNotice(m); load(); onChanged(); }} />
          </Modal>
        )}
        {l && <p className="mt-6 font-mono text-[10.5px] text-ink-faint">Tahap: {STAGE_LABEL[l.stage]} · dibuat {when(l.created_at)}</p>}
      </div>
    </div>
  );
}

function NewContact({ leadId, onClose, onSaved }: { leadId: number; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState({ name: "", title: "", phone: "", email: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Modal title="Tambah kontak" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nama"><input id="nc-name" className={inputCls} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
        <Field label="Jabatan"><input id="nc-title" className={inputCls} value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} /></Field>
        <Field label="WhatsApp"><input id="nc-phone" className={inputCls} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
        <Field label="Email"><input id="nc-email" className={inputCls} value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
      </div>
      {err && <p className="mt-2 font-body text-[12px] text-red">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button disabled={busy} onClick={() => start(async () => { const r = await addContactAction(leadId, c); if (r.ok) onSaved(); else setErr(r.error); })}>Simpan</Button>
      </div>
    </Modal>
  );
}

function Compose({ leadId, contact, channel, company, onClose, onSent }: { leadId: number; contact: Contact; channel: "wa" | "email"; company: string; onClose: () => void; onSent: (conversationId: number) => void }) {
  const [subject, setSubject] = useState(`Kolaborasi 20FIT × ${company}`);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Modal title={`${channel === "wa" ? "WhatsApp" : "Email"} ke ${contact.name ?? contact.phone ?? contact.email}`} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        {channel === "email" && <Field label="Subjek"><input id="cp-subject" className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
        <Field label="Pesan"><textarea id="cp-text" className={areaCls} rows={7} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <p className="font-body text-[12px] text-ink-soft">Pesan dikirim atas namamu. AI akan melanjutkan percakapan ini setelah masa ambil-alih selesai (lihat Pengaturan agent).</p>
        {err && <p className="font-body text-[12px] text-red">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button disabled={busy || !text.trim()} onClick={() => start(async () => {
            const r = await startConversationAction(leadId, contact.id, channel, text, channel === "email" ? subject : null);
            if (r.ok) onSent(r.conversationId); else setErr(r.error);
          })}><Send /> Kirim</Button>
        </div>
      </div>
    </Modal>
  );
}
