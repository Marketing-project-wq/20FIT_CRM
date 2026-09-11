"use client";

import { useState, useRef, useCallback } from "react";
import { formatCount } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

export interface GrowthPoint {
  date: string;
  total: number;
  added: number;
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function formatDateLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-US" : "id-ID", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const PAD = { top: 20, right: 16, bottom: 32, left: 48 };

export function GrowthChart({
  points,
  lang,
  addedLabel,
}: {
  points: GrowthPoint[];
  lang: Lang;
  addedLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  const W = 560;
  const H = 220;
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const minVal = Math.min(...points.map((p) => p.total));
  const maxVal = Math.max(...points.map((p) => p.total));
  const range = maxVal - minVal || 1;
  const yFloor = Math.max(0, minVal - range * 0.08);
  const yCeil = maxVal + range * 0.08;
  const yRange = yCeil - yFloor;

  const xOf = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * cw : cw / 2);
  const yOf = (v: number) => PAD.top + ch - ((v - yFloor) / yRange) * ch;

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.total).toFixed(1)}`).join(" ");

  const areaD = `${pathD} L${xOf(points.length - 1).toFixed(1)},${(PAD.top + ch).toFixed(1)} L${xOf(0).toFixed(1)},${(PAD.top + ch).toFixed(1)} Z`;

  const yTicks: number[] = [];
  {
    const step = niceStep(yRange, 4);
    let tick = Math.ceil(yFloor / step) * step;
    while (tick <= yCeil) {
      yTicks.push(tick);
      tick += step;
    }
  }

  const xLabels: { idx: number; label: string }[] = [];
  {
    let lastLabel = "";
    for (let i = 0; i < points.length; i++) {
      const ml = monthLabel(points[i].date, lang);
      if (ml !== lastLabel) {
        xLabels.push({ idx: i, label: ml });
        lastLabel = ml;
      }
    }
  }

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || points.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      let closest = 0;
      let bestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(mx - xOf(i));
        if (dist < bestDist) {
          bestDist = dist;
          closest = i;
        }
      }
      setHover({ idx: closest, x: xOf(closest), y: yOf(points[closest].total) });
    },
    [points],
  );

  const onMouseLeave = useCallback(() => setHover(null), []);

  const hp = hover ? points[hover.idx] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {/* Y grid + labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="var(--surface-border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={yOf(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-faint"
              style={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)" }}
            >
              {compactNum(tick)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map(({ idx, label }) => (
          <text
            key={`${idx}-${label}`}
            x={xOf(idx)}
            y={H - 6}
            textAnchor="middle"
            className="fill-ink-faint"
            style={{ fontSize: 9, fontFamily: "var(--font-body, sans-serif)" }}
          >
            {label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaD} fill="var(--blue)" opacity={0.08} />

        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots where audience was added */}
        {points.map((p, i) =>
          p.added > 0 ? (
            <circle key={i} cx={xOf(i)} cy={yOf(p.total)} r={3} fill="var(--blue)" />
          ) : null,
        )}

        {/* Hover crosshair + dot */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + ch} stroke="var(--ink-faint)" strokeWidth={0.5} strokeDasharray="3,3" />
            <circle cx={hover.x} cy={hover.y} r={4.5} fill="var(--surface)" stroke="var(--blue)" strokeWidth={2} />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hover && hp && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-glass-border bg-surface px-3 py-2 shadow-sm"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: hover.x > W * 0.65 ? "translate(-105%, -110%)" : "translate(5%, -110%)",
          }}
        >
          <p className="font-body text-[11px] text-ink-faint">{formatDateLabel(hp.date, lang)}</p>
          <p className="font-display text-[14px] font-semibold tabular-nums text-ink">{formatCount(hp.total, lang)}</p>
          {hp.added > 0 && (
            <p className="font-body text-[11px] text-blue">+{formatCount(hp.added, lang)} {addedLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
}
