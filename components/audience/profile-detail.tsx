"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, HeartPulse } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Profile {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
  source: string | null;
  first_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_potential_duplicate: boolean | null;
  duplicate_reason: string | null;
  is_merged: boolean | null;
  notes: string | null;
  tags: string[] | null;
  masked: boolean;
}

interface ApiResult {
  profile: Profile;
  canViewHealth: boolean;
}

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }).format(d);
}

function Empty() {
  return <span className="font-body text-[13px] italic text-ink-faint">belum terisi</span>;
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-t border-glass-border py-3 first:border-t-0 first:pt-0">
      <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={mono ? "font-mono text-[13px] text-ink" : "font-body text-[14px] text-ink"}>{children}</span>
    </div>
  );
}

export function ProfileDetail({ id }: { id: string }) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">("loading");

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/audience/${id}`, { signal: ac.signal, cache: "no-store" });
        if (res.status === 404) {
          setState("not_found");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        setData((await res.json()) as ApiResult);
        setState("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState("error");
      }
    })();
    return () => ac.abort();
  }, [id]);

  const BackLink = () => (
    <Link
      href="/audience"
      className="inline-flex items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Kembali ke audience
    </Link>
  );

  if (state === "loading") {
    return (
      <div className="space-y-6">
        <BackLink />
        <p className="font-body text-[14px] text-ink-soft">Memuat profil…</p>
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="neutral">Tidak ditemukan</Badge>
          <p className="max-w-md font-body text-[14px] text-ink-soft">Profil tidak ditemukan.</p>
        </div>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Gagal</Badge>
          <p className="max-w-md font-body text-[14px] text-ink-soft">Profil gagal dimuat.</p>
        </div>
      </div>
    );
  }

  const p = data.profile;

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            {p.full_name ? p.full_name : "Tanpa nama"}
          </h1>
          <p className="mt-2 font-mono text-[12px] text-ink-faint">{p.customer_id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.masked && (
            <Badge tone="amber" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> Kontak disamarkan</Badge>
          )}
          {p.is_merged ? <Badge tone="neutral">Sudah di-merge</Badge> : null}
          {p.is_potential_duplicate ? <Badge tone="amber">Kemungkinan duplikat</Badge> : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Kontak */}
        <section className="glass shadow-glass p-6">
          <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Kontak</h2>
          <div className="mt-4">
            <Field label="Telepon" mono>{p.phone ? p.phone : <Empty />}</Field>
            <Field label="Email" mono>{p.email ? p.email : <Empty />}</Field>
            <Field label="Kota">{p.city ? p.city : <Empty />}</Field>
          </div>
        </section>

        {/* Atribut */}
        <section className="glass shadow-glass p-6">
          <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Atribut</h2>
          <div className="mt-4">
            <Field label="Unit pertama">{p.first_unit ? p.first_unit : <Empty />}</Field>
            <Field label="Segment">
              {p.segment ? <Badge tone="neutral">{p.segment}</Badge> : <span className="font-body text-[13px] italic text-ink-faint">(tanpa segment)</span>}
            </Field>
            <Field label="Lifetime value" mono>
              {p.lifetime_value != null ? (p.lifetime_value > 0 ? idr.format(p.lifetime_value) : <span className="text-ink-faint">Rp 0</span>) : <Empty />}
            </Field>
            <Field label="Sumber" mono>{p.source ? p.source : <Empty />}</Field>
          </div>
        </section>

        {/* Jejak waktu */}
        <section className="glass shadow-glass p-6">
          <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Jejak waktu</h2>
          <div className="mt-4">
            <Field label="Pertama terlihat" mono>{formatTs(p.first_seen_at)}</Field>
            <Field label="Dibuat" mono>{formatTs(p.created_at)}</Field>
            <Field label="Diperbarui" mono>{formatTs(p.updated_at)}</Field>
            {/* last_activity_at sengaja TIDAK ditampilkan (artefak impor, aturan sejak 3A). */}
          </div>
        </section>

        {/* Kurasi & duplikat */}
        <section className="glass shadow-glass p-6">
          <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Kurasi & duplikat</h2>
          <div className="mt-4">
            <Field label="Catatan">{p.notes ? p.notes : <Empty />}</Field>
            <Field label="Tag">
              {p.tags && p.tags.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">{p.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span>
              ) : <Empty />}
            </Field>
            <Field label="Alasan duplikat">{p.duplicate_reason ? p.duplicate_reason : <Empty />}</Field>
          </div>
        </section>

        {/* Health flags — structural gate, but no source exists. */}
        {data.canViewHealth && (
          <section className="glass shadow-glass p-6 lg:col-span-2">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-ink-soft" aria-hidden />
              <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Health flags</h2>
            </div>
            <div className="mt-4 rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
              <Badge tone="neutral">Tidak ada sumber data</Badge>
              <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
                <span className="font-mono text-[12px]">master_customer</span> tidak memiliki kolom kesehatan
                apa pun. Satu-satunya sumber (<span className="font-mono text-[12px]">clinic_*</span>) di luar
                lingkup dan masih RLS OFF. Ini <strong>bukan</strong> “sehat” dan bukan nol terukur — memang
                belum ada sumbernya. Gerbang <span className="font-mono text-[12px]">profile.view_health</span>
                {" "}dipertahankan agar tetap benar begitu sumbernya ada.
              </p>
            </div>
          </section>
        )}
      </div>

      <p className="font-mono text-[11px] text-ink-faint">
        Baca saja · nol tombol edit/hapus/merge · pembukaan profil ini tercatat (profile.viewed) · kontak disamarkan di server untuk peran tanpa izin kontak.
      </p>
    </div>
  );
}
