# Kolom waktu di `master_customer` — apa yang nyata, apa yang palsu

> **Deliverable kunci Sprint 3E.** Fase 3 (Segments) akan dibangun di atas kolom-kolom
> ini, dan segmentasi hampir selalu berbasis waktu. Sebagian besar kolom waktu di sistem
> ini **bukan** yang namanya klaim. Baca ini sebelum memakai kolom waktu mana pun untuk
> segmentasi. Semua angka diverifikasi ke database **11 Agustus 2026**.

## Kesimpulan di depan

**Segmentasi berbasis recency TIDAK MUNGKIN jujur dengan data hari ini.** Tidak ada satu
kolom pun di `master_customer` yang membawa “kapan pelanggan terakhir aktif” untuk
seluruh pool. Kolom yang terlihat seperti itu (`last_activity_at`, `first_seen_at`)
sebenarnya cap waktu muat batch untuk 98–99% baris. Membangun segmen “tidak aktif 90
hari” di atasnya akan menyegmentasi **tanggal impor**, bukan perilaku.

## Tabel kolom waktu

| Kolom | Apa yang SEBENARNYA diukur | Boleh dipakai untuk | DILARANG dipakai untuk |
|---|---|---|---|
| `created_at` | **Waktu muat batch.** Dua nilai saja, satu instan per sumber: `20fit_data_import` semua 2026-04-20 11:28; `live_txn_ingest` semua 2026-07-31 12:27. | Menandai muatan mana sebuah baris berasal; audit teknis proses muat. | “Profil baru dalam N hari”, tren pertumbuhan, recency apa pun. Metrik “profil baru” tak akan bermakna sampai ada ingestion berkelanjutan. |
| `first_seen_at` | **Bergantung sumber.** `20fit_data_import` (81.178 baris, 98,69%): = cap muat (2026-04-20), satu hari, nol variasi. `live_txn_ingest` (1.075 baris, 1,31%): tanggal transaksi nyata, 162 hari berbeda (5 Feb–8 Agu 2026). | Recency **hanya** pada baris `live_txn_ingest`, dan tetap dengan hati-hati. | “Pertama terlihat” untuk seluruh pool; segmentasi recency global. UI wajib menyertakan keterangan sumber bila menampilkannya (sudah ditegakkan di detail profil). |
| `last_activity_at` | **Nyaris identik dengan `first_seen_at`:** 81.944 dari 82.253 (99,62%) sama persis. Terisi 100%, tapi tak ada feed aktivitas yang mengisinya — ia mewarisi cap muat. | — (tidak ada penggunaan yang jujur). | “Terakhir aktif”, recency, churn, reaktivasi. **Dilarang ditampilkan sejak Sprint 2**, aturan tak berubah. |
| `updated_at` | **Cap muat untuk 99,12%:** 81.530 baris punya `updated_at = created_at`; hanya 4 nilai distinct di seluruh tabel; ~723 baris pernah disentuh lagi pasca-muat. | Menandai baris yang pernah diubah setelah muat (langka). | Aktivitas pelanggan, recency. |
| `date_of_birth` | **0% terisi.** | — | Kampanye ulang tahun, segmentasi usia — belum ada datanya sama sekali (`—`, bukan `0`). |

## Kenapa temuan Sprint 2 sebenarnya tautologi

Sprint 2 melarang `last_activity_at` karena “99,62% sama dengan `first_seen_at`”, dengan
asumsi `first_seen_at` adalah pembanding yang bermakna. Ternyata **`first_seen_at`
sendiri adalah cap muat** untuk 98,69% baris. Jadi keduanya sama bukan karena aktivitas
tidak terekam — melainkan karena **keduanya cap muat batch yang sama**. Larangannya tetap
benar; alasannya yang perlu diperbaiki, dan `first_seen_at` layak dapat perlakuan yang
sama.

## Anomali terkait (lihat juga `/quality`)

**14 baris punya `first_seen_at` lebih baru dari `created_at`** (selisih terbesar 7 hari
11 jam), semuanya `live_txn_ingest` — “pertama terlihat” setelah barisnya dibuat, sebuah
kontradiksi logis. Tidak muncul di filter mana pun (PostgREST tak punya perbandingan
antar-kolom), jadi tercatat di `VERIFIED_ARTIFACTS` `/quality`, bukan sebagai filter.

## Usulan untuk migrasi BERIKUTNYA (bukan sekarang — jangan jalankan DDL)

Komentar tabel `crm_profile_behavior` saat ini menyebut `master_customer.last_activity_at`
dan `customer_engagement.last_seen_at` sebagai sumber terlarang. **Usulan:** perluas
komentar itu agar ikut menyebut `first_seen_at` (dan `created_at`/`updated_at`) sebagai
cap muat, bukan sinyal perilaku — supaya larangan hidup di dekat kolomnya, bukan hanya di
dokumen ini. Ini **DDL** (mengubah komentar tabel), jadi milik migrasi tim berikutnya
yang ditinjau, bukan sprint ini. Dicatat di sini sebagai usulan.

## Untuk Fase 3 (Segments)

- Segmen berbasis **recency / “terakhir aktif” / “tidak aktif N hari”**: **tidak bisa**
  dibangun jujur sampai ada ingestion berkelanjutan yang mengisi kolom aktivitas nyata.
- Segmen berbasis **muatan / sumber** (`source`, muatan 20 Apr vs 31 Jul): boleh, tapi
  sebut apa adanya (“diimpor pada …”), jangan berpura-pura itu recency.
- Segmen berbasis **transaksi** hanya mungkin untuk 1.075 baris `live_txn_ingest`, dan
  itu bukan basis yang cukup untuk kampanye seluruh pool.
