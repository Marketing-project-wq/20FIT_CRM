"use client";

import { useEffect } from "react";
import { ImportWizard } from "@/components/audience/import-wizard";

/** Canned API responses (no network, no DB). Numbers chosen to show a realistic import where the
 *  suppression count is small but non-zero — the compliance-critical figure the operator must see. */
const MAPPING = { Nama: "full_name", Email: "email", "No HP": "phone", Kota: "city" };
const PREVIEW = [
  { Nama: "Andi Pratama", Email: "andi@mail.com", "No HP": "0812-3456-7890", Kota: "Jakarta" },
  { Nama: "Bunga Sari", Email: "bunga@mail.com", "No HP": "0813-1111-2222", Kota: "Bandung" },
  { Nama: "Cahyo Nugroho", Email: "cahyo@mail.com", "No HP": "", Kota: "Surabaya" },
];
const SUMMARY = {
  read: 1200,
  validEmail: 1180,
  invalid: 20,
  duplicatesExisting: 150,
  duplicatesInBatch: 30,
  suppressed: 8,
  netInsert: 1000,
  netContactable: 992,
};
const OUTCOMES = [
  { index: 4, status: "skip_invalid", email: null },
  { index: 9, status: "skip_duplicate_existing", email: "sudahada@mail.com" },
  { index: 15, status: "skip_duplicate_in_batch", email: "dobel@mail.com" },
];

export function ImportPreview() {
  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/audience/import")) {
        const body = JSON.parse((init?.body as string) ?? "{}");
        const phase = body.phase as string;
        let payload: unknown;
        if (phase === "analyze") payload = { ok: true, phase, mapping: MAPPING, preview: PREVIEW };
        else if (phase === "dry_run") payload = { ok: true, phase, mapping: MAPPING, preview: PREVIEW, plan: { summary: SUMMARY } };
        else payload = { ok: true, phase: "execute", plan: { summary: SUMMARY, outcomes: OUTCOMES }, committed: { inserted: 1000 }, batch: "b1e9c0a2-fixture", mirrorRefreshed: true };
        return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return orig(input, init);
    };
    return () => {
      window.fetch = orig;
    };
  }, []);

  return <ImportWizard />;
}
