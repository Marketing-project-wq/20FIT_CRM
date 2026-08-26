"use client";

import { useState } from "react";
import { X, Save, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Template {
  name?: string;
  body?: string;
  template_key?: string;
}

interface WhatsAppTemplateBuilderProps {
  template: Template | null;
  onClose: () => void;
}

type ButtonType = "none" | "call_to_action" | "quick_reply" | "url";

export function WhatsAppTemplateBuilder({ template, onClose }: WhatsAppTemplateBuilderProps) {
  const [templateName, setTemplateName] = useState(template?.name || "");
  const [category, setCategory] = useState<"marketing" | "utility" | "authentication">("marketing");
  const [messageBody, setMessageBody] = useState(template?.body || "");
  const [hasImage, setHasImage] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [buttonType, setButtonType] = useState<ButtonType>("none");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");

  const handleSave = async () => {
    // TODO: Call API to save template
    console.log({
      template_name: templateName,
      category,
      body: messageBody,
      has_image: hasImage,
      image_url: imageUrl,
      button_type: buttonType,
      button_text: buttonText,
      button_url: buttonUrl,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-glass-border px-6 py-4">
          <div>
            <h2 className="font-display text-[18px] font-bold text-ink">
              {template ? "Edit WhatsApp Template" : "Buat WhatsApp Template"}
            </h2>
            <p className="mt-1 font-body text-[12px] text-ink-soft">
              Template akan dikirim ke Meta untuk persetujuan
            </p>
          </div>
          <button onClick={onClose} className="rounded p-2 hover:bg-glass">
            <X className="h-5 w-5 text-ink-soft" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 gap-6 overflow-auto p-6">
          {/* Editor */}
          <div className="flex flex-1 flex-col gap-4">
            <Badge tone="amber" className="w-fit">
              Mockup — WhatsApp Business API integration coming soon
            </Badge>

            {/* Template Name */}
            <div>
              <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                Template Name <span className="text-red">*</span>
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
                placeholder="e.g., promo_membership_20fit"
              />
              <p className="mt-1 font-mono text-[11px] text-ink-faint">
                Lowercase, underscore only (Meta requirement)
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                Category <span className="text-red">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as "marketing" | "utility" | "authentication")}
                className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="marketing">Marketing</option>
                <option value="utility">Utility</option>
                <option value="authentication">Authentication</option>
              </select>
            </div>

            {/* Message Body */}
            <div>
              <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                Message Body <span className="text-red">*</span>
              </label>
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                className="h-[120px] w-full rounded-md border border-glass-border bg-glass p-3 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
                placeholder="Halo {{1}}, promo membership 20FIT bulan ini..."
              />
              <p className="mt-1 font-mono text-[11px] text-ink-faint">
                Gunakan {"{{1}}"}, {"{{2}}"} untuk variabel (Meta requirement)
              </p>
            </div>

            {/* Image */}
            <div>
              <label className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hasImage}
                  onChange={(e) => setHasImage(e.target.checked)}
                  className="h-4 w-4 rounded border-glass-border"
                />
                <span className="font-display text-[13px] font-bold text-ink">Include Image</span>
              </label>
              {hasImage && (
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
                  placeholder="Image URL atau upload"
                />
              )}
            </div>

            {/* Buttons */}
            <div>
              <label className="mb-2 block font-display text-[13px] font-bold text-ink">Button Type</label>
              <select
                value={buttonType}
                onChange={(e) => setButtonType(e.target.value as ButtonType)}
                className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="none">No Button</option>
                <option value="call_to_action">Call to Action</option>
                <option value="quick_reply">Quick Reply</option>
                <option value="url">URL Button</option>
              </select>
            </div>

            {buttonType !== "none" && (
              <>
                <div>
                  <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                    Button Text <span className="text-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
                    placeholder="e.g., Daftar Sekarang"
                  />
                </div>

                {buttonType === "url" && (
                  <div>
                    <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                      Button URL <span className="text-red">*</span>
                    </label>
                    <input
                      type="url"
                      value={buttonUrl}
                      onChange={(e) => setButtonUrl(e.target.value)}
                      className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
                      placeholder="https://20fit.id/promo"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Preview */}
          <div className="w-[320px] flex-shrink-0">
            <h3 className="mb-3 font-display text-[13px] font-bold text-ink">Preview</h3>
            <div className="rounded-lg border border-glass-border bg-[#0b141a] p-4">
              {/* WhatsApp-style bubble */}
              <div className="rounded-lg bg-[#005c4b] p-3">
                {hasImage && imageUrl && (
                  <div className="mb-2 h-40 overflow-hidden rounded bg-glass">
                    <div className="flex h-full items-center justify-center text-[11px] text-ink-faint">
                      <Image className="h-8 w-8" />
                    </div>
                  </div>
                )}
                <p className="whitespace-pre-wrap font-body text-[14px] leading-relaxed text-white">
                  {messageBody.replace("{{1}}", "Andi").replace("{{2}}", "Member") || "(empty message)"}
                </p>
                {buttonType !== "none" && buttonText && (
                  <button className="mt-3 w-full rounded-md border border-white/20 bg-white/10 py-2 text-center font-display text-[13px] font-bold text-white">
                    {buttonText}
                  </button>
                )}
                <span className="mt-2 block text-right font-mono text-[10px] text-white/60">12:34</span>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-amber tint-amber p-3">
              <p className="font-body text-[11px] text-amber">
                Template akan dikirim ke Meta WhatsApp Business API untuk persetujuan. Persetujuan biasanya memakan
                waktu 1-2 hari kerja.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-glass-border px-6 py-4">
          <Badge tone="neutral">Status: Draft</Badge>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={!templateName.trim() || !messageBody.trim()}>
              <Save className="h-4 w-4" />
              Simpan & Submit ke Meta
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
