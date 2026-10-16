"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export const inputCls =
  "h-9 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";
export const areaCls =
  "w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";
export const labelCls = "font-body text-[12px] font-semibold text-ink-soft";
export const chipCls = (on: boolean) =>
  `rounded-full border px-3 py-1 font-body text-[12.5px] ${on ? "border-ink bg-ink text-white" : "border-glass-border bg-glass text-ink"}`;

export const when = (s: string | null | undefined, withDay = false) =>
  s
    ? new Date(s).toLocaleString("id-ID", {
        ...(withDay ? { weekday: "short" } : {}),
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      })
    : "–";
export const ago = (s: string | null | undefined) => {
  if (!s) return "–";
  const m = Math.round((Date.now() - +new Date(s)) / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt`;
  if (m < 60 * 24) return `${Math.round(m / 60)} jam`;
  return `${Math.round(m / 1440)} hari`;
};

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className={`card my-6 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-card border border-glass-border p-5 shadow-glass-lg`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[20px] font-bold uppercase text-ink">{title}</h2>
          <button type="button" aria-label="Tutup" onClick={onClose} className="text-ink-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Notice({ tone, text, onClose }: { tone: "green" | "red" | "amber" | "blue"; text: string; onClose?: () => void }) {
  return (
    <div className={`tint-${tone} flex items-start justify-between gap-3 rounded-card p-3 font-body text-[13px]`}>
      <span className="min-w-0 whitespace-pre-line">{text}</span>
      {onClose && <button type="button" aria-label="Tutup" onClick={onClose}><X className="h-4 w-4" /></button>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card flex min-w-0 flex-col gap-0.5 p-3">
      <span className="font-display text-[22px] font-bold leading-none text-ink">{value}</span>
      <span className="font-body text-[12px] text-ink-soft">{label}</span>
      {sub && <span className="truncate font-mono text-[10.5px] text-ink-faint">{sub}</span>}
    </div>
  );
}
