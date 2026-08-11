# Fakta Data — Terverifikasi ke Database

Semua angka di bawah **diukur langsung** ke proyek Supabase `cpvzwqptzcxnwzfzgrmt`,
bukan diperkirakan. Setiap blok bertanggal.

> **Jangan pakai estimasi perencana.** Daftar tabel di dashboard Supabase (dan tool
> `list_tables`) mengembalikan `pg_class.reltuples`, yaitu tebakan perencana yang bergeser
> sendiri. Untuk `staging_20fit_data`, estimasi memberi 87.966 lalu 87.226, sementara
> `count(*)` eksak = 88.536. Selalu `count(*)`.

---

## `master_customer` — 11 Agustus 2026

**Total: 82.253 baris.**

| Kolom | Terisi | % |
|---|---|---|
| `first_unit` | 82.253 | 100% |
| `full_name` | 82.238 | 99,98% |
| `email_normalized` | 81.637 | 99,25% |
| `phone_normalized` | 81.615 | 99,22% |
| `segment` | 81.011 | 98,49% |
| `city` | 5.786 | **7,03%** |
| `gender` | 0 | **0%** |
| `date_of_birth` | 0 | **0%** |
| `address` | 0 | **0%** |
| `notes` | 0 | **0%** |
| `tags` | 0 | **0%** |

Definisi "terisi" = `IS NOT NULL`. Diverifikasi 11 Agu: tidak ada nilai string kosong
di kolom-kolom ini, jadi NULL adalah keseluruhan ceritanya.

**Lifetime value**

| | Baris |
|---|---|
| `> 0` | 1.112 (1,35%) |
| `= 0` | 81.140 |
| `< 0` | **1** (−61.200.000) |
| `NULL` | 0 |

**Identifier & duplikat**

| | Baris |
|---|---|
| Punya telepon **atau** email | 82.253 (100%) |
| Telepon tidak berawalan `62` | 31 |
| Telepon berawalan `+` | **0** — panjang 10–15 |
| Email bukan huruf kecil | 0 |
| `is_potential_duplicate` | 15 |
| `is_merged` | 0 |
| Kohort `segment` NULL | 1.242 — rata-rata LTV **tertinggi** (segmentnya terbalik) |

**Sumber & waktu** — lihat T-08/T-09 di `TEMUAN.md`

| Sumber | Baris | `created_at` | `first_seen_at` |
|---|---|---|---|
| `20fit_data_import` | 81.178 | satu instan 2026-04-20 11:28 | semuanya 2026-04-20 |
| `live_txn_ingest` | 1.075 | satu instan 2026-07-31 12:27 | 5 Feb – 8 Agu, 162 hari |

`updated_at` = `created_at` untuk 99,12%. `last_activity_at` = `first_seen_at` untuk
99,62% (81.944 baris) — keduanya cap muat yang sama, bukan bukti aktivitas.
**14 baris** punya `first_seen_at` > `created_at`, selisih terbesar 7 hari 11 jam.

**Indeks yang ada** (menentukan desain pencarian Sprint 3J)

| Indeks | Bentuk | Konsekuensi |
|---|---|---|
| `idx_master_customer_name_trgm` | GIN trigram atas `full_name` | substring nama terindeks |
| `idx_master_customer_phone_unique` | btree UNIQUE atas `phone_normalized` | **hanya sama-persis** |
| `idx_master_customer_email_unique` | btree UNIQUE atas `email_normalized` | **hanya sama-persis** |
| `idx_master_customer_last_activity` | btree atas kolom terlarang | tak dipakai |

Tidak ada indeks atas `city` — filter kota adalah seq scan.

---

## Tabel terkait — 11 Agustus 2026

| Tabel | Baris | Catatan |
|---|---|---|
| `customer_orphan` | 32 | tak bisa dikaitkan ke satu profil master |
| `customer_excluded` | 6.361 | alasan pengecualian belum ditinjau ulang |
| `staging_20fit_data` | **88.536** | RLS **OFF** — lihat T-02 |
| `customer_engagement` | 90.419 | belum dipakai |

## Tabel `crm_*` — 11 Agustus 2026

| Tabel | Baris | RLS | Policy |
|---|---|---|---|
| `crm_user_role` | 2 | ON | 0 |
| `crm_audit_log` | **43** (11 Agu 09:05 UTC), bertambah | ON | 0 |
| `crm_consent` | 0 | ON | 0 |
| `crm_suppression` | 0 | ON | 0 |
| `crm_profile_demographic` | 0 | ON | 0 |
| `crm_profile_behavior` | 0 | ON | 0 |
| `crm_profile_scores` | 0 | ON | 0 |

`crm_consent`: 4 CHECK, UNIQUE `(customer_id, channel, purpose)`, FK ke `master_customer`
dengan `ON DELETE SET NULL` (`confdeltype='n'`, bukan cascade).

## Fungsi `crm_*` — setelah migrasi 10, 11 Agustus 2026

| Fungsi | `SECURITY DEFINER` | Return | `EXECUTE` |
|---|---|---|---|
| `crm_record_suppression` | ya | `jsonb` | `postgres`, `service_role` |
| `crm_lift_suppression` | ya | `jsonb` | `postgres`, `service_role` |
| `crm_purge_audit_log` | ya | `record` | `postgres`, `service_role` |
| `crm_audit_log_no_mutate` | tidak | **`trigger`** | terbuka — **inert**: PostgREST tak bisa mengekspos fungsi trigger sebagai RPC, dan ia `SECURITY INVOKER` |

**101** fungsi `SECURITY DEFINER` di luar `crm_*` masih anon-executable — T-03.

## Pemakaian nyata `crm_audit_log`

Pertumbuhan 10–11 Agustus: 20 → 22 → 25 → 27 → 32 → 33 → 35 → **43** (11 Agu 09:05 UTC).
Hampir seluruhnya `list.viewed` dari `tifany@20fit.id`, tiga aktor berbeda total (termasuk
`system:seed` dan `system:retention`). **Diperbarui sprint dokumentasi:** delapan baris
baru sejak berkas ini ditulis, termasuk `id=44–47` — pembukaan pertama layar audit
`/settings` (lihat baris "penting" di bawah).

Baris penting:

| id | Waktu (UTC) | Arti |
|---|---|---|
| 1 | 10 Agu 13:18 | `test.trigger_check` — artefak verifikasi Sprint 2B, sengaja dipertahankan |
| 2–3 | 11 Agu 03:46 | `role.granted` — seed dua `super_admin` |
| 4 | — | dihapus oleh uji purge Sprint 3A (sintetis) |
| 5 | 11 Agu 03:50 | `retention.purge_executed` — artefak verifikasi, sengaja dipertahankan |
| 18 | 11 Agu 05:38 | `filters.city = "tifany"` — bukti nilai filter tersimpan verbatim (T-13) |
| **32** | **11 Agu 07:30** | **`target_table='crm_consent'`, `view='consent_register'` — bukti Sprint 3F berjalan di produksi** |
| **44–47** | **11 Agu 09:04–09:05** | **`list.viewed`/`crm_audit_log` — pembukaan PERTAMA layar audit `/settings`, `tifany@20fit.id`. Bukti Sprint 3C `/settings` berjalan di produksi** |

**Diperbarui 11 Agu 09:05 UTC (sprint dokumentasi):**
- `profile.viewed` = **0** — masih benar; detail profil `/audience/[id]` belum pernah dibuka.
- `target_table='crm_audit_log'` = **4** (dulu 0) — `/settings` **kini terbukti jalan di
  produksi** (id 44–47). Berkas ini sebelumnya menulis 0; itu sudah bergerak.
- `search.performed` = **0** — Sprint 3J belum di-deploy (masih di branch).
