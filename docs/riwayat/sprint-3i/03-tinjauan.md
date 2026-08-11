# Tinjauan independen — Sprint 3I

> Diisi oleh sesi yang mengerjakan sprint ini (dokumentasi lintas-sprint, 11 Agu 2026).
> Pengetahuan langsung, bukan rekonstruksi.

## Lubang dikonfirmasi ke produksi, lalu ditutup
- **Sebelum:** `proacl` `crm_purge_audit_log(boolean)` memuat `=X/postgres` (PUBLIC),
  `anon`, `authenticated`, `service_role`. Fungsi `SECURITY DEFINER` yang menonaktifkan
  trigger append-only lalu menghapus audit — anon-callable. Tanda tangan dikonfirmasi
  `(boolean)` **sebelum** menulis revoke (revoke tanda tangan salah gagal diam-diam).
- **Migrasi 10 diterapkan** lewat `apply_migration` (ledger `20260811085420`).
- **Sesudah:** `proacl = {postgres=X/postgres, service_role=X/postgres}` — nol PUBLIC,
  nol anon/authenticated. Dan `crm_purge_audit_log()` (default `dry_run=true`) lewat
  service role tetap bekerja (`was_dry_run=true, matched_count=0`) — hak dicabut tanpa
  mematahkan jalur sah.

## Pagar EXECUTE — dibuktikan menggigit
`lib/crm/migration-execute-guard.test.ts`. Selain kasus sintetis permanen (fungsi
`crm_evil` tanpa revoke → terdeteksi), didemonstrasikan live: berkas buang
`zzzz_demo_unlocked.sql` berisi `crm_demo_hole` tanpa revoke ditaruh di dir migrasi →
test **RED** dengan pesan penjelas + nama offender; berkas dihapus → **GREEN** lagi.

## Penilaian yang ditulis eksplisit, bukan dilewati
- `crm_audit_log_no_mutate`: `EXECUTE` terbuka tapi **inert** — `prorettype = trigger`
  (PostgREST tak mengekspos fungsi trigger sebagai RPC) dan `SECURITY INVOKER` (tanpa
  elevasi). Dibiarkan, dengan alasan tertulis. → FAKTA-DATA, T-01.
- **101** fungsi non-`crm_*` anon-executable: milik tim lain, tidak disentuh, diangkat di
  `docs/RISIKO-rpc-execute-terbuka.md` dengan SQL pengukurnya. → T-03.

## Yang tidak bisa diverifikasi
- Bahwa anon **benar-benar** ditolak via HTTP: dibuktikan struktural lewat `proacl` (anon
  tak lagi punya EXECUTE), bukan dengan menembak endpoint pakai anon key dari sandbox.
