"use client";

import { useState, useEffect, useRef } from "react";
import { X, Save, Eye, Image as ImageIcon, LayoutTemplate, Upload, Trash2, Blocks, Code, Monitor, Smartphone, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STARTER_TEMPLATES, MOBILE_PREVIEW_CROP_PX } from "./starter-templates";
import { BlockEditor, blocksToHtml, newBlock, type Block } from "./block-editor";
import { renderEmailDocument } from "@/lib/crm/email-document";
import {
  listBrandAssetsAction,
  uploadBrandAssetAction,
  deleteBrandAssetAction,
  type BrandAsset,
} from "@/app/(app)/templates/brand-asset-actions";

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

const DEFAULT_HTML = STARTER_TEMPLATES[0].html;
type EditMode = "blocks" | "html" | "preview";

export function EmailTemplateBuilder({ template, onClose }: EmailTemplateBuilderProps) {
  const isEditing = !!template;
  // A brand-new template starts on the starter gallery; editing jumps straight to the editor.
  const [step, setStep] = useState<"gallery" | "editor">(isEditing ? "editor" : "gallery");
  // Editing an existing template opens in HTML (we don't parse HTML back into blocks). A fresh
  // "blank" pick starts in Blocks mode (set in pickStarter). Others open in HTML.
  const [mode, setMode] = useState<EditMode>("html");
  const [senderName, setSenderName] = useState(template?.sender_name || "20FIT");
  const [subject, setSubject] = useState(template?.subject || "");
  const [htmlContent, setHtmlContent] = useState(template?.body || DEFAULT_HTML);
  // Block state — only authoritative while mode === "blocks". Switching to HTML/Preview flushes it
  // to htmlContent; we never parse HTML back to blocks (one-way, honest).
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [htmlEdited, setHtmlEdited] = useState(false); // once raw HTML is touched, block mode is locked
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");

  // Brand assets (logos)
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [showAssets, setShowAssets] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assetMsg, setAssetMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listBrandAssetsAction().then((r) => { if (r.ok) setAssets(r.assets); });
  }, []);

  function pickStarter(id: string) {
    const s = STARTER_TEMPLATES.find((x) => x.id === id) ?? STARTER_TEMPLATES[0];
    if (s.subject) setSubject(s.subject);
    if (id === "blank") {
      // Blank → drag-and-drop block mode with a sensible starting set.
      setBlocks([newBlock("logo"), newBlock("heading"), newBlock("text"), newBlock("button")]);
      setMode("blocks");
      setHtmlEdited(false);
    } else {
      // Prebuilt HTML starters open in HTML mode (not parsed into blocks).
      setHtmlContent(s.html);
      setMode("html");
      setHtmlEdited(true);
    }
    setStep("editor");
  }

  /** Switch modes, flushing block state → HTML when leaving blocks mode. */
  function switchMode(next: EditMode) {
    if (mode === "blocks" && next !== "blocks") {
      setHtmlContent(blocksToHtml(blocks));
    }
    setMode(next);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setAssetMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadBrandAssetAction(fd);
      if (!res.ok || !res.asset) {
        setAssetMsg(res.error === "too_large" ? "File terlalu besar (maks 2 MB)." : res.error === "bad_type" ? "Tipe file harus gambar." : "Gagal mengunggah.");
        return;
      }
      setAssets((prev) => [res.asset!, ...prev]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDeleteAsset(id: string) {
    const res = await deleteBrandAssetAction(id);
    if (res.ok) setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  /** Insert a logo — in blocks mode add a logo block; in HTML mode inject the tag. */
  function insertLogo(asset: BrandAsset) {
    if (mode === "blocks") {
      setBlocks((prev) => [...prev, { ...newBlock("logo"), url: asset.publicUrl, alt: asset.name } as Block]);
      setShowAssets(false);
      return;
    }
    const tag = `<img src="${asset.publicUrl}" alt="${asset.name}" style="max-width:180px;height:auto;display:block;margin:0 auto 16px;" />`;
    const ta = textareaRef.current;
    if (ta && mode === "html") {
      const start = ta.selectionStart ?? htmlContent.length;
      setHtmlContent(htmlContent.slice(0, start) + tag + htmlContent.slice(start));
    } else if (htmlContent.includes("</body>")) {
      setHtmlContent(htmlContent.replace("</body>", `${tag}\n</body>`));
    } else {
      setHtmlContent(htmlContent + tag);
    }
    setShowAssets(false);
  }

  const injectUnsubscribeLink = (html: string): string => {
    const unsubLink = `<p style="margin-top:40px;padding-top:20px;border-top:1px solid #ddd;font-size:12px;color:#666;text-align:center;">
  <a href="{{unsubscribe_url}}" style="color:#666;">Berhenti berlangganan</a>
</p>`;
    if (html.includes("{{unsubscribe_url}}")) return html;
    if (html.includes("</body>")) return html.replace("</body>", `${unsubLink}\n</body>`);
    return html + unsubLink;
  };

  // The HTML source of truth: from blocks while in blocks mode, else the raw htmlContent.
  const currentHtml = () => (mode === "blocks" ? blocksToHtml(blocks) : htmlContent);

  // Preview the REAL email: substitute SAMPLE data (never a real customer) then compose through the
  // same skeleton the send uses — so what the author sees is the exact frame that ships, not a
  // frameless fragment that would lie about the result.
  const previewUnsub = "/unsubscribe?token=contoh";
  const previewSubstituted = injectUnsubscribeLink(currentHtml())
    .replace(/\{\{full_name\}\}/g, "Budi Santoso")
    .replace(/\{\{first_name\}\}/g, "Budi")
    .replace(/\{\{city\}\}/g, "Jakarta")
    .replace(/\{\{unsubscribe_url\}\}/g, previewUnsub);
  const previewHtml = renderEmailDocument(previewSubstituted, previewUnsub).html;

  const handleSave = async () => {
    const finalHtml = injectUnsubscribeLink(currentHtml());
    const templateKey = template?.template_key || `email_${Date.now()}`;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: templateKey, channel: "email", language: "id",
          name: subject || "Untitled Email", subject, body: finalHtml, sender_name: senderName,
        }),
      });
      if (!res.ok) { const err = await res.json(); alert(`Failed to save: ${err.error}`); return; }
      window.location.reload();
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save template");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* max-h + flex-col, but NOT h-full: the modal sizes to its content (the gallery is short) up to
          90vh, then the inner flex-1 region scrolls — instead of always stretching to 90vh and leaving
          a big empty gap below a short gallery with the footer stranded at the bottom. */}
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-glass-border px-6 py-4">
          <div>
            <h2 className="font-display text-[18px] font-bold text-ink">
              {isEditing ? "Edit Email Template" : step === "gallery" ? "Pilih Template Awal" : "Buat Email Template"}
            </h2>
            <p className="mt-1 font-body text-[12px] text-ink-soft">Link unsubscribe ditambahkan otomatis di footer</p>
          </div>
          <button onClick={onClose} className="rounded p-2 hover:bg-glass"><X className="h-5 w-5 text-ink-soft" /></button>
        </div>

        {step === "gallery" ? (
          <StarterGallery onPick={pickStarter} />
        ) : (
          <EditorBody
            mode={mode} switchMode={switchMode}
            senderName={senderName} setSenderName={setSenderName}
            subject={subject} setSubject={setSubject}
            htmlContent={htmlContent} setHtmlContent={(v: string) => { setHtmlContent(v); setHtmlEdited(true); }}
            blocks={blocks} setBlocks={setBlocks}
            htmlEdited={htmlEdited}
            textareaRef={textareaRef}
            previewHtml={previewHtml}
            previewWidth={previewWidth} setPreviewWidth={setPreviewWidth}
            assets={assets} showAssets={showAssets} setShowAssets={setShowAssets}
            fileRef={fileRef} onUpload={onUpload} uploading={uploading}
            assetMsg={assetMsg} onDeleteAsset={onDeleteAsset} insertLogo={insertLogo}
          />
        )}

        <div className="flex items-center justify-between border-t border-glass-border px-6 py-4">
          {step === "editor" && !isEditing ? (
            <Button variant="ghost" onClick={() => setStep("gallery")}>← Ganti template awal</Button>
          ) : (
            // Empty spacer keeps "Batal" right-aligned. The unsubscribe note lives once in the header
            // subtitle above — it used to be repeated here, which read as two separate claims.
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            {step === "editor" && (
              <Button onClick={handleSave} disabled={!subject.trim()}>
                <Save className="mr-1 h-4 w-4" />Simpan Template
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Email starters are authored at 600px wide (see wrap() in starter-templates.ts). A CSS `transform:
// scale()` does NOT change layout size, so the OLD thumbnail — a 480px iframe scaled 0.33 inside a
// flex-centered box — centred the full 480×320 box (which overflowed), then shrank the result into the
// top-left corner: content read as a tiny blob with dead space around it, AND the 600px email was
// squeezed into 480px so proportions lied. Fix: render the iframe at the REAL 600px width, park it at
// the container's top-left, and scale by (container width ÷ 600) measured live — so the top of the
// email fills the card at true proportions, deterministically, at any card width.
//
// The visible height is a CROP in authored-600 space, not a fixed box: on desktop, `cropPx` is THIS
// email's real content height (measured — see starter-templates.ts) so the card ends where the email
// ends, with no dead #f4f4f5 tail; on mobile, a shorter crop (MOBILE_PREVIEW_CROP_PX = header + first
// lines) so several cards fit one screen. The container height = cropPx × scale, so the crop scales
// with the card. A bottom fade is shown ONLY when the crop is shorter than the email (mobile), so the
// cut reads as "more below" rather than a chopped line.
function StarterThumb({ html, title, cropPx }: { html: string; title: string; cropPx: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0); // 0 until measured, so no full-size flash on first paint
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)"); // Tailwind's `sm` breakpoint
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setScale(w / 600); // 600 = the email's authored width
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const crop = isMobile ? Math.min(MOBILE_PREVIEW_CROP_PX, cropPx) : cropPx;
  const cropped = crop < cropPx; // email continues below the crop → show a fade
  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded border border-glass-border bg-white"
      style={{ height: scale ? crop * scale : undefined, aspectRatio: scale ? undefined : String(600 / crop) }}
    >
      <iframe
        srcDoc={html.replace(/\{\{first_name\}\}/g, "Andi")}
        sandbox=""
        aria-hidden
        tabIndex={-1}
        title={title}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: 600, height: crop, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      />
      {cropped && (
        // A faint hint that the email continues below the crop — NOT a veil over readable content.
        // Confined to the bottom ~18% of the card and only partially opaque, so every line that fits
        // inside the crop stays fully legible (at 210px the old solid half-card fade swallowed the
        // Newsletter/Promo sub-header lines that are the whole point of showing the top).
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white/40 to-transparent"
          style={{ height: scale ? Math.round(crop * scale * 0.12) : undefined }}
          aria-hidden
        />
      )}
    </div>
  );
}

function StarterGallery({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="flex-1 overflow-auto p-6">
      <p className="mb-4 font-body text-[13px] text-ink-soft">Pilih titik awal — Anda bisa menyesuaikan semuanya setelah memilih.</p>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STARTER_TEMPLATES.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            className="card group flex flex-col gap-2 p-3 text-left transition-colors hover:border-red"
          >
            {s.id === "blank" || s.previewCropPx === undefined ? (
              // "Blank" has almost no content — a preview would look like a failed load, not an empty
              // page. Show an explicit placeholder, and keep it SHORT (it's just an icon — it must not
              // inherit the tall content-crop of the real previews).
              <div className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-glass-border bg-glass text-center" aria-hidden>
                <FilePlus className="h-8 w-8 text-ink-faint" />
                <span className="px-3 font-body text-[12px] text-ink-soft">Mulai dari halaman kosong</span>
              </div>
            ) : (
              <StarterThumb html={s.html} title={s.name} cropPx={s.previewCropPx} />
            )}
            <div>
              <div className="flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
                <span className="font-display text-[13px] font-bold text-ink">{s.name}</span>
              </div>
              <p className="mt-1 font-body text-[12px] leading-snug text-ink-soft">{s.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditorBody(p: any) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block font-display text-[13px] font-bold text-ink">Nama Pengirim</label>
          <input type="text" value={p.senderName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => p.setSenderName(e.target.value)}
            className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none" placeholder="20FIT" />
        </div>
        <div>
          <label className="mb-2 block font-display text-[13px] font-bold text-ink">Subject <span className="text-red">*</span></label>
          <input type="text" value={p.subject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => p.setSubject(e.target.value)}
            className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink focus:border-ink focus:outline-none" placeholder="Subject email Anda" />
        </div>
      </div>
      <p className="font-mono text-[11px] text-ink-faint">Variabel: {"{{first_name}}"}, {"{{full_name}}"}, {"{{city}}"} · link unsubscribe otomatis</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={p.mode === "blocks" ? "primary" : "outline"} onClick={() => p.switchMode("blocks")} disabled={p.htmlEdited} title={p.htmlEdited ? "Sudah diedit sebagai HTML" : undefined}>
          <Blocks className="mr-1 h-4 w-4" />Blok
        </Button>
        <Button size="sm" variant={p.mode === "html" ? "primary" : "outline"} onClick={() => p.switchMode("html")}><Code className="mr-1 h-4 w-4" />HTML</Button>
        <Button size="sm" variant={p.mode === "preview" ? "primary" : "outline"} onClick={() => p.switchMode("preview")}><Eye className="mr-1 h-4 w-4" />Preview</Button>
        <Button size="sm" variant="outline" onClick={() => p.setShowAssets((v: boolean) => !v)}><ImageIcon className="mr-1 h-4 w-4" />Logo &amp; Gambar</Button>
      </div>
      {p.mode === "blocks" && (
        <p className="font-body text-[11px] text-ink-faint">Susun blok dengan drag-and-drop. Beralih ke HTML untuk edit manual (setelah itu mode Blok terkunci).</p>
      )}

      {p.showAssets && (
        <div className="rounded-md border border-glass-border bg-glass p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-[13px] font-bold text-ink">Pustaka Logo</p>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-glass-border bg-surface px-3 py-1.5 font-body text-[12px] text-ink hover:opacity-80">
              <Upload className="h-3.5 w-3.5" />{p.uploading ? "Mengunggah…" : "Unggah logo"}
              <input ref={p.fileRef} type="file" accept="image/*" className="hidden" onChange={p.onUpload} disabled={p.uploading} />
            </label>
          </div>
          {p.assetMsg && <p className="mb-2 font-body text-[12px] text-red">{p.assetMsg}</p>}
          {p.assets.length === 0 ? (
            <p className="font-body text-[12px] text-ink-soft">Belum ada logo. Unggah untuk dipakai di email.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {p.assets.map((a: BrandAsset) => (
                <div key={a.id} className="group relative flex flex-col items-center gap-1 rounded border border-glass-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.publicUrl} alt={a.name} className="h-12 w-full object-contain" />
                  <button type="button" onClick={() => p.insertLogo(a)} className="w-full rounded-sm bg-red px-2 py-1 font-body text-[11px] font-bold text-white hover:opacity-90">Sisipkan</button>
                  <button type="button" onClick={() => p.onDeleteAsset(a.id)} aria-label="Hapus" className="absolute right-1 top-1 rounded bg-black/40 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {p.mode === "blocks" ? (
        <BlockEditor blocks={p.blocks} setBlocks={p.setBlocks} assets={p.assets} />
      ) : p.mode === "html" ? (
        <textarea
          ref={p.textareaRef}
          value={p.htmlContent}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => p.setHtmlContent(e.target.value)}
          className="h-[420px] w-full rounded-md border border-glass-border bg-glass p-3 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
          placeholder="<!DOCTYPE html>..."
        />
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-glass-border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[11px] text-ink-faint"><strong>From:</strong> {p.senderName} &lt;crm@20fit.id&gt; · <strong>Subject:</strong> {p.subject || "(no subject)"}</div>
            <div className="flex items-center gap-1" role="group" aria-label="Lebar pratinjau">
              <Button size="sm" variant={p.previewWidth === "desktop" ? "primary" : "outline"} onClick={() => p.setPreviewWidth("desktop")}>
                <Monitor className="mr-1 h-4 w-4" />Desktop
              </Button>
              <Button size="sm" variant={p.previewWidth === "mobile" ? "primary" : "outline"} onClick={() => p.setPreviewWidth("mobile")}>
                <Smartphone className="mr-1 h-4 w-4" />Ponsel
              </Button>
            </div>
          </div>
          <div className="flex justify-center overflow-auto rounded border border-glass-border bg-[#f4f4f5] p-3">
            <iframe
              key={`${p.previewWidth}:${p.previewHtml.length}`}
              srcDoc={p.previewHtml}
              sandbox="allow-same-origin"
              style={{ width: p.previewWidth === "mobile" ? 390 : 680, height: 520 }}
              className="rounded border border-glass-border bg-white"
              title={`Pratinjau email (${p.previewWidth === "mobile" ? "ponsel 390px" : "desktop 680px"})`}
            />
          </div>
          <p className="font-body text-[11px] leading-relaxed text-ink-soft">
            Data contoh (Budi Santoso), bukan pelanggan nyata. <strong>Pratinjau peramban ≠ klien email</strong> —
            Gmail, Outlook, dan Apple Mail merender berbeda (termasuk mode gelap). Satu-satunya uji yang meyakinkan
            adalah <strong>Send test</strong> ke alamat nyata (Campaigns → Kirim uji), yang sudah terbukti bekerja.
          </p>
        </div>
      )}
    </div>
  );
}
