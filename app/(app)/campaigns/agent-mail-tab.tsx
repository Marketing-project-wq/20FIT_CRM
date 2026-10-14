"use client";

import { useState, useTransition } from "react";
import { Bot, Check, Copy, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import type { DeliveryRow } from "@/lib/crm/deliveries";
import { AGENT_MAIL_PROMPT_TEMPLATE, AGENT_MCP_NAME } from "@/lib/crm/agent-mail/guide";
import { issueAgentTokenAction } from "./agent-mail-actions";
import { CampaignTable } from "./campaign-table";

function CopyBlock({ label, value, copyLabel, copiedLabel, mono = true }: { label: string; value: string; copyLabel: string; copiedLabel: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* clipboard blocked — the text stays selectable */
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-body text-[12px] font-semibold text-ink-soft">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-sm border border-glass-border px-2.5 py-1 font-body text-[12px] text-ink-soft transition-colors hover:text-ink"
        >
          {done ? <Check className="h-3.5 w-3.5 text-green" /> : <Copy className="h-3.5 w-3.5" />}
          {done ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre
        className={`max-h-[360px] overflow-auto whitespace-pre-wrap break-all rounded-sm border border-glass-border bg-glass px-3 py-2.5 text-[12px] leading-relaxed text-ink ${mono ? "font-mono" : "font-body"}`}
      >
        {value}
      </pre>
    </div>
  );
}

export function AgentMailTab({
  rows,
  canIssue,
  configured,
  mcpUrl,
}: {
  rows: DeliveryRow[];
  canIssue: boolean;
  configured: boolean;
  mcpUrl: string;
}) {
  const { t } = useI18n();
  const a = t.campaignsPage.agentMail;
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function issue() {
    setErr(null);
    start(async () => {
      const r = await issueAgentTokenAction();
      if (r.ok && r.token) setToken(r.token);
      else setErr(r.error === "not_configured" ? a.notConfigured : r.error === "denied" ? a.noPermission : a.issueFailed);
    });
  }

  const command = `claude mcp add --transport http ${AGENT_MCP_NAME} ${mcpUrl} --header "Authorization: Bearer ${token ?? "<TOKEN>"}"`;
  const tools = [a.toolSegments, a.toolImport, a.toolEmail, a.toolTest, a.toolPreview, a.toolSend, a.toolStats, a.toolStop];

  return (
    <div className="flex flex-col gap-6">
      <div className="glass flex items-start gap-3 rounded-card p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red text-white">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <p className="font-body text-[14px] leading-relaxed text-ink-soft">{a.lead}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-6">
          <section className="glass flex flex-col gap-3 rounded-card p-5">
            <h2 className="font-display text-[18px] font-black uppercase tracking-wide text-ink">{a.step1Title}</h2>
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">{a.step1Body}</p>
            {!configured ? (
              <p className="tint-red rounded-sm px-3 py-2 font-body text-[13px]">{a.notConfigured}</p>
            ) : !canIssue ? (
              <p className="tint-amber rounded-sm px-3 py-2 font-body text-[13px]">{a.noPermission}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={issue}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-red px-4 py-2 font-display text-[13px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" aria-hidden />
                  {pending ? a.issuing : a.issueBtn}
                </button>
                {err && <span className="font-body text-[13px] text-red">{err}</span>}
              </div>
            )}
            {token && (
              <>
                <p className="tint-amber rounded-sm px-3 py-2 font-body text-[12px] leading-relaxed">{a.tokenShownOnce}</p>
                <CopyBlock label={a.tokenLabel} value={token} copyLabel={a.copy} copiedLabel={a.copied} />
              </>
            )}
            <CopyBlock label={a.commandLabel} value={command} copyLabel={a.copy} copiedLabel={a.copied} />
          </section>

          <section className="glass flex flex-col gap-3 rounded-card p-5">
            <h2 className="font-display text-[18px] font-black uppercase tracking-wide text-ink">{a.step2Title}</h2>
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">{a.step2Body}</p>
            <CopyBlock label="Prompt" value={AGENT_MAIL_PROMPT_TEMPLATE} copyLabel={a.copy} copiedLabel={a.copied} mono={false} />
          </section>
        </div>

        <aside className="glass flex h-fit flex-col gap-3 rounded-card p-5">
          <h2 className="font-display text-[16px] font-black uppercase tracking-wide text-ink">{a.toolsTitle}</h2>
          <ul className="flex flex-col gap-2">
            {tools.map((tool) => (
              <li key={tool} className="flex items-start gap-2 font-body text-[13px] leading-snug text-ink-soft">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" aria-hidden />
                {tool}
              </li>
            ))}
          </ul>
          <div className="pt-1">
            <Badge tone="blue">MCP</Badge>
            <p className="mt-2 break-all font-mono text-[12px] text-ink-faint">{mcpUrl}</p>
          </div>
        </aside>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[18px] font-black uppercase tracking-wide text-ink">{a.step3Title}</h2>
          <p className="mt-1 font-body text-[13px] leading-relaxed text-ink-soft">{a.step3Body}</p>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-glass-border px-6 py-12 text-center">
            <p className="font-body text-[13px] text-ink-soft">{a.listEmpty}</p>
          </div>
        ) : (
          <CampaignTable rows={rows} detailHref={(runId) => `/campaigns?tab=kiriman&run=${runId}`} />
        )}
      </section>
    </div>
  );
}
