import "server-only";
import { randomBytes } from "node:crypto";
import { q, q1 } from "./db";
import { addTask, busyMeetings, cancelTasks, getAgentSettings, getLead, listContacts, logActivity, setStage, getMeeting } from "./repo";
import { createEvent, freeBusy, getConnection, googleConfigured, patchEvent } from "./google";
import { notifyTeam, sendResend, textToEmailHtml } from "./messaging";
import type { Meeting } from "./types";

/** Time in WIB (UTC+7, no DST). */
const WIB = 7 * 3600_000;
export const wibParts = (d: Date) => {
  const w = new Date(d.getTime() + WIB);
  return { y: w.getUTCFullYear(), m: w.getUTCMonth(), d: w.getUTCDate(), h: w.getUTCHours(), min: w.getUTCMinutes(), dow: w.getUTCDay() };
};
export const fromWib = (y: number, m: number, d: number, h: number, min = 0) => new Date(Date.UTC(y, m, d, h, min) - WIB);
export const fmtWib = (d: Date | string) =>
  new Date(d).toLocaleString("id-ID", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB";

export interface Slot { id: string; start: string; label: string }

/** Free meeting slots for the next working days (settings hours/days, minus CRM meetings and Google busy). */
export async function availableSlots(count = 8, daysAhead = 10): Promise<Slot[]> {
  const s = await getAgentSettings();
  const now = new Date();
  const until = new Date(now.getTime() + daysAhead * 86400_000);
  const busy: { start: number; end: number }[] = (await busyMeetings(now, until)).map((b) => ({ start: +new Date(b.start_at), end: +new Date(b.end_at) }));
  if (googleConfigured() && (await getConnection())) {
    try { for (const b of await freeBusy(now, until)) busy.push({ start: +new Date(b.start), end: +new Date(b.end) }); } catch { /* calendar optional */ }
  }
  const dur = s.meeting_minutes * 60_000;
  const buf = s.meeting_buffer_min * 60_000;
  const earliest = now.getTime() + 3 * 3600_000; // never offer a slot sooner than 3 hours away
  const out: Slot[] = [];
  const p = wibParts(now);
  for (let day = 0; day <= daysAhead && out.length < count; day++) {
    const base = fromWib(p.y, p.m, p.d + day, 0);
    if (!s.meeting_days.includes(wibParts(base).dow)) continue;
    let perDay = 0;
    for (let h = s.meeting_hours[0]; h < s.meeting_hours[1] && perDay < 3; h++) {
      for (const min of [0, 30]) {
        const st = fromWib(p.y, p.m, p.d + day, h, min);
        const en = st.getTime() + dur;
        if (st.getTime() < earliest || en > fromWib(p.y, p.m, p.d + day, s.meeting_hours[1]).getTime()) continue;
        if (busy.some((b) => st.getTime() < b.end + buf && en + buf > b.start)) continue;
        // spread offers across the day instead of three consecutive half-hours
        if (out.some((o) => Math.abs(+new Date(o.start) - st.getTime()) < 2 * 3600_000)) continue;
        out.push({ id: `S${out.length + 1}`, start: st.toISOString(), label: fmtWib(st) });
        perDay++;
        if (out.length >= count) break;
      }
      if (out.length >= count) break;
    }
  }
  return out;
}

function icsFor(m: { uid: string; title: string; start: Date; end: Date; location: string; description: string; organizer: string; attendees: string[] }): string {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//20FIT//Partnership//ID", "METHOD:REQUEST", "BEGIN:VEVENT",
    `UID:${m.uid}`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(m.start)}`, `DTEND:${f(m.end)}`,
    `SUMMARY:${m.title.replace(/\n/g, " ")}`, `LOCATION:${m.location.replace(/\n/g, " ")}`,
    `DESCRIPTION:${m.description.replace(/\n/g, "\\n")}`, `ORGANIZER:mailto:${m.organizer}`,
    ...m.attendees.map((a) => `ATTENDEE;RSVP=TRUE:mailto:${a}`),
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

/** Book a meeting: Google Calendar event (+Meet link, invitations sent by Google) when connected,
 *  otherwise a CRM meeting + .ics invitation by email. Moves the lead to "meeting" and schedules
 *  reminders (H-1 and 1 hour) and the post-meeting check. */
export async function bookMeeting(input: {
  leadId: number; start: Date; minutes?: number; kind: "online" | "offline"; location?: string | null; meetUrl?: string | null;
  extraAttendees?: string[]; title?: string; notes?: string | null; createdBy: string;
}): Promise<Meeting> {
  const s = await getAgentSettings();
  const lead = await getLead(input.leadId);
  if (!lead) throw new Error("lead tidak ada");
  const contacts = await listContacts(input.leadId);
  const end = new Date(input.start.getTime() + (input.minutes ?? s.meeting_minutes) * 60_000);
  const title = input.title || `20FIT × ${lead.company}`;
  const location = input.kind === "offline" ? input.location || s.offline_locations[0] : null;
  const attendees = Array.from(new Set([...contacts.map((c) => c.email).filter(Boolean) as string[], ...(input.extraAttendees ?? []).filter(Boolean), s.notify_email].filter(Boolean)));
  const description = `Meeting partnership 20FIT × ${lead.company}.${input.notes ? `\n\nAgenda: ${input.notes}` : ""}`;

  let googleId: string | null = null;
  let meetUrl: string | null = input.meetUrl ?? null;
  if (googleConfigured() && (await getConnection())) {
    try {
      const ev = await createEvent({ title, description, start: input.start, end, attendees, online: input.kind === "online", location });
      googleId = ev.id;
      meetUrl = ev.meetUrl ?? meetUrl;
    } catch (e) {
      await logActivity(lead.id, "calendar_failed", `Google Calendar gagal: ${(e as Error).message}`, {}, input.createdBy);
    }
  }
  const m = await q1<Meeting>(
    `insert into p_meeting(lead_id, title, start_at, end_at, kind, location, meet_url, google_event_id, status, attendees, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',$9,$10,$11) returning *`,
    [lead.id, title, input.start.toISOString(), end.toISOString(), input.kind, location, meetUrl, googleId,
     JSON.stringify(attendees.map((email) => ({ email }))), input.notes ?? null, input.createdBy],
  );
  if (!googleId) {
    // No Google: send our own invitation (.ics) to the partner contacts.
    const to = contacts.map((c) => c.email).filter(Boolean) as string[];
    if (to.length) {
      const where = input.kind === "online" ? meetUrl || "Link Google Meet menyusul" : location ?? "";
      const text = `Halo,\n\nBerikut jadwal meeting ${title}:\n${fmtWib(input.start)} (${input.minutes ?? s.meeting_minutes} menit)\n${input.kind === "online" ? "Online" : "Tatap muka"}: ${where}\n\nSampai bertemu!\n\n${s.signature}`;
      try {
        await sendResend({
          to, subject: `Undangan meeting: ${title}`, text, html: textToEmailHtml(text),
          attachments: [{ filename: "undangan.ics", content: Buffer.from(icsFor({ uid: `${randomBytes(8).toString("hex")}@20fit.id`, title, start: input.start, end, location: where, description, organizer: "partnership@20fit.id", attendees: to })).toString("base64"), content_type: "text/calendar" }],
        });
      } catch (e) {
        await logActivity(lead.id, "invite_failed", `Undangan email gagal: ${(e as Error).message}`, {}, input.createdBy);
      }
    }
  }
  await setStage(lead.id, "meeting", input.createdBy);
  await cancelTasks(lead.id, ["followup", "revive", "nurture"]);
  const dayBefore = new Date(input.start.getTime() - 24 * 3600_000);
  if (dayBefore.getTime() > Date.now()) await addTask(lead.id, "meeting_reminder", dayBefore, { meeting_id: m!.id, when: "24h" });
  const hourBefore = new Date(input.start.getTime() - 3600_000);
  if (hourBefore.getTime() > Date.now()) await addTask(lead.id, "meeting_reminder", hourBefore, { meeting_id: m!.id, when: "1h" });
  await addTask(lead.id, "meeting_check", new Date(end.getTime() + 2 * 3600_000), { meeting_id: m!.id });
  await logActivity(lead.id, "meeting", `Meeting dijadwalkan ${fmtWib(input.start)} (${input.kind === "online" ? "online" : "tatap muka"})`, { meeting_id: m!.id, meet_url: meetUrl, google: !!googleId }, input.createdBy);
  if (input.createdBy === "ai") await notifyTeam(`Meeting baru dengan ${lead.company}`, `AI menjadwalkan meeting dengan ${lead.company} pada ${fmtWib(input.start)}.${meetUrl ? `\nGoogle Meet: ${meetUrl}` : ""}${location ? `\nLokasi: ${location}` : ""}`);
  return m!;
}

export async function rescheduleMeeting(id: number, start: Date, actor: string): Promise<void> {
  const m = await getMeeting(id);
  if (!m) throw new Error("meeting tidak ada");
  const dur = +new Date(m.end_at) - +new Date(m.start_at);
  const end = new Date(start.getTime() + dur);
  if (m.google_event_id) await patchEvent(m.google_event_id, { start, end }).catch((e) => logActivity(m.lead_id, "calendar_failed", `Ubah jadwal Google gagal: ${(e as Error).message}`, {}, actor));
  await q("update p_meeting set start_at = $2, end_at = $3, status = 'scheduled', reminded_24h = false, reminded_1h = false, updated_at = now() where id = $1", [id, start.toISOString(), end.toISOString()]);
  await q("update p_task set status = 'cancelled', done_at = now() where status = 'pending' and kind in ('meeting_reminder','meeting_check') and (payload->>'meeting_id')::bigint = $1", [id]);
  const dayBefore = new Date(start.getTime() - 24 * 3600_000);
  if (dayBefore.getTime() > Date.now()) await addTask(m.lead_id, "meeting_reminder", dayBefore, { meeting_id: id, when: "24h" });
  const hourBefore = new Date(start.getTime() - 3600_000);
  if (hourBefore.getTime() > Date.now()) await addTask(m.lead_id, "meeting_reminder", hourBefore, { meeting_id: id, when: "1h" });
  await addTask(m.lead_id, "meeting_check", new Date(end.getTime() + 2 * 3600_000), { meeting_id: id });
  await setStage(m.lead_id, "meeting", actor);
  await logActivity(m.lead_id, "meeting", `Meeting dijadwal ulang ke ${fmtWib(start)}`, { meeting_id: id }, actor);
}

export async function setMeetingStatus(id: number, status: "done" | "no_show" | "cancelled", actor: string, notes?: string | null): Promise<Meeting> {
  const m = await getMeeting(id);
  if (!m) throw new Error("meeting tidak ada");
  if (status === "cancelled" && m.google_event_id) await patchEvent(m.google_event_id, { status: "cancelled" }).catch(() => undefined);
  await q("update p_meeting set status = $2, outcome = coalesce($3, outcome), updated_at = now() where id = $1", [id, status, notes ?? null]);
  await q("update p_task set status = 'cancelled', done_at = now() where status = 'pending' and kind in ('meeting_reminder','meeting_check') and (payload->>'meeting_id')::bigint = $1", [id]);
  const label = status === "done" ? "selesai" : status === "no_show" ? "partner tidak hadir" : "dibatalkan";
  await logActivity(m.lead_id, "meeting", `Meeting ${label}${notes ? `: ${notes.slice(0, 160)}` : ""}`, { meeting_id: id, status }, actor);
  if (status === "done") {
    await setStage(m.lead_id, "met", actor);
    await q("update p_lead set needs_human = false, handoff_reason = null where id = $1 and handoff_reason like 'Isi hasil meeting%'", [m.lead_id]);
    await addTask(m.lead_id, "agent_reply", new Date(Date.now() + 60_000), { reason: "post_meeting", meeting_id: id });
  } else if (status === "no_show") {
    await addTask(m.lead_id, "agent_reply", new Date(Date.now() + 60_000), { reason: "no_show", meeting_id: id });
  } else {
    await setStage(m.lead_id, "qualified", actor);
  }
  return (await getMeeting(id))!;
}
