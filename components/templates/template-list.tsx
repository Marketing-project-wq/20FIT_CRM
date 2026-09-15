"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Mail, MessageCircle, Eye, ExternalLink, Edit, Trash2,
  Copy, Archive, RotateCcw, MoreVertical, Search, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatCount } from "@/lib/i18n";
import { EmailTemplateBuilder } from "./email-template-builder";
import { WhatsAppTemplateBuilder } from "./whatsapp-template-builder";

export type TemplateCategory = "newsletter" | "promo" | "event" | "notification" | "other";
export type TemplateStatus = "draft" | "active" | "archived";

export interface Template {
  id: string;
  template_key: string;
  channel: "email" | "whatsapp";
  language: string;
  name: string;
  display_name: string | null;
  description: string | null;
  category: TemplateCategory | null;
  status: TemplateStatus | null;
  subject: string | null;
  version: number;
  wa_approval_status: string;
  created_at: string;
  body?: string;
}

interface TemplatesPageDict {
  searchPlaceholder: string;
  filterAll: string;
  filterCategory: string;
  filterStatus: string;
  sortName: string;
  sortDate: string;
  sortVersion: string;
  categoryNewsletter: string;
  categoryPromo: string;
  categoryEvent: string;
  categoryNotification: string;
  categoryOther: string;
  statusDraft: string;
  statusActive: string;
  statusArchived: string;
  cardVersion: string;
  cardNoDescription: string;
  emptyTitle: string;
  emptyBody: string;
  emptyFiltered: string;
  createEmail: string;
  createWhatsApp: string;
  emailSection: string;
  whatsAppSection: string;
  preview: string;
  previewNewTab: string;
  edit: string;
  delete: string;
  deleteConfirm: string;
  previewTitle: string;
  sentCount: string;
  neverSent: string;
  duplicate: string;
  archive: string;
  activate: string;
  archiveConfirm: string;
  activateConfirm: string;
  showArchived: string;
  hideArchived: string;
}

interface TemplateListProps {
  templates: Template[];
  lang: "id" | "en";
  t: TemplatesPageDict;
  sentCounts: Record<string, number>;
}

const CATEGORY_LABELS: Record<TemplateCategory, keyof TemplatesPageDict> = {
  newsletter: "categoryNewsletter",
  promo: "categoryPromo",
  event: "categoryEvent",
  notification: "categoryNotification",
  other: "categoryOther",
};

const CATEGORY_TONES: Record<TemplateCategory, "blue" | "amber" | "green" | "red" | "neutral"> = {
  newsletter: "blue",
  promo: "red",
  event: "green",
  notification: "amber",
  other: "neutral",
};

const STATUS_LABELS: Record<TemplateStatus, keyof TemplatesPageDict> = {
  draft: "statusDraft",
  active: "statusActive",
  archived: "statusArchived",
};

const STATUS_TONES: Record<TemplateStatus, "neutral" | "green" | "red"> = {
  draft: "neutral",
  active: "green",
  archived: "red",
};

type SortKey = "name" | "date" | "version";

export function TemplateList({ templates, lang, t, sentCounts }: TemplateListProps) {
  const [showEmailBuilder, setShowEmailBuilder] = useState(false);
  const [showWhatsAppBuilder, setShowWhatsAppBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    let list = templates;
    if (!showArchived) {
      list = list.filter((tpl) => (tpl.status ?? "active") !== "archived");
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((tpl) => {
        const label = tpl.display_name || tpl.name;
        return (
          label.toLowerCase().includes(q) ||
          tpl.template_key.toLowerCase().includes(q) ||
          (tpl.subject?.toLowerCase().includes(q) ?? false) ||
          (tpl.description?.toLowerCase().includes(q) ?? false)
        );
      });
    }
    if (categoryFilter !== "all") {
      list = list.filter((tpl) => (tpl.category ?? "other") === categoryFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((tpl) => (tpl.status ?? "active") === statusFilter);
    }
    const sorted = [...list];
    if (sortBy === "name") {
      sorted.sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
    } else if (sortBy === "version") {
      sorted.sort((a, b) => b.version - a.version);
    }
    return sorted;
  }, [templates, search, categoryFilter, statusFilter, sortBy, showArchived]);

  const emailTemplates = filtered.filter((tpl) => tpl.channel === "email");
  const whatsappTemplates = filtered.filter((tpl) => tpl.channel === "whatsapp");

  async function openEdit(id: string, isWhatsApp: boolean) {
    try {
      const res = await fetch(`/api/templates?id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      const { template } = await res.json();
      setEditingTemplate(template);
      if (isWhatsApp) setShowWhatsAppBuilder(true); else setShowEmailBuilder(true);
    } catch (err) {
      console.error("Failed to load template:", err);
      alert("Failed to load template for editing");
    }
  }

  async function openPreview(id: string) {
    try {
      const res = await fetch(`/api/templates?id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      const { template } = await res.json();
      const html = String(template.body ?? "")
        .replace(/\{\{first_name\}\}/g, "Andi")
        .replace(/\{\{last_name\}\}/g, "Wijaya")
        .replace(/\{\{email\}\}/g, "andi@example.com")
        .replace(/\{\{unsubscribe_url\}\}/g, "#unsubscribe-preview");
      setPreviewHtml(html);
    } catch {
      alert("Failed to load preview");
    }
  }

  async function onDelete(key: string, displayName: string) {
    if (!confirm(t.deleteConfirm.replace("{name}", displayName))) return;
    try {
      const res = await fetch(`/api/templates?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(`Gagal menghapus: ${e.error ?? res.status}`); return; }
      window.location.reload();
    } catch {
      alert("Network error");
    }
  }

  async function onArchiveToggle(key: string, displayName: string, currentStatus: TemplateStatus) {
    const isArchived = currentStatus === "archived";
    const msg = isArchived
      ? t.activateConfirm.replace("{name}", displayName)
      : t.archiveConfirm.replace("{name}", displayName);
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, status: isArchived ? "active" : "archived" }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.error ?? `Error ${res.status}`);
        return;
      }
      window.location.reload();
    } catch {
      alert("Network error");
    }
  }

  async function onDuplicate(id: string) {
    try {
      const res = await fetch(`/api/templates?id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      const { template } = await res.json();
      const newKey = `${template.template_key}_copy`;
      const dup = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: newKey,
          channel: template.channel,
          language: template.language,
          name: `${template.name} (copy)`,
          display_name: template.display_name ? `${template.display_name} (copy)` : null,
          description: template.description,
          category: template.category,
          subject: template.subject,
          body: template.body,
          sender_name: template.sender_name,
        }),
      });
      if (!dup.ok) {
        const e = await dup.json().catch(() => ({}));
        alert(e.error ?? `Error ${dup.status}`);
        return;
      }
      window.location.reload();
    } catch {
      alert("Failed to duplicate template");
    }
  }

  const hasFilters = search.trim() || categoryFilter !== "all" || statusFilter !== "all";
  const archivedCount = templates.filter((tpl) => (tpl.status ?? "active") === "archived").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-md border border-glass-border bg-glass py-2 pl-9 pr-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          {archivedCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowArchived((v) => !v)}>
              <Archive className="h-4 w-4" />
              {showArchived ? t.hideArchived : t.showArchived}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => { setEditingTemplate(null); setShowEmailBuilder(true); }}>
            <Mail className="h-4 w-4" />
            {t.createEmail}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditingTemplate(null); setShowWhatsAppBuilder(true); }}>
            <MessageCircle className="h-4 w-4" />
            {t.createWhatsApp}
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-glass-border bg-glass px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-body text-[12px] text-ink-soft">{t.filterCategory}:</span>
              <div className="flex flex-wrap gap-1">
                <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>{t.filterAll}</FilterChip>
                {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((cat) => (
                  <FilterChip key={cat} active={categoryFilter === cat} onClick={() => setCategoryFilter(cat)}>
                    {t[CATEGORY_LABELS[cat]]}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div className="h-5 w-px bg-glass-border" />
            <div className="flex items-center gap-2">
              <span className="font-body text-[12px] text-ink-soft">{t.filterStatus}:</span>
              <div className="flex flex-wrap gap-1">
                <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>{t.filterAll}</FilterChip>
                {(Object.keys(STATUS_LABELS) as TemplateStatus[]).map((st) => (
                  <FilterChip key={st} active={statusFilter === st} onClick={() => setStatusFilter(st)}>
                    {t[STATUS_LABELS[st]]}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div className="h-5 w-px bg-glass-border" />
            <div className="flex items-center gap-2">
              <span className="font-body text-[12px] text-ink-soft">Sort:</span>
              <div className="flex flex-wrap gap-1">
                <FilterChip active={sortBy === "date"} onClick={() => setSortBy("date")}>{t.sortDate}</FilterChip>
                <FilterChip active={sortBy === "name"} onClick={() => setSortBy("name")}>{t.sortName}</FilterChip>
                <FilterChip active={sortBy === "version"} onClick={() => setSortBy("version")}>{t.sortVersion}</FilterChip>
              </div>
            </div>
          </div>
        )}

        <p className="font-body text-[13px] text-ink-soft">
          {templates.length === 0
            ? t.emptyBody
            : `${emailTemplates.length} email, ${whatsappTemplates.length} WhatsApp`}
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <div className="flex gap-2">
            <Mail className="h-6 w-6 text-ink-faint" />
            <MessageCircle className="h-6 w-6 text-ink-faint" />
          </div>
          <div>
            <p className="font-display text-[14px] font-bold text-ink">{t.emptyTitle}</p>
            <p className="mt-1 max-w-md font-body text-[13px] text-ink-soft">{t.emptyBody}</p>
          </div>
        </div>
      ) : filtered.length === 0 && hasFilters ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-glass-border px-6 py-16 text-center">
          <Search className="h-6 w-6 text-ink-faint" />
          <p className="font-body text-[13px] text-ink-soft">{t.emptyFiltered}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {emailTemplates.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[14px] font-bold uppercase text-ink">{t.emailSection}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {emailTemplates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    tpl={tpl}
                    lang={lang}
                    t={t}
                    sentCount={sentCounts[tpl.template_key] ?? 0}
                    onPreview={() => openPreview(tpl.id)}
                    onEdit={() => openEdit(tpl.id, false)}
                    onDelete={() => onDelete(tpl.template_key, tpl.display_name || tpl.name)}
                    onDuplicate={() => onDuplicate(tpl.id)}
                    onArchiveToggle={() => onArchiveToggle(tpl.template_key, tpl.display_name || tpl.name, (tpl.status ?? "active") as TemplateStatus)}
                  />
                ))}
              </div>
            </section>
          )}

          {whatsappTemplates.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[14px] font-bold uppercase text-ink">{t.whatsAppSection}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {whatsappTemplates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    tpl={tpl}
                    lang={lang}
                    t={t}
                    sentCount={sentCounts[tpl.template_key] ?? 0}
                    onPreview={() => openPreview(tpl.id)}
                    onEdit={() => openEdit(tpl.id, true)}
                    onDelete={() => onDelete(tpl.template_key, tpl.display_name || tpl.name)}
                    onDuplicate={() => onDuplicate(tpl.id)}
                    onArchiveToggle={() => onArchiveToggle(tpl.template_key, tpl.display_name || tpl.name, (tpl.status ?? "active") as TemplateStatus)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showEmailBuilder && (
        <EmailTemplateBuilder
          template={editingTemplate}
          onClose={() => { setShowEmailBuilder(false); setEditingTemplate(null); }}
        />
      )}

      {showWhatsAppBuilder && (
        <WhatsAppTemplateBuilder
          template={editingTemplate}
          onClose={() => { setShowWhatsAppBuilder(false); setEditingTemplate(null); }}
        />
      )}

      {previewHtml !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewHtml(null)}>
          <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-glass-border px-6 py-4">
              <h2 className="font-display text-[16px] font-bold text-ink">{t.previewTitle}</h2>
              <button onClick={() => setPreviewHtml(null)} className="rounded p-2 hover:bg-glass">
                <span className="font-display text-[13px] font-bold text-ink-soft">&times;</span>
              </button>
            </div>
            <iframe srcDoc={previewHtml} sandbox="allow-same-origin" className="flex-1 rounded-b-lg bg-white" title="Preview" />
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-body text-[11px] font-bold transition-colors ${
        active
          ? "bg-red text-white"
          : "bg-surface text-ink-soft hover:bg-glass hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function KebabMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 hover:bg-glass"
      >
        <MoreVertical className="h-4 w-4 text-ink-soft" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-md border border-glass-border bg-surface py-1 shadow-lg"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-body text-[13px] transition-colors hover:bg-glass ${
        danger ? "text-red" : "text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function TemplateCard({
  tpl, lang, t, sentCount,
  onPreview, onEdit, onDelete, onDuplicate, onArchiveToggle,
}: {
  tpl: Template;
  lang: "id" | "en";
  t: TemplatesPageDict;
  sentCount: number;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onArchiveToggle: () => void;
}) {
  const label = tpl.display_name || tpl.name;
  const category = (tpl.category ?? "other") as TemplateCategory;
  const status = (tpl.status ?? "active") as TemplateStatus;
  const isWhatsApp = tpl.channel === "whatsapp";
  const hasDescription = tpl.description && tpl.description.trim().length > 0;
  const subjectDiffers = tpl.channel === "email" && tpl.subject && tpl.subject !== label;

  return (
    <div className={`card group relative flex flex-col gap-2 p-4 ${status === "archived" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 overflow-hidden">
          <h3 className="truncate font-display text-[14px] font-bold text-ink">{label}</h3>
          {subjectDiffers && (
            <p className="mt-0.5 truncate font-body text-[12px] text-ink-soft">{tpl.subject}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isWhatsApp
            ? <MessageCircle className="h-4 w-4 text-ink-faint" />
            : <Mail className="h-4 w-4 text-ink-faint" />
          }
          <KebabMenu>
            <MenuItem icon={Eye} label={t.preview} onClick={onPreview} />
            {!isWhatsApp && (
              <a
                href={`/api/templates/preview?id=${tpl.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-body text-[13px] text-ink transition-colors hover:bg-glass"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t.previewNewTab}
              </a>
            )}
            <MenuItem icon={Edit} label={t.edit} onClick={onEdit} />
            <MenuItem icon={Copy} label={t.duplicate} onClick={onDuplicate} />
            <div className="my-1 h-px bg-glass-border" />
            <MenuItem
              icon={status === "archived" ? RotateCcw : Archive}
              label={status === "archived" ? t.activate : t.archive}
              onClick={onArchiveToggle}
            />
            {tpl.template_key !== "__uji_internal__" && (
              <MenuItem icon={Trash2} label={t.delete} onClick={onDelete} danger />
            )}
          </KebabMenu>
        </div>
      </div>

      {hasDescription && (
        <p className="line-clamp-2 font-body text-[12px] leading-snug text-ink-soft">
          {tpl.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={CATEGORY_TONES[category]} className="text-[10px]">
          {t[CATEGORY_LABELS[category]]}
        </Badge>
        <Badge tone={STATUS_TONES[status]} className="text-[10px]">
          {t[STATUS_LABELS[status]]}
        </Badge>
        {isWhatsApp && tpl.wa_approval_status !== "not_applicable" && (
          <Badge
            tone={
              tpl.wa_approval_status === "approved" ? "green"
                : tpl.wa_approval_status === "rejected" ? "red"
                  : tpl.wa_approval_status === "pending" ? "amber"
                    : "neutral"
            }
            className="text-[10px]"
          >
            {tpl.wa_approval_status === "approved" ? "Approved"
              : tpl.wa_approval_status === "rejected" ? "Rejected"
                : tpl.wa_approval_status === "pending" ? "Pending"
                  : "Draft"}
          </Badge>
        )}
        <Badge tone={sentCount > 0 ? "green" : "neutral"} className="text-[10px]">
          {sentCount > 0
            ? t.sentCount.replace("{n}", formatCount(sentCount, lang))
            : t.neverSent}
        </Badge>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-ink-faint">
          {formatDateTime(tpl.created_at, lang)}
        </span>
      </div>
    </div>
  );
}
