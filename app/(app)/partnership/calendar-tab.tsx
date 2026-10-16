"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Video, MapPin, Plus, AlertTriangle, Ghost, CalendarX, ClipboardCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_SETTINGS, TASK_LABEL, type Lead, type Meeting, type Task } from "@/lib/partnership/types";
import { boardAction, calendarAction, createMeetingAction, meetingStatusAction, rescheduleAction, slotsAction } from "./actions";
import { Field, Modal, Notice, ago, areaCls, chipCls, inputCls, when } from "./ui";

const WIB = 7 * 3600_000;
const wibDate = (iso: string) => new Date(+new Date(iso) + WIB).toISOString().slice(0, 10);
const todayWib = () => new Date(Date.now() + WIB).toISOString().slice(0, 10);
const STATUS_TONE: Record<string, "blue" | "green" | "red" | "neutral" | "amber"> = { scheduled: "blue", done: "green", no_show: "red", cancelled: "neutral", proposed: "amber" };
const STATUS_LABEL: Record<string, string> = { scheduled: "Terjadwal", done: "Selesai", no_show: "Tidak hadir", cancelled: "Batal", proposed: "Diusulkan" };

export function CalendarTab({ refreshKey, onOpenLead, onChanged }: { refreshKey: number; onOpenLead: (id: number) => void; onChanged: () => void }) {
  const [month, setMonth] = useState(() => { const t = new Date(Date.now() + WIB); return { y: t.getUTCFullYear(), m: t.getUTCMonth() }; });
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sel, setSel] = useState<Meeting | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [, start] = useTransition();

  const range = useMemo(() => {
    const from = new Date(Date.UTC(month.y, month.m, 1) - WIB - 7 * 86400_000);
    const to = new Date(Date.UTC(month.y, month.m + 1, 1) - WIB + 14 * 86400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [month]);

  const load = () => start(async () => {
    const [c, b] = await Promise.all([calendarAction(range.from, range.to), boardAction()]);
    if (c.ok) { setMeetings(c.meetings); setTasks(c.tasks); }
    if (b.ok) setLeads(b.leads);
  });
  useEffect(load, [range, refreshKey]);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(month.y, month.m, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const total = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= total; d++) cells.push(new Date(Date.UTC(month.y, month.m, d)).toISOString().slice(0, 10));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);

  const byDay = useMemo(() => {
    const m = new Map<string, { meetings: Meeting[]; tasks: Task[] }>();
    for (const x of meetings) { const k = wibDate(x.start_at); if (!m.has(k)) m.set(k, { meetings: [], tasks: [] }); m.get(k)!.meetings.push(x); }
    for (const t of tasks) { const k = wibDate(t.due_at); if (!m.has(k)) m.set(k, { meetings: [], tasks: [] }); m.get(k)!.tasks.push(t); }
    return m;
  }, [meetings, tasks]);

  const upcoming = meetings.filter((m) => m.status === "scheduled" && +new Date(m.end_at) > Date.now()).slice(0, 12);
  const needsOutcome = meetings.filter((m) => m.status === "scheduled" && +new Date(m.end_at) < Date.now());
  const noShow = meetings.filter((m) => m.status === "no_show");
  const ghosting = leads.filter((l) => l.stage === "ghosting");
  const human = leads.filter((l) => l.needs_human);
  const silent = leads.filter((l) => ["contacted", "qualified", "proposal", "negotiation"].includes(l.stage) && l.last_outbound_at && (!l.last_inbound_at || +new Date(l.last_inbound_at) < +new Date(l.last_outbound_at)));
  const today = todayWib();

  return (
    <div className="flex flex-col gap-4">
      {notice && <Notice tone="blue" text={notice} onClose={() => setNotice(null)} />}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-card border border-glass-border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" aria-label="Bulan sebelumnya" onClick={() => setMonth((x) => (x.m === 0 ? { y: x.y - 1, m: 11 } : { y: x.y, m: x.m - 1 }))}><ChevronLeft /></Button>
              <span className="font-display text-[18px] font-bold uppercase text-ink">{new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
              <Button size="sm" variant="ghost" aria-label="Bulan berikutnya" onClick={() => setMonth((x) => (x.m === 11 ? { y: x.y + 1, m: 0 } : { y: x.y, m: x.m + 1 }))}><ChevronRight /></Button>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}><Plus /> Meeting baru</Button>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-sm border border-glass-border bg-glass-border">
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d} className="card px-2 py-1 font-mono text-[10.5px] uppercase text-ink-faint">{d}</div>)}
            {days.map((d, i) => {
              const e = d ? byDay.get(d) : undefined;
              return (
                <div key={i} className={`card min-h-[96px] min-w-0 p-1.5 ${d === today ? "ring-2 ring-inset ring-red" : ""}`}>
                  {d && <span className="font-mono text-[11px] text-ink-soft">{Number(d.slice(8))}</span>}
                  <div className="mt-1 flex flex-col gap-0.5">
                    {e?.meetings.map((m) => (
                      <button key={m.id} type="button" onClick={() => setSel(m)} className={`tint-${STATUS_TONE[m.status]} truncate rounded-sm px-1 py-0.5 text-left font-body text-[10.5px]`}>
                        {new Date(m.start_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} {m.company}
                      </button>
                    ))}
                    {e && e.tasks.length > 0 && <span className="truncate font-body text-[10px] text-ink-faint">+{e.tasks.length} otomasi</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel title="Meeting mendatang" icon={Video}>
            {!upcoming.length && <Empty text="Belum ada meeting terjadwal." />}
            {upcoming.map((m) => <MeetingRow key={m.id} m={m} onClick={() => setSel(m)} />)}
          </Panel>
          <Panel title="Otomasi 7 hari ke depan" icon={Clock}>
            {tasks.filter((t) => +new Date(t.due_at) < Date.now() + 7 * 86400_000).slice(0, 12).map((t) => (
              <button key={t.id} type="button" onClick={() => onOpenLead(t.lead_id)} className="flex justify-between gap-2 text-left font-body text-[12.5px]">
                <span className="truncate text-ink">{TASK_LABEL[t.kind] ?? t.kind} · {t.company}</span><span className="shrink-0 font-mono text-[11px] text-ink-faint">{when(t.due_at)}</span>
              </button>
            ))}
            {!tasks.length && <Empty text="Tidak ada otomasi terjadwal." />}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <CaseList title="Isi hasil meeting" icon={ClipboardCheck} tone="amber" hint="Meeting sudah lewat, statusnya belum diisi" items={needsOutcome.map((m) => ({ id: m.lead_id, label: m.company ?? "", sub: when(m.start_at, true), onClick: () => setSel(m) }))} />
        <CaseList title="Butuh manusia" icon={AlertTriangle} tone="red" hint="AI berhenti & menunggu tim" items={human.map((l) => ({ id: l.id, label: l.company, sub: l.handoff_reason ?? "", onClick: () => onOpenLead(l.id) }))} />
        <CaseList title="Menunggu balasan" icon={Clock} tone="blue" hint="Pesan terakhir dari kita, follow-up berjalan" items={silent.map((l) => ({ id: l.id, label: l.company, sub: `${ago(l.last_outbound_at)} · follow-up ${l.followup_count}x`, onClick: () => onOpenLead(l.id) }))} />
        <CaseList title="Ghosting" icon={Ghost} tone="neutral" hint={`Tidak membalas ${DEFAULT_SETTINGS.followup_days.length}x follow-up; AI menyapa lagi otomatis`} items={ghosting.map((l) => ({ id: l.id, label: l.company, sub: `terakhir ${ago(l.last_outbound_at)}`, onClick: () => onOpenLead(l.id) }))} />
        <CaseList title="Tidak hadir" icon={CalendarX} tone="red" hint="AI menawarkan jadwal ulang" items={noShow.map((m) => ({ id: m.lead_id, label: m.company ?? "", sub: when(m.start_at, true), onClick: () => setSel(m) }))} />
      </div>

      {sel && <MeetingDetail m={sel} onClose={() => setSel(null)} onOpenLead={onOpenLead} onChanged={(t) => { setSel(null); setNotice(t); load(); onChanged(); }} />}
      {creating && (
        <Modal title="Meeting baru" onClose={() => setCreating(false)} wide>
          <MeetingForm leads={leads} onDone={(t) => { setCreating(false); setNotice(t); load(); onChanged(); }} />
        </Modal>
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Video; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-glass-border p-3">
      <span className="flex items-center gap-1.5 font-display text-[15px] font-bold uppercase text-ink"><Icon className="h-4 w-4 text-red" /> {title}</span>
      {children}
    </div>
  );
}
const Empty = ({ text }: { text: string }) => <span className="font-body text-[12px] text-ink-faint">{text}</span>;

function MeetingRow({ m, onClick }: { m: Meeting; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between gap-2 rounded-sm border border-glass-border p-2 text-left hover:border-ink-faint">
      <span className="min-w-0">
        <span className="block truncate font-body text-[13px] font-semibold text-ink">{m.company}</span>
        <span className="flex items-center gap-1 font-body text-[11.5px] text-ink-soft">{m.kind === "online" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />} {when(m.start_at, true)}</span>
      </span>
      <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
    </button>
  );
}

function CaseList({ title, icon: Icon, tone, hint, items }: { title: string; icon: typeof Video; tone: string; hint: string; items: { id: number; label: string; sub: string; onClick: () => void }[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-glass-border p-3">
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-display text-[14px] font-bold uppercase text-ink"><Icon className="h-4 w-4" /> {title}</span>
        <span className={`tint-${tone} rounded-full px-2 font-mono text-[11px]`}>{items.length}</span>
      </span>
      <span className="font-body text-[11px] text-ink-faint">{hint}</span>
      <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto">
        {items.map((x, i) => (
          <button key={`${x.id}-${i}`} type="button" onClick={x.onClick} className="rounded-sm px-1 py-1 text-left hover:bg-glass">
            <span className="block truncate font-body text-[12.5px] text-ink">{x.label}</span>
            <span className="block truncate font-body text-[11px] text-ink-soft">{x.sub}</span>
          </button>
        ))}
        {!items.length && <Empty text="Kosong" />}
      </div>
    </div>
  );
}

function MeetingDetail({ m, onClose, onOpenLead, onChanged }: { m: Meeting; onClose: () => void; onOpenLead: (id: number) => void; onChanged: (t: string) => void }) {
  const [notes, setNotes] = useState(m.outcome ?? "");
  const [date, setDate] = useState(wibDate(m.start_at));
  const [time, setTime] = useState(new Date(m.start_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }));
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) onChanged(ok); else setErr(r.error ?? "Gagal"); });
  return (
    <Modal title={m.title} onClose={onClose} wide>
      <div className="flex flex-col gap-3 font-body text-[13px] text-ink">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
          <span>{when(m.start_at, true)} – {new Date(m.end_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB</span>
          <Button size="sm" variant="ghost" onClick={() => { onClose(); onOpenLead(m.lead_id); }}>Buka lead</Button>
        </div>
        {m.meet_url && <a className="text-red" href={m.meet_url} target="_blank" rel="noreferrer"><Video className="mr-1 inline h-4 w-4" />{m.meet_url}</a>}
        {m.location && <span><MapPin className="mr-1 inline h-4 w-4" />{m.location}</span>}
        <span className="text-ink-soft">Peserta: {m.attendees.map((a) => a.email).filter(Boolean).join(", ") || "–"}{m.google_event_id ? " · ada di Google Calendar" : " · undangan .ics via email"}</span>
        {m.notes && <span className="text-ink-soft">Agenda: {m.notes}</span>}
        <Field label="Hasil / catatan meeting (dipakai AI untuk follow-up)"><textarea id="mt-notes" className={areaCls} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mis. tertarik paket Race Lab + Photo untuk 3 event 2027, minta proposal minggu depan." /></Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => run(() => meetingStatusAction(m.id, "done", notes), "Meeting ditandai selesai. AI akan mengirim follow-up.")}>Selesai</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => meetingStatusAction(m.id, "no_show", notes), "Ditandai tidak hadir. AI akan menawarkan jadwal ulang.")}>Partner tidak hadir</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => meetingStatusAction(m.id, "cancelled", notes), "Meeting dibatalkan.")}>Batalkan</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-glass-border pt-3">
          <Field label="Jadwal ulang: tanggal"><input id="mt-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Jam (WIB)"><input id="mt-time" type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => rescheduleAction(m.id, date, time), "Meeting dijadwal ulang.")}>Pindahkan</Button>
        </div>
        {err && <p className="text-red">{err}</p>}
      </div>
    </Modal>
  );
}

/** Book a meeting: pick a lead (or fixed), a free slot or any date/time, online (Google Meet) or offline. */
export function MeetingForm({ leadId, leads, onDone }: { leadId?: number; leads?: Lead[]; onDone: (t: string) => void }) {
  const [lead, setLead] = useState<number | "">(leadId ?? "");
  const [slots, setSlots] = useState<{ id: string; start: string; label: string }[]>([]);
  const [date, setDate] = useState(todayWib());
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState(DEFAULT_SETTINGS.meeting_minutes);
  const [kind, setKind] = useState<"online" | "offline">("online");
  const [location, setLocation] = useState(DEFAULT_SETTINGS.offline_locations[0]);
  const [meetUrl, setMeetUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [attendees, setAttendees] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => { start(async () => { const r = await slotsAction(); if (r.ok) setSlots(r.slots); }); }, []);
  return (
    <div className="flex flex-col gap-3">
      {!leadId && (
        <Field label="Lead">
          <select id="mf-lead" className={inputCls} value={lead} onChange={(e) => setLead(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Pilih lead…</option>
            {(leads ?? []).filter((l) => !["lost"].includes(l.stage)).map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}
          </select>
        </Field>
      )}
      <div className="flex flex-col gap-1">
        <span className="font-body text-[12px] font-semibold text-ink-soft">Slot kosong (jam kerja, sudah dikurangi meeting lain{slots.length ? "" : " — memuat"})</span>
        <div className="flex flex-wrap gap-1">
          {slots.map((s) => {
            const d = wibDate(s.start);
            const t = new Date(s.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
            return <button key={s.id} type="button" className={chipCls(date === d && time === t)} onClick={() => { setDate(d); setTime(t); }}>{s.label.replace(" WIB", "")}</button>;
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Tanggal"><input id="mf-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Jam (WIB)"><input id="mf-time" type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Durasi (menit)"><input id="mf-min" type="number" className={inputCls} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
        <Field label="Jenis">
          <select id="mf-kind" className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as "online" | "offline")}>
            <option value="online">Online (Google Meet)</option>
            <option value="offline">Tatap muka</option>
          </select>
        </Field>
      </div>
      {kind === "offline" ? (
        <Field label="Lokasi">
          <select id="mf-loc" className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)}>
            {DEFAULT_SETTINGS.offline_locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Link Meet (kosongkan kalau Google tersambung — dibuat otomatis)"><input id="mf-meet" className={inputCls} value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} placeholder="https://meet.google.com/…" /></Field>
      )}
      <Field label="Agenda"><input id="mf-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Field label="Undang tambahan (email, pisah koma)"><input id="mf-att" className={inputCls} value={attendees} onChange={(e) => setAttendees(e.target.value)} /></Field>
      {err && <p className="font-body text-[12px] text-red">{err}</p>}
      <div className="flex justify-end">
        <Button disabled={busy || !lead} onClick={() => start(async () => {
          const r = await createMeetingAction({ leadId: Number(lead), date, time, minutes, kind, location, meetUrl, notes, attendees });
          if (r.ok) onDone(`Meeting dijadwalkan${r.meetUrl ? ` · ${r.meetUrl}` : ""}. Undangan terkirim & pengingat dipasang.`); else setErr(r.error);
        })}>Jadwalkan & kirim undangan</Button>
      </div>
    </div>
  );
}
