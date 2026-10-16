"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanSquare, CalendarDays, MessagesSquare, Bot, PlugZap } from "lucide-react";
import { Pipeline } from "./pipeline";
import { CalendarTab } from "./calendar-tab";
import { Inbox } from "./inbox";
import { AgentTab } from "./agent-tab";
import { Connections } from "./connections";
import { LeadDrawer } from "./lead-drawer";
import { Notice } from "./ui";

export type Tab = "pipeline" | "kalender" | "inbox" | "agent" | "pengaturan";

const TABS: { key: Tab; label: string; icon: typeof Bot }[] = [
  { key: "pipeline", label: "Pipeline", icon: KanbanSquare },
  { key: "kalender", label: "Kalender & kasus", icon: CalendarDays },
  { key: "inbox", label: "WhatsApp & Email", icon: MessagesSquare },
  { key: "agent", label: "AI Agent", icon: Bot },
  { key: "pengaturan", label: "Koneksi", icon: PlugZap },
];

export function PartnershipClient(props: { initialTab: Tab; initialLead: number | null; initialConversation: number | null; googleNotice: string | null; canAdmin: boolean; userEmail: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [leadId, setLeadId] = useState<number | null>(props.initialLead);
  const [conversationId, setConversationId] = useState<number | null>(props.initialConversation);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const go = (t: Tab) => {
    setTab(t);
    router.replace(`/partnership?tab=${t}`, { scroll: false });
  };
  const openConversation = (id: number) => {
    setConversationId(id);
    setLeadId(null);
    go("inbox");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Partnership</h1>
        <p className="max-w-3xl font-body text-[14px] leading-relaxed text-ink-soft">
          Dari lead sampai meeting: AI agent membalas WhatsApp & email partner, follow-up otomatis, menjadwalkan Google Meet atau tatap muka, dan
          menyerahkan ke tim kalau perlu. Tim bisa mengambil alih percakapan kapan saja.
        </p>
      </div>

      {props.googleNotice && (
        <Notice
          tone={props.googleNotice === "ok" ? "green" : "amber"}
          text={props.googleNotice === "ok" ? "Google tersambung. Email partner masuk ke inbox ini dan meeting otomatis dapat link Google Meet." : `Google belum tersambung: ${props.googleNotice}`}
        />
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-glass-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => go(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-body text-[13px] ${tab === t.key ? "bg-ink text-white" : "text-ink-soft hover:bg-glass hover:text-ink"}`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "pipeline" && <Pipeline refreshKey={refreshKey} onOpenLead={setLeadId} canAdmin={props.canAdmin} />}
      {tab === "kalender" && <CalendarTab refreshKey={refreshKey} onOpenLead={setLeadId} onChanged={bump} />}
      {tab === "inbox" && <Inbox initialConversation={conversationId} onOpenLead={setLeadId} />}
      {tab === "agent" && <AgentTab canAdmin={props.canAdmin} onOpenLead={setLeadId} />}
      {tab === "pengaturan" && <Connections canAdmin={props.canAdmin} />}

      {leadId != null && (
        <LeadDrawer
          id={leadId}
          canAdmin={props.canAdmin}
          onClose={() => setLeadId(null)}
          onChanged={bump}
          onOpenConversation={openConversation}
        />
      )}
    </div>
  );
}
