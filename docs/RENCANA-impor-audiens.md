# RENCANA + KEPUTUSAN — Impor CSV audiens (Fase 1)

**Status: DIBANGUN (Fase 1), migrasi DB BERGATE (belum diterapkan).** Keputusan pemilik produk
2026-09-02. Fase 1 = CSV saja; Excel menyusul (butuh library, ditunda).

Jalur masuk data BARU ke CRM yang tunduk pada consent + suppression. Dibangun mengikuti pola ingest
yang ada (`crm_ingest_activity_people`), bukan jalur baru.

## Keputusan (pemilik produk, 2026-09-02)

1. **Consent — baris impor LANGSUNG contactable** (bukan `legacy_import_unverified`). K-36 berlaku:
   consent sudah diberikan di titik pengumpulan; impor hanya memindahkan data yang seharusnya sudah ada
   di Supabase. Yang WAJIB (tapi tidak memblokir): field **"sumber pengumpulan"** diisi saat unggah
   (deskripsi konkret asal daftar), disimpan sebagai baris `crm_consent` `basis='opt_in'` +
   `evidence` jsonb `{source, batch, uploaded_by, filename, collection_source}` — **bukti, bukan
   gerbang**. Koreksi bertanggal terhadap `RENCANA-ingest-ticket.md` ditulis (jalur asing tetap
   `legacy_import_unverified`).
2. **Dedup — EMAIL-PRIMER, LEWATI saja** (K-55, 2026-09-02, mengganti "email ATAU telepon"). Cocok
   **email** (ternormalisasi) dengan master → dilewati (identitas personal, tak ambigu). Cocok
   **telepon saja** → **tetap dimasukkan** tapi ditandai "telepon bersama" (angka tersendiri di
   ringkasan), dan teleponnya di-null-kan saat tulis (master unik pada telepon) — telepon adalah
   pengenal bersama (rumah tangga/orang tua/kantor), tak boleh menghapus orang berbeda. Tak pernah
   menimpa; master tetap otoritatif. Suppression tetap keyed telepon (tak berubah) — masuk pool ≠ bisa
   dikirimi.
3. **Parser — papaparse** (satu-satunya dependency baru yang disetujui). Parsing di server.
4. **Excel — ditunda.** CSV dulu.
5. **Cap — 20.000 baris/file** (Fase 1, `MAX_IMPORT_ROWS`, satu konstanta). Diperbesar setelah terbukti.

## Yang dibangun

- **Perencana murni** `lib/crm/import-audience.ts` — pemetaan kolom (tebak dari header), normalisasi
  lewat `normalize.ts` (canon telepon `62…` tanpa `+`, email trim+lower), dan `planImport()` yang
  menghasilkan ringkasan + daftar baris yang akan dimasukkan + disposisi per baris. **Tanpa I/O →
  tidak bisa menulis.** Diuji (`import-audience.test.ts`).
- **Orkestrator** `lib/crm/import-audience-run.ts` — `runImportRequest(input, deps)` dengan deps
  di-inject. **Dry-run TIDAK memanggil deps tulis apa pun** — dibuktikan test
  (`import-audience-run.test.ts`), bukan sekadar review.
- **Route** `app/api/audience/import/route.ts` — 3 fase (analyze → dry_run → execute). Super-admin only
  (`canImportAudience`). Parse papaparse di server. Execute → RPC `crm_ingest_csv_people` → audit
  (`audience.imported`, PII-free) → refresh mirror.
- **RBAC** — extension action `audience.import` (super_admin only, Fase 1), `canImportAudience()`.
  Pending Jeff (seperti `profile.edit_demographic`).
- **UI** `app/(app)/audience/import/` + `components/audience/import-wizard.tsx` — unggah → petakan →
  ringkasan (angka lengkap; "kena suppression" ditonjolkan) → konfirmasi (sumber pengumpulan wajib) →
  laporan (berhasil / dilewati + alasan / daftar baris). Hardcoded Indonesia (utang i18n — Fase 1).
- **Migrasi (BERGATE, belum diterapkan)** `supabase/migrations/20260902050000_crm_ingest_csv_people.sql`
  — fungsi `SECURITY DEFINER`, EXECUTE `service_role` only, kolom aman saja, anti-join skip-only,
  phone-conflict di-null-kan, consent-evidence per orang.

## Suppression

Tidak berubah dan tidak disentuh. Suppression keyed by identitas (email/telepon ternormalisasi) dan
dicek saat kirim (`fetchSuppressedCustomerIds`) via `phone_normalized`/`email_normalized`. Maka:
identitas ter-suppress yang diimpor ulang **tetap tersaring** saat kirim. Impor **tak pernah** menulis
atau mengubah `crm_suppression`. Baris net-new yang ter-suppress tetap dimasukkan (mereka orang nyata)
tapi dihitung terpisah ("kena suppression") supaya operator tahu berapa yang takkan menerima kiriman.

## Rollback (siap pakai — untuk tiap batch)

Setiap baris impor distempel `source='csv_import'` + `tags=['csv_import','batch:<uuid>']`; consent-nya
`source='csv_import'` dengan `evidence->>'batch'`. Untuk membatalkan satu batch:

```sql
-- 1) hapus baris consent-evidence batch
delete from public.crm_consent
 where source='csv_import' and evidence->>'batch' = '<BATCH_UUID>';
-- 2) hapus orang yang diimpor (cek merged_into dulu — baris ter-merge sudah memindahkan datanya)
delete from public.master_customer
 where source='csv_import' and tags @> array['batch:<BATCH_UUID>'] and merged_into is null;
-- 3) refresh mirror
select public.crm_refresh_customer_mirror();
```

## Butir menggantung (follow-up, bukan pemblokir Fase 1)

- **Terapkan migrasi** `20260902050000` (BERGATE — tampilkan SQL, konfirmasi, apply, verifikasi,
  README ledger). Belum diterapkan.
- **Purge denylist**: tambahkan family `audience.imported` ke denylist kepatuhan
  `crm_purge_audit_log` (seperti `campaign.%`, `consent.*`) agar jejak impor tak terhapus retensi.
- **i18n**: terjemahkan layar impor (belum di `BILINGUAL_SCREENS`).
- **Excel (.xlsx)**: butuh SheetJS — keputusan terpisah.
- **RBAC**: mungkin buka ke `crm_manager` setelah terbukti.
- **TIDAK ADA impor ke produksi tanpa persetujuan pemilik** — termasuk untuk pengujian.
