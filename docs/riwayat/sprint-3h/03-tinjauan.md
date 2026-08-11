# Tinjauan independen — Sprint 3H

> Diisi oleh sesi yang mengerjakan sprint ini (dokumentasi lintas-sprint, 11 Agu 2026).
> Pengetahuan langsung, bukan rekonstruksi.

## Bukti atomik K-3 — dijalankan, bukan diklaim
Semua probe di dalam transaksi yang **di-ROLLBACK**, jadi nol residu di produksi
(`crm_suppression` tetap 0 baris, audit tak bertambah):
- **Happy path:** satu panggilan `crm_record_suppression` → satu baris suppression **dan**
  satu baris audit tertaut lewat `target_id`. Terverifikasi 1/1.
- **Idempoten:** dua panggilan identik pada baris aktif → panggilan kedua `noop`, audit
  **tidak** bertambah (1 baris untuk 2 panggilan).
- **Gagal di tengah (inti K-3):** trigger sementara dipasang untuk menggagalkan INSERT
  audit; panggilan fungsi gagal, lalu `leftover_suppression_rows = 0` — INSERT suppression
  **ikut rollback**. Tidak ada baris separuh jadi. Trigger + fungsi temp dibuat di dalam
  transaksi yang sama-sama di-rollback, jadi tak ada objek tertinggal.
- **Jaring pengaman:** telepon `+…`/berawalan 0, email huruf besar/tanpa `@`, `reason_code`
  asing, `lifted_reason` kosong — enam kasus, semua ditolak.

## Yang ditemukan saat itu, diperbaiki dalam sprint
- **Apply pertama migrasi 9 meninggalkan grant `anon`/`authenticated` terbuka.** `revoke …
  from public` tak mencabut grant peran eksplisit yang Supabase beri otomatis. Dikoreksi
  dengan apply kedua (`revoke … from public, anon, authenticated`) → dua entri ledger
  (`20260811081711` + `20260811081920`). Inilah benih T-01/K-15 di sprint berikutnya.

## Yang tidak bisa diverifikasi
- Jalur tulis end-to-end lewat aplikasi (route → RPC di balik sesi login): sandbox
  mem-block Supabase. Atomik dibuktikan di level DB (probe rollback), bukan lewat UI.
- Baris suppression pertama **sengaja tidak ditulis** — baris uji tak bisa dihapus dan
  akan mencemari catatan hukum. Verifikasi produksi diserahkan ke sesi login nyata.

## Diperiksa ulang 11 Agu (sprint dokumentasi)
- 3H (`c63280a`, `15cb3f7`, `a0035d9`) **kini di `main`** lewat PR #5. `crm_suppression`
  tetap **0 baris** — jalur tulisnya live tapi belum terpakai (butuh pencarian 3J).
