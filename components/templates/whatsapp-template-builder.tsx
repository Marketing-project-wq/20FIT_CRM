"use client";

import { useState, useEffect, useRef } from "react";
import { X, Save, Upload } from "lucide-react";
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
  const [messageBody, setMessageBody] = useState("");
  const [hasImage, setHasImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [buttonType, setButtonType] = useState<ButtonType>("none");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (template?.body) {
      try {
        const parsed = JSON.parse(template.body);
        setMessageBody(parsed.text || "");
        setCategory(parsed.category || "marketing");
        setHasImage(parsed.has_header_image || false);
        setImagePreview(parsed.image_url || null);
        if (parsed.buttons?.length > 0) {
          const btn = parsed.buttons[0];
          setButtonType(btn.type || "none");
          setButtonText(btn.text || "");
          setButtonUrl(btn.url || "");
        }
      } catch (e) {
        console.error("Failed to parse template body:", e);
      }
    }
  }, [template]);

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const bodyPayload = JSON.stringify({
      text: messageBody,
      category,
      buttons: buttonType !== "none" ? [{ type: buttonType, text: buttonText, url: buttonUrl || undefined }] : [],
      has_header_image: hasImage,
      image_url: imagePreview || undefined,
    });

    const templateKey = template?.template_key || `wa_${templateName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: templateKey,
          channel: "whatsapp",
          language: "id",
          name: templateName,
          body: bodyPayload,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to save: ${err.error}`);
        return;
      }

      window.location.reload();
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save template");
    }
  };

  const showUrlField = buttonType === "url" || buttonType === "call_to_action";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-glass-border px-6 py-4">
          <div>
            <h2 className="font-display text-[18px] font-bold text-ink">
              {template ? "Edit WhatsApp Template" : "Buat WhatsApp Template"}
            </h2>
            <p className="mt-1 font-body text-[12px] text-ink-soft">Template akan dikirim ke Meta untuk persetujuan</p>
          </div>
          <button onClick={onClose} className="rounded p-2 hover:bg-glass">
            <X className="h-5 w-5 text-ink-soft" />
          </button>
        </div>

        <div className="flex flex-1 gap-6 overflow-auto p-6">
          <div className="flex flex-1 flex-col gap-4">
            <Badge tone="amber" className="w-fit">Mockup — WhatsApp Business API integration coming soon</Badge>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                  Template Name <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
                  placeholder="promo_membership_20fit"
                />
                <p className="mt-1 font-mono text-[11px] text-ink-faint">Lowercase, underscore only (Meta)</p>
              </div>
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
            </div>

            <div>
              <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                Message Body <span className="text-red">*</span>
              </label>
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                className="h-[100px] w-full rounded-md border border-glass-border bg-glass p-3 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
                placeholder="Halo {{1}}, promo membership 20FIT bulan ini..."
              />
              <p className="mt-1 font-mono text-[11px] text-ink-faint">Variabel: {"{{1}}"}, {"{{2}}"} (Meta requirement)</p>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hasImage}
                  onChange={(e) => {
                    setHasImage(e.target.checked);
                    if (!e.target.checked) setImagePreview(null);
                  }}
                  className="h-4 w-4 rounded border-glass-border"
                />
                <span className="font-display text-[13px] font-bold text-ink">Header Image</span>
              </label>

              {hasImage && (
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file);
                    }}
                  />
                  {imagePreview ? (
                    <div className="relative w-full overflow-hidden rounded-md border border-glass-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imagePreview} alt="Header preview" className="max-h-32 w-full object-cover" />
                      <button
                        onClick={() => {
                          setImagePreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white hover:bg-black/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-glass-border bg-glass px-4 py-6 font-body text-[13px] text-ink-soft hover:bg-glass/80"
                    >
                      <Upload className="h-4 w-4" />
                      Upload gambar (JPG, PNG, WebP)
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-2 block font-display text-[13px] font-bold text-ink">Button</label>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                      Teks Button <span className="text-red">*</span>
                    </label>
                    <input
                      type="text"
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
                      placeholder="Daftar Sekarang"
                    />
                  </div>
                  {showUrlField && (
                    <div>
                      <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                        Link URL <span className="text-red">*</span>
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
                </div>
              )}
            </div>
          </div>

          <div className="w-[280px] flex-shrink-0">
            <h3 className="mb-3 font-display text-[13px] font-bold text-ink">Preview</h3>
            <div className="rounded-lg border border-glass-border bg-[#0b141a] p-3">
              <div className="rounded-lg bg-[#005c4b] p-3">
                {hasImage && imagePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="Header" className="mb-2 w-full rounded object-cover" style={{ maxHeight: "120px" }} />
                )}
                {hasImage && !imagePreview && (
                  <div className="mb-2 flex h-24 items-center justify-center rounded bg-white/10 font-mono text-[11px] text-white/40">
                    Header image
                  </div>
                )}
                <p className="whitespace-pre-wrap font-body text-[13px] leading-relaxed text-white">
                  {messageBody.replace(/\{\{1\}\}/g, "Andi").replace(/\{\{2\}\}/g, "Member") || "(empty message)"}
                </p>
                {buttonType !== "none" && buttonText && (
                  <div className="mt-3 border-t border-white/20 pt-2 text-center font-display text-[13px] font-semibold text-[#53bdeb]">
                    {buttonText}
                  </div>
                )}
                <span className="mt-1 block text-right font-mono text-[10px] text-white/50">12:34 ✓✓</span>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-amber tint-amber p-3">
              <p className="font-body text-[11px] text-amber">
                Template harus disetujui Meta sebelum bisa dikirim. Proses sekitar 1–2 hari kerja.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-glass-border px-6 py-4">
          <Badge tone="neutral">Status: Draft</Badge>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button onClick={handleSave} disabled={!templateName.trim() || !messageBody.trim()}>
              <Save className="mr-1 h-4 w-4" />
              Simpan & Submit ke Meta
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
