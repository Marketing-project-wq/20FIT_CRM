"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  ARTIFACT_ROWS,
  RETENTION_LABEL,
  RETENTION_TONE,
  classifyAction,
  isArtifact,
} from "@/lib/crm/audit-log-constants";

interface AuditRow {
  id: number;
  occurred_at: string | null;
  actor_email: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  summary: string | null;
  metadata: unknown;
}

interface ApiResult {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

const inputCls =
  "h-9 rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";

/** The honest caveat: this log is not the full history, and nothing has been purged yet. */
function RetentionNote() {
  return (
    <div className="tint-blue rounded-card p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
          Log ini bukan riwayat lengkap
        </h3>
      </div>
      <p className="mt-2 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
        Kebijakan retensi (migrasi 8) memangkas kategori <strong>operasional</strong>{" "}
        (<span className="font-mono">profile.viewed</span>, <span className="font-mono">list.viewed</span>,{" "}
        <span className="font-mono">search.*</span>, <span className="font-mono">login.*</span>) setelah
        90 hari; kategori <strong>kepatuhan</strong> (<span className="font-mono">consent.*</span>,{" "}
        <span className="font-mono">suppression.*</span>, <span className="font-mono">role.*</span>,{" "}
        <span className="font-mono">profile.deleted</span>, <span className="font-mono">export.*</span>,{" "}
        <span className="font-mono">retention.*</span>) dikecualikan permanen. Ketiadaan baris operasional
        lama tidak berarti tidak ada yang terjadi. <strong>Fungsi purge belum dijadwalkan</strong>, jadi
        sampai hari ini belum ada satu baris pun yang benar-benar terpangkas.
      </p>
    </div>
  );
}

export function AuditLogPanel() {
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ action: "", actorEmail: "", from: "", to: "" });
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(AUDIT_DEFAULT_PAGE_SIZE));
    if (applied.action) params.set("action", applied.action);
    if (applied.actorEmail) params.set("actorEmail", applied.actorEmail);
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);

    try {
      const res = await fetch(`/api/audit?${params.toString()}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message || `Gagal memuat (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData((await res.json()) as ApiResult);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError("Gagal terhubung ke server.");
      setData(null);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [page, applied]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const applyFilters = () => {
    setApplied({ action: action.trim(), actorEmail: actorEmail.trim(), from, to });
    setPage(1);
  };
  const resetFilters = () => {
    setAction("");
    setActorEmail("");
    setFrom("");
    setTo("");
    setApplied({ action: "", actorEmail: "", from: "", to: "" });
    setPage(1);
  };

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? AUDIT_DEFAULT_PAGE_SIZE;
  const rows = data?.rows ?? [];
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + rows.length;
  const hasNext = page * pageSize < total;

  // ISO bounds: `from` at start of day, `to` at end of day, so a single-day range works.
  const onFrom = (v: string) => setFrom(v ? `${v}T00:00:00` : "");
  const onTo = (v: string) => setTo(v ? `${v}T23:59:59` : "");

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-extrabold uppercase tracking-wide text-ink">
          Audit log
        </h2>
        <p className="max-w-2xl font-body text-[13px] text-ink-soft">
          Jejak “siapa melakukan apa”. Append-only — tidak ada tombol hapus atau edit karena
          trigger database menolaknya. Setiap pembukaan halaman ini sendiri tercatat.
        </p>
      </div>

      <RetentionNote />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Aksi / prefiks</span>
          <input className={inputCls} value={action} onChange={(e) => setAction(e.target.value)} placeholder="mis. role. atau list.viewed" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Email aktor</span>
          <input className={inputCls} value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} placeholder="mis. tifany@" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Dari</span>
          <input type="date" className={inputCls} onChange={(e) => onFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Sampai</span>
          <input type="date" className={inputCls} onChange={(e) => onTo(e.target.value)} />
        </label>
        <button type="button" onClick={applyFilters} className="h-9 rounded-sm bg-red px-4 font-display text-[12px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90">
          Terapkan
        </button>
        <button type="button" onClick={resetFilters} className="h-9 rounded-sm border border-glass-border px-4 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass">
          Reset
        </button>
      </div>

      <div className="overflow-x-auto rounded-card border border-glass-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-bold">Waktu (WIB)</th>
              <th className="px-4 py-3 font-bold">Aktor</th>
              <th className="px-4 py-3 font-bold">Aksi</th>
              <th className="px-4 py-3 font-bold">Retensi</th>
              <th className="px-4 py-3 font-bold">Target</th>
              <th className="px-4 py-3 font-bold">Ringkasan</th>
            </tr>
          </thead>
          <tbody className="font-body text-[13px] text-ink">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-16 text-center text-ink-soft">Memuat…</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="px-4 py-16 text-center"><Badge tone="red">Gagal</Badge><p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-16 text-center text-ink-soft">Tidak ada baris audit yang cocok.</td></tr>
            ) : (
              rows.map((r) => {
                const cls = classifyAction(r.action);
                const artifact = isArtifact(r.id);
                return (
                  <tr key={r.id} className="border-b border-glass-border last:border-0 align-top hover:bg-glass">
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">
                      {formatTs(r.occurred_at)}
                      {artifact && (
                        <span className="mt-1 flex items-center gap-1 text-ink-faint" title={ARTIFACT_ROWS[r.id]}>
                          <FlaskConical className="h-3 w-3" aria-hidden />
                          <span className="font-display text-[10px] font-bold uppercase tracking-wide">artefak</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.actor_email ?? <span className="text-ink-faint">sistem</span>}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.action}</td>
                    <td className="px-4 py-3"><Badge tone={RETENTION_TONE[cls]}>{RETENTION_LABEL[cls]}</Badge></td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-soft">
                      {r.target_table ?? "—"}
                      {r.target_id && <div className="text-ink-faint">{r.target_id}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {artifact && (
                        <p className="mb-1 font-body text-[11px] italic text-ink-faint">{ARTIFACT_ROWS[r.id]}</p>
                      )}
                      <p className="max-w-md text-ink-soft">{r.summary ?? "—"}</p>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-ink-faint">
          {total === 0 ? "0 baris" : `Menampilkan ${firstRow.toLocaleString("id-ID")}–${lastRow.toLocaleString("id-ID")} dari ${total.toLocaleString("id-ID")}`}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || page <= 1} className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40">
            Sebelumnya
          </button>
          <span className="font-mono text-[12px] text-ink-soft">Hal {page}</span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={loading || !hasNext} className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40">
            Berikutnya
          </button>
        </div>
      </div>

      <p className="font-mono text-[11px] text-ink-faint">
        Append-only · nol tombol hapus/edit · dibaca via service role server-side · pembukaan halaman ini tercatat (list.viewed).
      </p>
    </section>
  );
}
