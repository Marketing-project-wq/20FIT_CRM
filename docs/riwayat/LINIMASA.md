# Linimasa

Semua tanggal 2026. Status terakhir diperbarui: **11 Agustus 2026**.

## Sprint

| Sprint | Commit | Di `main`? | Isi | Test |
|---|---|---|---|---|
| 1 — Fondasi | `0d3a66a`, `c0809ba` | ya | Bootstrap Next.js 14, design system 20FIT, Supabase Auth, app shell, `/health` | — |
| 2 / 2B — Skema | `33c5dc1` … `c07d537` | ya (PR #2 → `d92a92e`) | Enam migrasi `crm_*` diterapkan, RBAC cetakan pertama, normalizer kanonik | 126 |
| 3A — Peluncuran internal | `f9d9136` | ya (PR #3 → `4bac312`) | Matriks RBAC PRD 17.2, seed dua `super_admin`, migrasi 8 (retensi), audience pool baca-saja, nav ter-filter | 126 |
| 3B — Kepercayaan angka | `bf736b0` | ya (PR #4) | Kanon telepon diperbaiki, layar `/quality`, pagar Tailwind, dashboard jujur, memo risiko masking | 141 |
| 3C — Akuntabilitas | `322377f` | ya (PR #4) | Satu aturan audit, layar audit `/settings`, detail profil + `profile.viewed` | 146 |
| 3D — Alat verifikasi | `68dd66f` | ya (PR #4) | `verify-live.mjs`, ceklis manual, default audit berpihak kepatuhan, cap nilai filter, koreksi `live_txn_ingest` | 146 |
| 3E — Sumber tunggal | `9c44c00` | ya (PR #4) | `retention-policy.ts` sebagai sumber tunggal + test paritas ke migrasi 8, `KOLOM-WAKTU.md`, anomali waktu, utang test dibayar | 170 |
| 3F — Consent | `e25a317` | ya (PR #4) | **Migrasi 3 `crm_consent` dijalankan** (legal mengizinkan), layar `/consent` baca-saja, "Bisa dihubungi" jadi terukur | 179 |
| — | **PR #4 → `eff733c`** | — | 3B–3F mendarat di `main`, deploy Railway | — |
| 3G — Pasca-merge | `9a7b296`, `ef0ea89` | **ya (PR #5)** | Tinjauan diff lima sprint, `guard.ts` + `hasAnyRole` dihapus (kode mati), latihan revert, ringkasan keputusan | 179 |
| 3H — Jalur tulis pertama | `c63280a`, `15cb3f7`, `a0035d9` | **ya (PR #5)** | **Migrasi 9**: `crm_record_suppression` + `crm_lift_suppression` (atomik K-3), jalur tulis suppression di UI | 194 |
| — | **PR #5 → `3ac62b1`** | — | 3G–3H mendarat di `main`, deploy Railway | — |
| 3I — Pintu RPC | `7760e15` → di-rebase `69e59ca` | **belum** | **Migrasi 10**: cabut `EXECUTE` `crm_purge_audit_log` dari `anon`, pagar EXECUTE, ledger diluruskan | 202 |
| 3J — Pencarian | `6504645` | **belum** | Pencarian profil (nama trigram; telepon/email sama-persis ternormalisasi), `search.performed`, jalur cari→profil→suppression | 219 |

**Diperbarui 11 Agu 2026 (sprint dokumentasi):** PR #5 telah men-merge 3G + 3H ke `main`
(`3ac62b1`) — file ini sebelumnya menandai keduanya "belum". Commit 3I `7760e15`
**di-rebase** ke `69e59ca` di atas base baru saat 3J dikerjakan; `7760e15` masih ada
sebagai objek git tapi tak lagi di branch. **Dua commit belum ter-merge** (3I `69e59ca` +
3J `6504645`). Aplikasi live kini membawa kode **sampai 3H** (PR #5). Migrasi 9 dan 10
**sudah berlaku di database** terlepas dari merge — perbaikan keamanan migrasi 10 tidak
menunggu deploy.

## Ledger migrasi

Nama berkas repo tidak pernah cocok dengan versi ledger karena semua dijalankan lewat
`apply_migration` (satu per satu, ditinjau), yang mencap versinya sendiri.
**`supabase db push` tidak boleh dijalankan** — CLI akan menganggap seluruh berkas repo
belum diterapkan dan menjalankan ulang semuanya.

| # | Berkas repo | Versi ledger | Kapan dijalankan |
|---|---|---|---|
| 1 | `…074534_create_crm_user_role` | `20260810125856` | Sprint 2B |
| 2 | `…074535_create_crm_audit_log` | `20260810131751` | Sprint 2B |
| 3 | `…074536_create_crm_consent` | `20260811072232` | **Sprint 3F** (ditahan sejak 2B, menunggu legal) |
| 4 | `…074537_create_crm_suppression` | `20260810132715` | Sprint 2B |
| 5 | `…074538_create_crm_profile_demographic` | `20260810133334` | Sprint 2B |
| 6 | `…074539_create_crm_profile_behavior` | `20260810133751` | Sprint 2B |
| 7 | `…074540_create_crm_profile_scores` | `20260810134736` | Sprint 2B |
| 8 | `…090000_create_crm_purge_audit_log` | `20260811034942` | Sprint 3A |
| 9 | `…100000_create_crm_record_suppression` | `20260811081711` **dan** `20260811081920` | Sprint 3H — **dua entri**, apply ganda untuk menutup grant `anon` |
| 10 | `…110000_lock_crm_purge_audit_log_execute` | `20260811085420` | Sprint 3I |

**10 berkas repo → 11 entri ledger `crm`.** Selisihnya adalah apply ganda migrasi 9.

## Layar

| Rute | Status | Terbukti jalan di produksi? |
|---|---|---|
| `/` dashboard | live (3F) | tidak bisa dibuktikan lewat audit — sengaja nol audit |
| `/audience` | live | **ya** — 30+ baris `list.viewed` |
| `/audience/[id]` detail profil | live (3C) | **belum** — `profile.viewed` masih 0 (per 11 Agu 09:05 UTC) |
| `/quality` | live (3B) | tidak bisa dibuktikan lewat audit — sengaja nol audit |
| `/settings` audit | live (3C) | **ya** (baru) — 4 baris `list.viewed`/`crm_audit_log`, `id=44–47`, 11 Agu 09:04–09:05 UTC, `tifany@20fit.id`. Berkas ini sebelumnya menandai "belum" |
| `/consent` | live (3F) | **ya** — baris audit `id=32`, 11 Agu 07:30:25 UTC |
| `/segments`, `/workflows`, `/campaigns`, `/templates`, `/messages`, `/exports` | `ComingSoon` | — |

> Nol baris audit dari `/` dan `/quality` adalah perilaku yang **benar** (aturan Sprint 3E:
> agregat tanpa parameter pengguna tidak diaudit). Itu **bukan** bukti keduanya berjalan.
> Satu-satunya bukti untuk keduanya adalah log Railway atau mata orang.

---

## 24 Agu 2026 — separuh "menghubungi" terbangun (kode), belum satu jalur pun dilalui

5 migrasi diterapkan (`crm_message_template`, `crm_message_log`,
`crm_purge_audit_log_add_campaign_compliance`, `crm_segment`, `crm_campaign_run`). **Lima
tabel menunggu baris pertamanya** — semua 0 baris: `crm_message_log`, `crm_segment`,
`crm_campaign_run`, `crm_suppression`, audit `campaign.%`. Jalur kirim + webhook Mailtrap +
monitor bounce (belum aktif) + template + unsubscribe semuanya dibangun & teruji di sisi kode;
**tak ada yang pernah dijalankan** karena kirim diblokir rotasi token.

- **Reset kata sandi TERBUKTI ujung-ke-ujung di produksi** (fitur pertama yang benar-benar dipakai).
- **Pagar terjemahan** (`untranslated-scan`) dipasang; menangkap layar `search` yang tayang dengan
  blok Indonesia hardcode padahal sudah di `BILINGUAL_SCREENS`.
- **Detail profil diterjemahkan** (5B-T2); `profile` di-flip ke `BILINGUAL_SCREENS`. Hanya
  `/settings/diagnostik` yang masih `PENDING`.
- Ikhtisar penuh + yang belum dikerjakan: `RANGKUMAN-24agu.md`.
