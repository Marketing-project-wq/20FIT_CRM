"use client";

import { useState } from "react";
import { Mail, MessageCircle, Edit, Eye, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/i18n";
import { EmailTemplateBuilder } from "./email-template-builder";
import { WhatsAppTemplateBuilder } from "./whatsapp-template-builder";

interface Template {
  id: string;
  template_key: string;
  channel: "email" | "whatsapp";
  language: string;
  name: string;
  subject: string | null;
  version: number;
  wa_approval_status: string;
  created_at: string;
  body?: string;  // Added for edit mode
}

interface TemplateListProps {
  templates: Template[];
  lang: "id" | "en";
}

export function TemplateList({ templates, lang }: TemplateListProps) {
  const [showEmailBuilder, setShowEmailBuilder] = useState(false);
  const [showWhatsAppBuilder, setShowWhatsAppBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const emailTemplates = templates.filter((t) => t.channel === "email");
  const whatsappTemplates = templates.filter((t) => t.channel === "whatsapp");

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

  /** Inline preview modal: fetch body, fill sample vars, render in iframe. */
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

  async function onDelete(key: string, name: string) {
    if (!confirm(`Hapus template "${name}"? Tindakan ini menyembunyikannya dari daftar & pengiriman.`)) return;
    setDeleting(key);
    try {
      const res = await fetch(`/api/templates?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(`Gagal menghapus: ${e.error ?? res.status}`); return; }
      window.location.reload();
    } finally {
      setDeleting(null);
    }
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="font-body text-[13px] text-ink-soft">
          {templates.length === 0
            ? "Belum ada template. Buat template email atau WhatsApp untuk kampanye Anda."
            : `${emailTemplates.length} email, ${whatsappTemplates.length} WhatsApp`}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingTemplate(null);
              setShowEmailBuilder(true);
            }}
          >
            <Mail className="h-4 w-4" />
            Buat Email
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingTemplate(null);
              setShowWhatsAppBuilder(true);
            }}
          >
            <MessageCircle className="h-4 w-4" />
            Buat WhatsApp
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <div className="flex gap-2">
            <Mail className="h-6 w-6 text-ink-faint" />
            <MessageCircle className="h-6 w-6 text-ink-faint" />
          </div>
          <div>
            <p className="font-display text-[14px] font-bold text-ink">Belum ada template</p>
            <p className="mt-1 max-w-md font-body text-[13px] text-ink-soft">
              Template email dan WhatsApp yang Anda buat akan muncul di sini.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {emailTemplates.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[14px] font-bold uppercase text-ink">Email Templates</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {emailTemplates.map((tpl) => (
                  <div key={tpl.id} className="card group relative flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 overflow-hidden">
                        <h3 className="truncate font-display text-[14px] font-bold text-ink">{tpl.name}</h3>
                        <p className="mt-1 truncate font-body text-[12px] text-ink-soft">{tpl.subject}</p>
                      </div>
                      <Mail className="h-4 w-4 flex-shrink-0 text-ink-faint" />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                      <span className="font-mono">{tpl.template_key}</span>
                      <span>·</span>
                      <span>v{tpl.version}</span>
                      <span>·</span>
                      <span>{tpl.language.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-ink-faint">
                        {formatDateTime(tpl.created_at, lang)}
                      </span>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button className="rounded p-1 hover:bg-glass" title="Pratinjau" onClick={() => openPreview(tpl.id)}>
                          <Eye className="h-3.5 w-3.5 text-ink-soft" />
                        </button>
                        <a className="rounded p-1 hover:bg-glass" title="Pratinjau tab baru" href={`/api/templates/preview?id=${tpl.id}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 text-ink-soft" />
                        </a>
                        <button className="rounded p-1 hover:bg-glass" title="Edit" disabled={isLoadingEdit} onClick={() => openEdit(tpl.id, false)}>
                          <Edit className="h-3.5 w-3.5 text-ink-soft" />
                        </button>
                        <button className="rounded p-1 hover:bg-glass" title="Hapus" disabled={deleting === tpl.template_key} onClick={() => onDelete(tpl.template_key, tpl.name)}>
                          <Trash2 className="h-3.5 w-3.5 text-ink-soft hover:text-red" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {whatsappTemplates.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[14px] font-bold uppercase text-ink">WhatsApp Templates</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {whatsappTemplates.map((tpl) => (
                  <div key={tpl.id} className="card group relative flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 overflow-hidden">
                        <h3 className="truncate font-display text-[14px] font-bold text-ink">{tpl.name}</h3>
                      </div>
                      <MessageCircle className="h-4 w-4 flex-shrink-0 text-ink-faint" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          tpl.wa_approval_status === "approved"
                            ? "green"
                            : tpl.wa_approval_status === "rejected"
                              ? "red"
                              : tpl.wa_approval_status === "pending"
                                ? "amber"
                                : "neutral"
                        }
                        className="text-[10px]"
                      >
                        {tpl.wa_approval_status === "approved"
                          ? "Approved"
                          : tpl.wa_approval_status === "rejected"
                            ? "Rejected"
                            : tpl.wa_approval_status === "pending"
                              ? "Pending"
                              : "Draft"}
                      </Badge>
                      <span className="font-mono text-[11px] text-ink-faint">{tpl.template_key}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-ink-faint">
                        {formatDateTime(tpl.created_at, lang)}
                      </span>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button className="rounded p-1 hover:bg-glass" title="Pratinjau" onClick={() => openPreview(tpl.id)}>
                          <Eye className="h-3.5 w-3.5 text-ink-soft" />
                        </button>
                        <button className="rounded p-1 hover:bg-glass" title="Edit" disabled={isLoadingEdit} onClick={() => openEdit(tpl.id, true)}>
                          <Edit className="h-3.5 w-3.5 text-ink-soft" />
                        </button>
                        <button className="rounded p-1 hover:bg-glass" title="Hapus" disabled={deleting === tpl.template_key} onClick={() => onDelete(tpl.template_key, tpl.name)}>
                          <Trash2 className="h-3.5 w-3.5 text-ink-soft hover:text-red" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showEmailBuilder && (
        <EmailTemplateBuilder
          template={editingTemplate}
          onClose={() => {
            setShowEmailBuilder(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {showWhatsAppBuilder && (
        <WhatsAppTemplateBuilder
          template={editingTemplate}
          onClose={() => {
            setShowWhatsAppBuilder(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {previewHtml !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewHtml(null)}>
          <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-glass-border px-6 py-4">
              <h2 className="font-display text-[16px] font-bold text-ink">Pratinjau Email</h2>
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
