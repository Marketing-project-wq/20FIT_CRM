"use client";

import { useState, useMemo } from "react";
import { Mail, MessageCircle, Edit, Eye, ExternalLink, Trash2, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/i18n";
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
}

interface TemplateListProps {
  templates: Template[];
  lang: "id" | "en";
  t: TemplatesPageDict;
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

export function TemplateList({ templates, lang, t }: TemplateListProps) {
  const [showEmailBuilder, setShowEmailBuilder] = useState(false);
  const [showWhatsAppBuilder, setShowWhatsAppBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let list = templates;
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
  }, [templates, search, categoryFilter, statusFilter, sortBy]);

  const emailTemplates = filtered.filter((tpl) => tpl.channel === "email");
  const whatsappTemplates = filtered.filter((tpl) => tpl.channel === "whatsapp");

  async function openEdit(id: string, isWhatsApp: boolean) {
    setIsLoadingEdit(true);
    try {
      const res = await fetch(`/api/templates?id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      const { template } = await res.json();
      setEditingTemplate(template);
      if (isWhatsApp) setShowWhatsAppBuilder(true); else setShowEmailBuilder(true);
    } catch (err) {
      console.error("Failed to load template:", err);
      alert("Failed to load template for editing");
    } finally {
      setIsLoadingEdit(false);
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
    setDeleting(key);
    try {
      const res = await fetch(`/api/templates?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(`Gagal menghapus: ${e.error ?? res.status}`); return; }
      window.location.reload();
    } finally {
      setDeleting(null);
    }
  }

  const hasFilters = search.trim() || categoryFilter !== "all" || statusFilter !== "all";

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: search + filters + create buttons */}
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

      {/* Empty state */}
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
                    isLoadingEdit={isLoadingEdit}
                    deleting={deleting}
                    onPreview={() => openPreview(tpl.id)}
                    onEdit={() => openEdit(tpl.id, false)}
                    onDelete={() => onDelete(tpl.template_key, tpl.display_name || tpl.name)}
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
                    isLoadingEdit={isLoadingEdit}
                    deleting={deleting}
                    onPreview={() => openPreview(tpl.id)}
                    onEdit={() => openEdit(tpl.id, true)}
                    onDelete={() => onDelete(tpl.template_key, tpl.display_name || tpl.name)}
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
                <span className="font-display text-[13px] font-bold text-ink-soft">✕</span>
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

function TemplateCard({
  tpl, lang, t, isLoadingEdit, deleting, onPreview, onEdit, onDelete,
}: {
  tpl: Template;
  lang: "id" | "en";
  t: TemplatesPageDict;
  isLoadingEdit: boolean;
  deleting: string | null;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = tpl.display_name || tpl.name;
  const category = (tpl.category ?? "other") as TemplateCategory;
  const status = (tpl.status ?? "active") as TemplateStatus;
  const isWhatsApp = tpl.channel === "whatsapp";

  return (
    <div className="card group relative flex flex-col gap-3 p-4">
      {/* Header: name + channel icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 overflow-hidden">
          <h3 className="truncate font-display text-[14px] font-bold text-ink">{label}</h3>
          {tpl.channel === "email" && tpl.subject && (
            <p className="mt-0.5 truncate font-body text-[12px] text-ink-soft">{tpl.subject}</p>
          )}
        </div>
        {isWhatsApp
          ? <MessageCircle className="h-4 w-4 flex-shrink-0 text-ink-faint" />
          : <Mail className="h-4 w-4 flex-shrink-0 text-ink-faint" />
        }
      </div>

      {/* Description */}
      <p className="line-clamp-2 font-body text-[12px] leading-snug text-ink-soft">
        {tpl.description || t.cardNoDescription}
      </p>

      {/* Badges: category + status + WA approval */}
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
      </div>

      {/* Meta: key · version · language */}
      <div className="flex items-center gap-2 text-[11px] text-ink-faint">
        <span className="truncate font-mono">{tpl.template_key}</span>
        <span>·</span>
        <span>{t.cardVersion.replace("{v}", String(tpl.version))}</span>
        <span>·</span>
        <span>{tpl.language.toUpperCase()}</span>
      </div>

      {/* Footer: date + action buttons */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-ink-faint">
          {formatDateTime(tpl.created_at, lang)}
        </span>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button className="rounded p-1 hover:bg-glass" title={t.preview} onClick={onPreview}>
            <Eye className="h-3.5 w-3.5 text-ink-soft" />
          </button>
          {!isWhatsApp && (
            <a className="rounded p-1 hover:bg-glass" title={t.previewNewTab} href={`/api/templates/preview?id=${tpl.id}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 text-ink-soft" />
            </a>
          )}
          <button className="rounded p-1 hover:bg-glass" title={t.edit} disabled={isLoadingEdit} onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 text-ink-soft" />
          </button>
          <button className="rounded p-1 hover:bg-glass" title={t.delete} disabled={deleting === tpl.template_key} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-ink-soft hover:text-red" />
          </button>
        </div>
      </div>
    </div>
  );
}
