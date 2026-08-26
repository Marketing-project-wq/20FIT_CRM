"use client";

import { useState } from "react";
import { Mail, MessageCircle, Edit } from "lucide-react";
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

  const emailTemplates = templates.filter((t) => t.channel === "email");
  const whatsappTemplates = templates.filter((t) => t.channel === "whatsapp");

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
                        <button
                          className="rounded p-1 hover:bg-glass"
                          disabled={isLoadingEdit}
                          onClick={async () => {
                            setIsLoadingEdit(true);
                            try {
                              const res = await fetch(`/api/templates?id=${tpl.id}`);
                              if (!res.ok) throw new Error("Failed to fetch template");

                              const { template } = await res.json();
                              setEditingTemplate(template);
                              setShowEmailBuilder(true);
                            } catch (err) {
                              console.error("Failed to load template:", err);
                              alert("Failed to load template for editing");
                            } finally {
                              setIsLoadingEdit(false);
                            }
                          }}
                        >
                          <Edit className="h-3.5 w-3.5 text-ink-soft" />
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
                        <button
                          className="rounded p-1 hover:bg-glass"
                          disabled={isLoadingEdit}
                          onClick={async () => {
                            setIsLoadingEdit(true);
                            try {
                              const res = await fetch(`/api/templates?id=${tpl.id}`);
                              if (!res.ok) throw new Error("Failed to fetch template");

                              const { template } = await res.json();
                              setEditingTemplate(template);
                              setShowWhatsAppBuilder(true);
                            } catch (err) {
                              console.error("Failed to load template:", err);
                              alert("Failed to load template for editing");
                            } finally {
                              setIsLoadingEdit(false);
                            }
                          }}
                        >
                          <Edit className="h-3.5 w-3.5 text-ink-soft" />
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
    </div>
  );
}
