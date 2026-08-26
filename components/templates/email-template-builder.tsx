"use client";

import { useState } from "react";
import { X, Save, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Template {
  template_key?: string;
  subject?: string | null;
  body?: string;
  sender_name?: string;
}

interface EmailTemplateBuilderProps {
  template: Template | null;
  onClose: () => void;
}

export function EmailTemplateBuilder({ template, onClose }: EmailTemplateBuilderProps) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [senderName, setSenderName] = useState(template?.sender_name || "20FIT");
  const [subject, setSubject] = useState(template?.subject || "");
  const [htmlContent, setHtmlContent] = useState(
    template?.body || `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">Judul Email</h1>
  <p>Halo {{first_name}},</p>
  <p>Isi email Anda di sini.</p>
  <p>Salam,<br>Tim 20FIT</p>
</body>
</html>`
  );
  const [showPreview, setShowPreview] = useState(false);

  const injectUnsubscribeLink = (html: string): string => {
    const unsubLink = `<p style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
  <a href="{{unsubscribe_url}}" style="color: #666;">Berhenti berlangganan</a>
</p>`;

    // Cek apakah sudah ada unsubscribe link
    if (html.includes("{{unsubscribe_url}}")) {
      return html;
    }

    // Inject sebelum closing </body> tag
    if (html.includes("</body>")) {
      return html.replace("</body>", `${unsubLink}\n</body>`);
    }

    // Jika tidak ada </body>, tambahkan di akhir
    return html + unsubLink;
  };

  const handleSave = async () => {
    const finalHtml = injectUnsubscribeLink(htmlContent);
    const templateKey = template?.template_key || `email_${Date.now()}`;

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: templateKey,
          channel: "email",
          language: "id",
          name: subject || "Untitled Email",
          subject,
          body: finalHtml,
          sender_name: senderName,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-glass-border px-6 py-4">
          <div>
            <h2 className="font-display text-[18px] font-bold text-ink">
              {template ? "Edit Email Template" : "Buat Email Template"}
            </h2>
            <p className="mt-1 font-body text-[12px] text-ink-soft">
              Template akan otomatis menyertakan link unsubscribe
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-2 hover:bg-glass"
          >
            <X className="h-5 w-5 text-ink-soft" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
          {/* Sender Name */}
          <div>
            <label className="mb-2 block font-display text-[13px] font-bold text-ink">
              Sender Name
            </label>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
              placeholder="20FIT"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="mb-2 block font-display text-[13px] font-bold text-ink">
              Subject <span className="text-red">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none"
              placeholder="Subject email Anda"
            />
            <p className="mt-1 font-mono text-[11px] text-ink-faint">
              Gunakan variabel: {"{{first_name}}"}, {"{{last_name}}"}, {"{{email}}"}
            </p>
          </div>

          {/* Editor Mode Toggle */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={mode === "visual" ? "primary" : "outline"}
              onClick={() => setMode("visual")}
            >
              Visual
            </Button>
            <Button
              size="sm"
              variant={mode === "html" ? "primary" : "outline"}
              onClick={() => setMode("html")}
            >
              HTML
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="h-4 w-4" />
              Preview
            </Button>
          </div>

          {/* Editor */}
          {mode === "visual" ? (
            <div className="rounded-md border border-glass-border bg-glass p-4">
              <Badge tone="amber" className="mb-4">
                Visual editor coming soon
              </Badge>
              <p className="font-body text-[13px] text-ink-soft">
                Untuk sementara, gunakan mode HTML untuk mengedit template.
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-2 block font-display text-[13px] font-bold text-ink">
                HTML Content
              </label>
              <textarea
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                className="h-[400px] w-full rounded-md border border-glass-border bg-glass p-3 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
                placeholder="<!DOCTYPE html>..."
              />
            </div>
          )}

          {/* Preview */}
          {showPreview && (
            <div className="rounded-md border border-glass-border bg-white p-6">
              <h3 className="mb-4 font-display text-[13px] font-bold text-ink">
                Preview
              </h3>
              <div className="border-t border-glass-border pt-4">
                <div className="mb-2 text-[11px] text-ink-faint">
                  <strong>From:</strong> {senderName} &lt;noreply@20fit.id&gt;
                </div>
                <div className="mb-4 text-[11px] text-ink-faint">
                  <strong>Subject:</strong> {subject || "(no subject)"}
                </div>
                <iframe
                  srcDoc={injectUnsubscribeLink(htmlContent)
                    .replace("{{first_name}}", "Andi")
                    .replace("{{last_name}}", "Wijaya")
                    .replace("{{email}}", "andi@example.com")
                    .replace("{{unsubscribe_url}}", "/unsubscribe?email=andi@example.com&template=123")}
                  className="h-[400px] w-full border border-glass-border"
                  title="Email Preview"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-glass-border px-6 py-4">
          <p className="font-mono text-[11px] text-ink-faint">
            Link unsubscribe akan ditambahkan otomatis di footer
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={!subject.trim()}>
              <Save className="h-4 w-4" />
              Simpan Template
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
