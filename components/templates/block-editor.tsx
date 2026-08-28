"use client";

import { useState } from "react";
import { GripVertical, Trash2, Plus, Type, Heading, Image as ImageIcon, MousePointerClick, Minus, MoveVertical } from "lucide-react";
import type { BrandAsset } from "@/app/(app)/templates/brand-asset-actions";

/**
 * Lightweight drag-and-drop email block editor. Native HTML5 drag (no library). State is an ordered
 * list of typed blocks; blocksToHtml() renders email-safe, table-wrapped, inline-styled HTML — the
 * SAME shape as the starter templates so it survives Gmail/Outlook. The generated HTML is the single
 * source of truth (stored in crm_message_template.body). One-way: blocks → HTML. There is no HTML →
 * blocks parse (fragile), so once the user edits raw HTML, block mode is not reconstructed from it.
 */

export type Block =
  | { id: string; kind: "logo"; url: string; alt: string }
  | { id: string; kind: "heading"; text: string }
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "image"; url: string; alt: string }
  | { id: string; kind: "button"; text: string; url: string }
  | { id: string; kind: "divider" }
  | { id: string; kind: "spacer" };

const uid = () => Math.random().toString(36).slice(2, 9);

export function newBlock(kind: Block["kind"]): Block {
  switch (kind) {
    case "logo": return { id: uid(), kind: "logo", url: "", alt: "Logo" };
    case "heading": return { id: uid(), kind: "heading", text: "Judul di sini" };
    case "text": return { id: uid(), kind: "text", text: "Tulis isi paragraf di sini. Halo {{first_name}}," };
    case "image": return { id: uid(), kind: "image", url: "", alt: "Gambar" };
    case "button": return { id: uid(), kind: "button", text: "Klik di sini", url: "https://20fit.id" };
    case "divider": return { id: uid(), kind: "divider" };
    case "spacer": return { id: uid(), kind: "spacer" };
  }
}

/** Render blocks to email-safe HTML (table wrapper, inline styles). */
export function blocksToHtml(blocks: Block[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = blocks.map((b) => {
    switch (b.kind) {
      case "logo":
        return b.url ? `<tr><td style="padding:16px 32px;text-align:center;"><img src="${b.url}" alt="${esc(b.alt)}" style="max-width:180px;height:auto;display:inline-block;" /></td></tr>` : "";
      case "heading":
        return `<tr><td style="padding:8px 32px;"><h1 style="margin:0;font-size:22px;color:#1d1d1f;font-family:Arial,Helvetica,sans-serif;">${esc(b.text)}</h1></td></tr>`;
      case "text":
        return `<tr><td style="padding:8px 32px;"><p style="margin:0;font-size:15px;line-height:1.6;color:#1d1d1f;font-family:Arial,Helvetica,sans-serif;">${esc(b.text).replace(/\n/g, "<br>")}</p></td></tr>`;
      case "image":
        return b.url ? `<tr><td style="padding:8px 32px;text-align:center;"><img src="${b.url}" alt="${esc(b.alt)}" style="max-width:100%;height:auto;display:inline-block;border-radius:6px;" /></td></tr>` : "";
      case "button":
        return `<tr><td style="padding:16px 32px;text-align:center;"><a href="${esc(b.url)}" style="display:inline-block;background:#E4002B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:15px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">${esc(b.text)}</a></td></tr>`;
      case "divider":
        return `<tr><td style="padding:8px 32px;"><hr style="border:none;border-top:1px solid #e5e5e5;margin:0;" /></td></tr>`;
      case "spacer":
        return `<tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>`;
    }
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
${rows}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const PALETTE: { kind: Block["kind"]; icon: React.ReactNode; label: string }[] = [
  { kind: "logo", icon: <ImageIcon className="h-4 w-4" />, label: "Logo" },
  { kind: "heading", icon: <Heading className="h-4 w-4" />, label: "Judul" },
  { kind: "text", icon: <Type className="h-4 w-4" />, label: "Teks" },
  { kind: "image", icon: <ImageIcon className="h-4 w-4" />, label: "Gambar" },
  { kind: "button", icon: <MousePointerClick className="h-4 w-4" />, label: "Tombol" },
  { kind: "divider", icon: <Minus className="h-4 w-4" />, label: "Garis" },
  { kind: "spacer", icon: <MoveVertical className="h-4 w-4" />, label: "Spasi" },
];

const inputCls =
  "w-full rounded-sm border border-glass-border bg-glass px-2 py-1.5 font-body text-[13px] text-ink focus:border-ink focus:outline-none";

export function BlockEditor({
  blocks, setBlocks, assets,
}: {
  blocks: Block[];
  setBlocks: (b: Block[]) => void;
  assets: BrandAsset[];
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const add = (kind: Block["kind"]) => setBlocks([...blocks, newBlock(kind)]);
  const update = (id: string, patch: Partial<Block>) =>
    setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  const remove = (id: string) => setBlocks(blocks.filter((b) => b.id !== id));

  function onDrop(target: number) {
    if (dragIdx === null || dragIdx === target) return;
    const next = [...blocks];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(target, 0, moved);
    setBlocks(next);
    setDragIdx(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Palette */}
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((p) => (
          <button
            key={p.kind}
            type="button"
            onClick={() => add(p.kind)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-glass-border bg-glass px-3 py-1.5 font-body text-[12px] text-ink hover:border-red"
          >
            <Plus className="h-3 w-3" />{p.icon}{p.label}
          </button>
        ))}
      </div>

      {/* Blocks */}
      {blocks.length === 0 ? (
        <p className="rounded-md border border-dashed border-glass-border px-4 py-8 text-center font-body text-[13px] text-ink-soft">
          Tambahkan blok dari atas untuk mulai menyusun email.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {blocks.map((b, i) => (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className="flex items-start gap-2 rounded-md border border-glass-border bg-surface p-3"
            >
              <button type="button" className="mt-1 cursor-grab text-ink-faint active:cursor-grabbing" aria-label="Geser">
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="flex-1">
                <BlockFields block={b} update={update} assets={assets} />
              </div>
              <button type="button" onClick={() => remove(b.id)} aria-label="Hapus" className="mt-1 text-ink-faint hover:text-red">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockFields({
  block, update, assets,
}: {
  block: Block;
  update: (id: string, patch: Partial<Block>) => void;
  assets: BrandAsset[];
}) {
  const label = (s: string) => <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{s}</span>;

  switch (block.kind) {
    case "logo":
    case "image":
      return (
        <div className="flex flex-col gap-2">
          {label(block.kind === "logo" ? "Logo" : "Gambar")}
          {assets.length === 0 ? (
            <p className="font-body text-[12px] text-ink-soft">Unggah logo dulu di panel “Logo &amp; Gambar”.</p>
          ) : (
            <select className={inputCls} value={block.url} onChange={(e) => update(block.id, { url: e.target.value } as Partial<Block>)}>
              <option value="">— pilih —</option>
              {assets.map((a) => <option key={a.id} value={a.publicUrl}>{a.name}</option>)}
            </select>
          )}
          {block.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.url} alt="" className="h-12 w-auto object-contain" />
          )}
        </div>
      );
    case "heading":
      return <div>{label("Judul")}<input className={inputCls} value={block.text} onChange={(e) => update(block.id, { text: e.target.value } as Partial<Block>)} /></div>;
    case "text":
      return <div>{label("Teks")}<textarea className={inputCls} rows={3} value={block.text} onChange={(e) => update(block.id, { text: e.target.value } as Partial<Block>)} /></div>;
    case "button":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>{label("Teks tombol")}<input className={inputCls} value={block.text} onChange={(e) => update(block.id, { text: e.target.value } as Partial<Block>)} /></div>
          <div>{label("Link URL")}<input className={inputCls} value={block.url} onChange={(e) => update(block.id, { url: e.target.value } as Partial<Block>)} /></div>
        </div>
      );
    case "divider":
      return <p className="font-body text-[12px] text-ink-soft">Garis pemisah</p>;
    case "spacer":
      return <p className="font-body text-[12px] text-ink-soft">Spasi kosong</p>;
  }
}
