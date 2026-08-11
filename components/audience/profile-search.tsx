"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, UserSearch, Lock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEARCH_KINDS, type SearchKind } from "@/lib/crm/search";
import { formatDisplayName } from "@/lib/crm/display-name";

interface Hit {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
}

type Result =
  | { status: "idle" }
  | { status: "empty" }
  | { status: "too_many"; cap: number }
  | { status: "ok"; rows: Hit[]; masked: boolean };

const KIND_LABEL: Record<SearchKind, string> = { name: "Nama", phone: "Telepon", email: "Email" };
const PLACEHOLDER: Record<SearchKind, string> = {
  name: "min. 3 huruf nama…",
  phone: "nomor lengkap (0812…, +62…, 62…)",
  email: "alamat email lengkap",
};

/**
 * Find ONE person, to reach the suppression write path. Distinct from the filters below
 * (which BROWSE a list). Phone/email are matched EXACTLY and normalized server-side; a
 * lone phone/email hit jumps straight to the profile. Writes `search.performed`, not
 * `list.viewed` — the header text says which the user is doing.
 */
export function ProfileSearch() {
  const router = useRouter();
  const [kind, setKind] = useState<SearchKind>("phone");
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (q.trim() === "") {
      setError("Isi kata kunci pencarian.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `Gagal mencari (HTTP ${res.status}).`);
        setResult({ status: "idle" });
        return;
      }
      if (data.status === "empty") {
        setResult({ status: "empty" });
      } else if (data.status === "too_many") {
        setResult({ status: "too_many", cap: data.cap });
      } else {
        const rows = data.rows as Hit[];
        // Exact identifier match with a single person → go straight there, no middle step.
        if ((kind === "phone" || kind === "email") && rows.length === 1) {
          router.push(`/audience/${rows[0].customer_id}`);
          return;
        }
        setResult({ status: "ok", rows, masked: data.masked });
      }
    } catch {
      setError("Gagal terhubung ke server.");
      setResult({ status: "idle" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-card p-5">
      <div className="flex items-center gap-2">
        <UserSearch className="h-4 w-4 text-ink-soft" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
          Cari satu orang
        </h2>
      </div>
      <p className="mt-1 font-body text-[13px] leading-relaxed text-ink-soft">
        Untuk menemukan orang yang <strong>baru saja menelepon</strong> — lalu buka profil &amp;
        catat permintaan berhenti dihubungi. Telepon &amp; email dicocokkan <strong>sama persis</strong>
        {" "}(harus nomor/email lengkap), nama dengan potongan kata. Ini <strong>mencari satu orang</strong>{" "}
        (tercatat <span className="font-mono text-[12px]">search.performed</span>) — berbeda dari{" "}
        <strong>menyaring daftar</strong> di bawah (<span className="font-mono text-[12px]">list.viewed</span>).
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-sm border border-glass-border">
          {SEARCH_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setResult({ status: "idle" });
                setError(null);
              }}
              className={`px-3 py-2 font-display text-[12px] font-bold uppercase tracking-wide transition-colors ${
                kind === k ? "tint-red text-ink" : "text-ink-soft hover:bg-glass"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={PLACEHOLDER[kind]}
            inputMode={kind === "phone" ? "tel" : kind === "email" ? "email" : "text"}
            className="h-10 w-full rounded-sm border border-glass-border bg-glass pl-9 pr-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
          />
        </div>

        <Button type="submit" disabled={busy}>
          {busy ? "Mencari…" : "Cari"}
        </Button>
      </form>

      {error && <p className="mt-3 font-body text-[13px] text-red">{error}</p>}

      {result.status === "empty" && (
        <p className="mt-3 font-body text-[13px] text-ink-soft">
          Tidak ditemukan. {kind === "name" ? "Coba potongan nama lain." : "Pastikan nomor/email lengkap dan benar."}
        </p>
      )}

      {result.status === "too_many" && (
        <p className="mt-3 font-body text-[13px] text-ink-soft">
          Terlalu banyak hasil (lebih dari {result.cap}). <strong>Persempit</strong> kata kuncinya — pencarian
          ini sengaja tidak menawarkan halaman berikutnya. Untuk menelusuri banyak orang, pakai daftar tersaring
          di bawah.
        </p>
      )}

      {result.status === "ok" && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-ink-faint">{result.rows.length} hasil</span>
            {result.masked && (
              <Badge tone="amber" className="gap-1.5"><Lock className="h-3 w-3" /> disamarkan</Badge>
            )}
          </div>
          <ul className="divide-y divide-glass-border rounded-sm border border-glass-border">
            {result.rows.map((r) => (
              <li key={r.customer_id}>
                <Link
                  href={`/audience/${r.customer_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-glass"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-ink">{formatDisplayName(r.full_name) ?? "(tanpa nama)"}</span>
                    <span className="font-mono text-[12px] text-ink-soft">
                      {[r.phone, r.email, r.city].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-display text-[12px] font-bold uppercase tracking-wide text-red">
                    Buka profil <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
