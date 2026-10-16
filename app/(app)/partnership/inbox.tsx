"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MessageCircle, Mail, Bot, Hand, Send, Sparkles, Trash2, AlertTriangle, Search, Check, CheckCheck, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABEL, type Activity, type Conversation, type Message } from "@/lib/partnership/types";
import { conversationsAction, deleteDraftAction, draftReplyAction, sendDraftAction, sendManualAction, setModeAction, threadAction } from "./actions";
import { Notice, ago, areaCls, chipCls, inputCls, when } from "./ui";

type Filter = "all" | "wa" | "email" | "human" | "unread" | "manual";

export function Inbox({ initialConversation, onOpenLead }: { initialConversation: number | null; onOpenLead: (id: number) => void }) {
  const [rows, setRows] = useState<Conversation[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [qText, setQText] = useState("");
  const [sel, setSel] = useState<number | null>(initialConversation);
  const [, start] = useTransition();

  const loadList = useCallback(() => start(async () => { const r = await conversationsAction(); if (r.ok) setRows(r.rows); }), []);
  useEffect(() => { loadList(); const t = setInterval(loadList, 10_000); return () => clearInterval(t); }, [loadList]);

  const shown = useMemo(() => {
    const ql = qText.trim().toLowerCase();
    return (rows ?? []).filter((c) =>
      (filter === "all" || (filter === "wa" && c.channel === "wa") || (filter === "email" && c.channel === "email") || (filter === "human" && c.needs_human) || (filter === "unread" && c.unread > 0) || (filter === "manual" && c.mode === "manual")) &&
      (!ql || `${c.company} ${c.contact_name ?? ""} ${c.contact_phone ?? ""} ${c.contact_email ?? ""} ${c.last_preview ?? ""}`.toLowerCase().includes(ql)));
  }, [rows, filter, qText]);

  return (
    <div className="grid min-h-[70vh] grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2 rounded-card border border-glass-border p-2">
        <label className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-ink-faint" />
          <input id="inbox-search" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Cari percakapan…" className={`${inputCls} pl-9`} />
        </label>
        <div className="flex flex-wrap gap-1">
          {([["all", "Semua"], ["wa", "WhatsApp"], ["email", "Email"], ["human", "Butuh manusia"], ["unread", "Belum dibaca"], ["manual", "Manual"]] as const).map(([k, v]) => (
            <button key={k} type="button" className={chipCls(filter === k)} onClick={() => setFilter(k)}>{v}</button>
          ))}
        </div>
        <div className="flex max-h-[70vh] flex-col overflow-y-auto">
          {rows === null && <span className="p-3 font-body text-[12px] text-ink-faint">Memuat…</span>}
          {rows !== null && !shown.length && <span className="p-3 font-body text-[12px] text-ink-faint">Belum ada percakapan. Pesan WhatsApp ke nomor partnership dan email ke kotak masuk yang tersambung muncul di sini.</span>}
          {shown.map((c) => (
            <button key={c.id} type="button" onClick={() => setSel(c.id)} className={`flex flex-col gap-0.5 border-b border-glass-border px-2 py-2 text-left ${sel === c.id ? "bg-glass" : "hover:bg-glass"}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {c.channel === "wa" ? <MessageCircle className="h-3.5 w-3.5 shrink-0 text-green" /> : <Mail className="h-3.5 w-3.5 shrink-0 text-blue" />}
                  <span className="truncate font-body text-[13px] font-semibold text-ink">{c.company}</span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">{ago(c.last_message_at)}</span>
              </span>
              <span className="truncate font-body text-[12px] text-ink-soft">{c.contact_name ?? c.contact_phone ?? c.contact_email}{c.channel === "email" && c.subject ? ` · ${c.subject}` : ""}</span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-body text-[12px] text-ink-faint">{c.last_preview}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {c.needs_human && <AlertTriangle className="h-3.5 w-3.5 text-red" />}
                  {c.mode === "manual" ? <Hand className="h-3.5 w-3.5 text-amber" /> : <Bot className="h-3.5 w-3.5 text-ink-faint" />}
                  {c.unread > 0 && <span className="tint-red rounded-full px-1.5 font-mono text-[10.5px]">{c.unread}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {sel ? <Thread key={sel} id={sel} onOpenLead={onOpenLead} onChanged={loadList} /> : (
        <div className="flex items-center justify-center rounded-card border border-dashed border-glass-border p-8 font-body text-[13px] text-ink-faint">Pilih percakapan di kiri.</div>
      )}
    </div>
  );
}

function Tick({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="inline h-3 w-3 text-blue" />;
  if (status === "delivered") return <CheckCheck className="inline h-3 w-3" />;
  if (status === "sent") return <Check className="inline h-3 w-3" />;
  if (status === "sending") return <Clock className="inline h-3 w-3" />;
  if (status === "failed") return <XCircle className="inline h-3 w-3 text-red" />;
  return null;
}

function Thread({ id, onOpenLead, onChanged }: { id: number; onOpenLead: (id: number) => void; onChanged: () => void }) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [notice, setNotice] = useState<{ tone: "red" | "blue" | "green"; text: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(() => start(async () => {
    const r = await threadAction(id);
    if (r.ok) { setConv(r.conversation); setMsgs(r.messages); setActs(r.activity); } else setNotice({ tone: "red", text: r.error });
  }), [id]);
  useEffect(() => { load(); const t = setInterval(load, 8_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) setNotice({ tone: "red", text: r.error ?? "Gagal" }); else { if (ok) setNotice({ tone: "green", text: ok }); after?.(); }
    load(); onChanged();
  });

  if (!conv) return <div className="rounded-card border border-glass-border p-6 font-body text-[13px] text-ink-faint">Memuat…</div>;
  const manual = conv.mode === "manual";
  const aiLog = acts.filter((a) => ["ai_decision", "handoff", "takeover", "mode", "ai_error", "send_failed", "meeting", "stage", "auto_reply"].includes(a.kind)).slice(0, 25);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-h-[70vh] min-w-0 flex-col rounded-card border border-glass-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-glass-border p-3">
          <div className="min-w-0">
            <button type="button" onClick={() => onOpenLead(conv.lead_id)} className="font-display text-[18px] font-bold uppercase text-ink hover:text-red">{conv.company}</button>
            <span className="block font-body text-[12px] text-ink-soft">
              {conv.channel === "wa" ? "WhatsApp" : "Email"} · {conv.contact_name ?? ""} {conv.channel === "wa" ? conv.contact_phone ?? "" : conv.contact_email ?? ""} · {STAGE_LABEL[conv.stage ?? "lead"]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {manual ? (
              <><Badge tone="amber">Manual{conv.manual_until ? ` s/d ${when(conv.manual_until)}` : ""}</Badge>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => setModeAction(id, "auto"), "Dikembalikan ke AI.")}><Bot /> Kembalikan ke AI</Button></>
            ) : (
              <><Badge tone={conv.autopilot && !conv.needs_human ? "green" : "neutral"}>{conv.autopilot && !conv.needs_human ? "AI membalas" : "AI hanya draft"}</Badge>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => setModeAction(id, "manual"), "Percakapan diambil alih.")}><Hand /> Ambil alih</Button></>
            )}
          </div>
        </div>
        {conv.needs_human && <div className="border-b border-glass-border p-2"><Notice tone="red" text="AI menyerahkan lead ini ke tim. Balas manual, lalu klik 'Kembalikan ke AI' bila sudah selesai." /></div>}
        {notice && <div className="p-2"><Notice tone={notice.tone} text={notice.text} onClose={() => setNotice(null)} /></div>}

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3" style={{ maxHeight: "58vh" }}>
          {msgs.map((m) => {
            if (m.status === "draft") {
              const val = drafts[m.id] ?? m.body ?? "";
              return (
                <div key={m.id} className="ml-auto flex w-full max-w-[85%] flex-col gap-1.5 rounded-card border border-dashed border-amber p-2">
                  <span className="flex items-center gap-1 font-body text-[11.5px] text-amber"><Sparkles className="h-3.5 w-3.5" /> Draft AI {typeof m.meta?.why === "string" ? `(${m.meta.why})` : ""}</span>
                  <textarea aria-label="Draft" className={areaCls} rows={4} value={val} onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))} />
                  <span className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => deleteDraftAction(m.id))}><Trash2 /> Buang</Button>
                    <Button size="sm" disabled={busy} onClick={() => run(() => sendDraftAction(m.id, val), "Draft terkirim.")}><Send /> Kirim</Button>
                  </span>
                </div>
              );
            }
            const out = m.direction === "out";
            const who = m.direction === "in" ? (conv.contact_name ?? "Partner") : m.author === "ai" ? "AI" : m.author === "human:hp" ? "Tim (dari HP)" : m.author === "human:gmail" ? "Tim (Gmail)" : m.author.replace("human:", "");
            return (
              <div key={m.id} className={`flex max-w-[85%] flex-col gap-0.5 ${out ? "ml-auto items-end" : "items-start"}`}>
                <span className="font-mono text-[10.5px] text-ink-faint">{who} · {when(m.created_at, true)}</span>
                <div className={`whitespace-pre-wrap rounded-card px-3 py-2 font-body text-[13.5px] leading-relaxed ${out ? (m.author === "ai" ? "tint-blue" : "tint-green") : "card border border-glass-border text-ink"}`}>
                  {typeof m.meta?.subject === "string" && m.meta.subject && conv.channel === "email" && <b className="mb-1 block">{m.meta.subject}</b>}
                  {m.body}
                  {m.attachments?.length > 0 && <span className="mt-1 block font-mono text-[11px]">{m.attachments.map((a) => a.name ?? a.mimetype).join(", ")}</span>}
                </div>
                {out && <span className="font-mono text-[10.5px] text-ink-faint"><Tick status={m.status} /> {m.status === "failed" ? m.error : ""}</span>}
              </div>
            );
          })}
          {!msgs.length && <span className="font-body text-[12px] text-ink-faint">Belum ada pesan.</span>}
          <div ref={end} />
        </div>

        <div className="flex flex-col gap-2 border-t border-glass-border p-3">
          {conv.channel === "email" && !conv.subject && <input id="th-subject" className={inputCls} placeholder="Subjek" value={subject} onChange={(e) => setSubject(e.target.value)} />}
          <textarea id="th-text" className={areaCls} rows={3} placeholder={manual ? "Tulis balasan…" : "Tulis untuk membalas manual (AI akan diam sementara)…"} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap justify-between gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => {
              const r = await draftReplyAction(id);
              if (r.ok) { setText(r.text); if (r.subject && !conv.subject) setSubject(r.subject); setNotice({ tone: "blue", text: r.reasoning ? `AI: ${r.reasoning}` : "Draft AI dimasukkan ke kotak balasan." }); } else setNotice({ tone: "red", text: r.error });
            })}><Sparkles /> Draft AI</Button>
            <Button size="sm" disabled={busy || !text.trim()} onClick={() => run(() => sendManualAction(id, text, subject || null), undefined, () => setText(""))}><Send /> Kirim</Button>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 rounded-card border border-glass-border p-3">
        <span className="flex items-center gap-1.5 font-display text-[15px] font-bold uppercase text-ink"><Bot className="h-4 w-4 text-red" /> Progres AI</span>
        <ol className="flex flex-col gap-2">
          {aiLog.map((a) => (
            <li key={a.id} className="border-l-2 border-glass-border pl-2 font-body text-[12px]">
              <span className={a.kind === "handoff" || a.kind === "ai_error" || a.kind === "send_failed" ? "text-red" : "text-ink"}>{a.title}</span>
              {typeof a.detail?.reasoning === "string" && a.detail.reasoning && <span className="block italic text-ink-soft">“{a.detail.reasoning}”</span>}
              <span className="block font-mono text-[10.5px] text-ink-faint">{when(a.at, true)} · {a.actor}</span>
            </li>
          ))}
          {!aiLog.length && <span className="font-body text-[12px] text-ink-faint">Belum ada aktivitas AI.</span>}
        </ol>
      </div>
    </div>
  );
}
