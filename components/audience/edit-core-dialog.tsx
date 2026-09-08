"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import { SEGMENT_VALUES, FIRST_UNIT_DROPDOWN_VALUES } from "@/lib/crm/core-vocab";

/**
 * The FIRST in-app editor of master_customer core fields (Bagian B, 8 Sep 2026). One dialog for both
 * the Kontak and Atribut cards. It sends ONLY fields the operator changed; blanks are left as
 * "don't touch" (v1 cannot CLEAR a field — stated on screen). email is absent by design (K-57).
 * Every guarantee is server-side: the RPC requires an actor, validates the closed vocab, catches a
 * phone collision as phone_taken (no other customer's PII), and refuses merged rows.
 */
export interface CoreCurrent {
  full_name: string | null;
  phone: string | null;
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
}

export function EditCoreDialog({
  customerId,
  current,
  onSaved,
}: {
  customerId: string;
  current: CoreCurrent;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const E = t.profile.editCore;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Empty string = "leave unchanged" (v1 cannot clear). Selects start at the current value.
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [firstUnit, setFirstUnit] = useState(current.first_unit ?? "");
  const [segment, setSegment] = useState(current.segment ?? "");
  const [ltv, setLtv] = useState("");

  function reset() {
    setFullName(""); setPhone(""); setCity("");
    setFirstUnit(current.first_unit ?? ""); setSegment(current.segment ?? ""); setLtv("");
    setErr(null);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    // Only send fields the operator actually set / changed.
    const payload: Record<string, unknown> = {};
    if (fullName.trim() !== "") payload.full_name = fullName.trim();
    if (phone.trim() !== "") payload.phone_raw = phone.trim();
    if (city.trim() !== "") payload.city = city.trim();
    if (firstUnit !== "" && firstUnit !== (current.first_unit ?? "")) payload.first_unit = firstUnit;
    if (segment !== "" && segment !== (current.segment ?? "")) payload.segment = segment;
    if (ltv.trim() !== "") payload.lifetime_value = Number(ltv);

    if (Object.keys(payload).length === 0) {
      setErr(E.errNoChange);
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/audience/${customerId}/core`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setErr(
          body.error === "phone_taken" ? E.errPhoneTaken
          : body.error === "row_merged" ? E.errRowMerged
          : body.error === "forbidden" ? E.errForbidden
          : body.message ?? E.errGeneric,
        );
        setBusy(false);
        return;
      }
      setBusy(false);
      setOpen(false);
      reset();
      onSaved();
    } catch {
      setErr(E.errGeneric);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        className="inline-flex items-center gap-1 rounded-sm border border-glass-border px-2 py-1 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
      >
        <Pencil className="h-3 w-3" aria-hidden /> {E.edit}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="mt-10 w-full max-w-lg rounded-card bg-surface p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-[16px] font-bold text-ink">{E.title}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="text-ink-soft hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <Text label={E.fName} value={fullName} onChange={setFullName} placeholder={current.full_name ?? E.empty} max={120} />
              <Text label={E.fPhone} value={phone} onChange={setPhone} placeholder={current.phone ?? E.empty} />
              <Text label={E.fCity} value={city} onChange={setCity} placeholder={current.city ?? E.empty} max={80} />
              <Select label={E.fFirstUnit} value={firstUnit} onChange={setFirstUnit} options={FIRST_UNIT_DROPDOWN_VALUES} none={E.pick} />
              <Select label={E.fSegment} value={segment} onChange={setSegment} options={SEGMENT_VALUES} none={E.pick} />
              <Text label={E.fLtv} value={ltv} onChange={setLtv} placeholder={current.lifetime_value != null ? String(current.lifetime_value) : E.empty} numeric />
            </div>

            {/* The three things the operator must be TOLD, not discover (T-56 class). */}
            <ul className="mt-4 space-y-1 font-body text-[12px] leading-relaxed text-ink-faint">
              <li>{E.noteBlankKeeps}</li>
              <li>{E.noteEmailLocked}</li>
              <li>{E.noteFirstUnitOrigin}</li>
            </ul>

            {err && <p className="tint-red mt-3 rounded-sm px-3 py-2 font-body text-[13px]" role="alert">{err}</p>}

            <div className="mt-5 flex items-center gap-2">
              <Button onClick={submit} disabled={busy}>{busy ? E.saving : E.save}</Button>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>{E.cancel}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Text({
  label, value, onChange, placeholder, max, numeric,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number; numeric?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block font-display text-[12px] font-bold text-ink">{label}</span>
      <input
        type={numeric ? "number" : "text"}
        value={value}
        maxLength={max}
        min={numeric ? 0 : undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
      />
    </label>
  );
}

function Select({
  label, value, onChange, options, none,
}: { label: string; value: string; onChange: (v: string) => void; options: readonly string[]; none: string }) {
  return (
    <label className="block">
      <span className="mb-1 block font-display text-[12px] font-bold text-ink">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-sm border border-glass-border bg-glass px-2 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red"
      >
        <option value="">— {none} —</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
