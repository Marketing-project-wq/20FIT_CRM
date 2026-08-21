# `supabase/migrations/` — baca sebelum menyimpulkan apa yang sudah dimigrasi

Folder ini memuat berkas migrasi repo. **Ia TIDAK lengkap sebagai catatan apa yang hidup di
database**, dan `supabase db push` **dilarang** di proyek ini — ledger sudah diverge (setiap
migrasi dijalankan lewat `apply_migration` per gate, mencap versi sendiri). Lihat blok
"Migration ledger diverged" di `README.md` utama.

## ⚠️ Empat migrasi (cermin + kanon telepon + stats) TIDAK ada di folder ini — dengan sengaja

Migrasi **15** (`crm_customer_mirror` matview + `crm_mirror_meta` + `crm_refresh_customer_mirror()`),
**16** (kolom `is_fitco_member_matched`), **17** (`crm_norm_phone` guard empty-NSN), dan
**18** (precompute `dashboard_stats` + reader `crm_mirror_dashboard_stats()` + diagnostik
`crm_mirror_fitco_staleness()`) **diterapkan ke DB tapi disimpan di `docs/migrations-applied/`, bukan di sini.**

Alasannya ada di `docs/migrations-applied/README.md`: menaruh berkas baru di folder ini hanya
menambah yang akan dicoba dijalankan `db push` (yang sudah berbahaya), tanpa menyelesaikan
divergensi. **Tanpa pointer ini, siapa pun yang membuka folder ini akan menyimpulkan cermin tak
pernah dibuat lewat migrasi — lalu menulis ulang sesuatu yang sudah ada.**

DDL cermin + kanon telepon + stats ada lengkap di:
- `docs/migrations-applied/20260813091255_create_crm_customer_mirror.sql`
- `docs/migrations-applied/20260814040554_add_is_fitco_member_matched_to_crm_customer_mirror.sql`
- `docs/migrations-applied/20260814055353_crm_norm_phone_guard_empty_nsn.sql`
- `docs/migrations-applied/20260818041017_precompute_dashboard_stats_at_refresh.sql`

## Catatan divergensi yang lebih luas (utang teknis)

Tabel ledger di `README.md` utama & `docs/riwayat/LINIMASA.md` masih berhenti di migrasi **10**;
folder ini sudah memuat `20260812000000_create_crm_backfill_consent.sql` (migrasi 11), dan DB
memuat migrasi CRM **11–16**. Rekonsiliasi penuh (ledger ↔ repo, mis. `supabase migration
repair`) adalah tugas tersendiri dengan gate-nya sendiri — lihat `docs/migrations-applied/README.md`.
