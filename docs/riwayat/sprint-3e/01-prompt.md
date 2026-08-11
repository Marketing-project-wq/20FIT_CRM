# CLAUDE CODE PROMPT — Sprint 3E: Satu Sumber Kebenaran, dan Waktu yang Jujur

> **Tujuan sprint ini: menutup satu daftar aturan yang sekarang hidup di tiga tempat, dan menghentikan kolom waktu yang tidak bermakna dipakai seolah bermakna.**
>
> Masih tidak ada layar baru — semua yang tersisa terkunci di consent register. Sprint ini membayar dua utang yang, kalau dibiarkan, akan meracuni Fase 3 (Segments) sejak hari pertama: segmentasi hampir selalu berbasis waktu, dan kolom waktu di sistem ini sebagian besar palsu.
>
> **Yang TETAP ditahan:** migrasi 3 `crm_consent` (menunggu legal), pengisian `crm_*` (Fase 0 / RLS OFF), pengiriman pesan, ekspor, segment builder, alur approval, merge/unmerge.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Laporkan ketiganya apa adanya di awal. Harapan per 11 Agustus 2026: `origin/main` di `4bac312` (Sprint 3A, live dan dipakai orang); branch kerja memuat `bf736b0` (3B), `322377f` (3C), `68dd66f` (3D), semuanya belum ter-merge. Berbeda → **berhenti dan lapor**.

**Koreksi untuk prompt 3D, dari saya:** prompt itu menyebut `live_txn_ingest` "mendarat dalam satu pekan (27–31 Juli)". Laporanmu benar dan prompt saya yang keliru — `created_at`-nya satu instan (31 Juli 12:27), dan angka "sepekan" itu artefak dari `date_trunc('week')` yang saya pakai. Ukuranmu yang dipakai seterusnya.

---

## PRASYARAT

1. Bekerja di atas `68dd66f`. Baseline `npm test` hijau (146 test). Merah → berhenti dan lapor.
2. Angka acuan di bawah diverifikasi 11 Agustus 2026 dan akan bergeser karena sistem dipakai orang. Verifikasi ulang; laporkan selisih, jangan sesuaikan diam-diam.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

Gate seperti biasa: **tulis → tunjukkan → jalankan → verifikasi.** Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

---

## TUGAS 1 — Satu daftar retensi, bukan tiga

Daftar kategori audit sekarang hidup di **tiga tempat berbeda**, ditulis ulang tiap kali:

| Tempat | Bentuk | Dibuat di |
|---|---|---|
| `crm_purge_audit_log` (migrasi 8) | SQL: `action = 'list.viewed' or action like 'search.%' …` | Sprint 3A |
| `classifyAction` | TypeScript, untuk badge kelas retensi di layar audit | Sprint 3C |
| Filter kategori `/api/audit` | Rantai PostgREST `.or()` | Sprint 3D |

Ketiganya harus selalu sama. Tidak ada satu pun mekanisme yang memaksanya. Kalau mereka berbeda satu entri saja, gejalanya adalah **layar audit memberi label yang tidak sesuai dengan apa yang purge benar-benar hapus** — pembaca yakin sebuah baris dilindungi permanen, lalu baris itu hilang. Itu kegagalan diam-diam persis seperti kanon telepon di Sprint 3B, dan lebih buruk konsekuensinya karena menyangkut bukti kepatuhan.

**Yang harus kamu kerjakan:**

- Jadikan satu modul TypeScript sebagai sumber tunggal untuk daftar itu — kategori kepatuhan, kategori operasional, dan aturan pencocokannya (eksak vs prefiks). `classifyAction` dan filter `/api/audit` sama-sama diturunkan dari sana; nol daftar yang diketik ulang.
- **SQL tidak bisa mengimpor TypeScript**, jadi migrasi 8 tetap jadi salinan. Yang bisa kamu lakukan adalah membuat perbedaan itu **gagal keras**: tulis test yang membaca file migrasi `supabase/migrations/20260811090000_create_crm_purge_audit_log.sql`, mengekstrak daftar aksinya, dan membandingkannya dengan modul TypeScript. Kalau tidak identik, test gagal dengan pesan yang menyebut sisi mana yang menyimpang.
- Test itu harus **gagal untuk alasan yang benar**. Buktikan: ubah sementara satu entri, tunjukkan pesan gagalnya, kembalikan, tunjukkan hijau lagi. Lampirkan keduanya di laporan — sama seperti bukti pagar Tailwind di 3B.
- **JANGAN ubah migrasi 8.** Ia sudah diterapkan ke database; file-nya sekarang catatan sejarah. Yang berubah adalah sisi TypeScript-nya, supaya cocok dengan yang sudah berjalan.

---

## TUGAS 2 — Kolom waktu: larang yang tidak bermakna

Sprint 2 melarang `last_activity_at` karena 99,62% nilainya sama dengan `first_seen_at`. Larangan itu benar, tapi **alasannya ternyata bukan yang dikira** — dan `first_seen_at`, yang dijadikan pembanding, ternyata sama tidak bermaknanya.

Terverifikasi 11 Agustus 2026, **verifikasi ulang sendiri sebelum menulis kode**:

| Sumber | Baris | `created_at` | `first_seen_at` |
|---|---|---|---|
| `20fit_data_import` | 81.178 | **satu instan**: 2026-04-20 11:28 | **semuanya 2026-04-20** — satu hari, nol variasi |
| `live_txn_ingest` | 1.075 | **satu instan**: 2026-07-31 12:27 | 5 Feb – 8 Agu 2026, **162 hari berbeda** |

Artinya:

1. **`first_seen_at` adalah cap waktu muatan untuk 98,7% pool.** Ia hanya membawa informasi nyata pada 1.075 baris `live_txn_ingest`.
2. Temuan Sprint 2 jadi tautologi: `last_activity_at` sama dengan `first_seen_at` karena **keduanya cap muatan yang sama**, bukan karena aktivitas tidak terekam.
3. `created_at` adalah waktu muat, bukan waktu profil dibuat. Metrik "profil baru dalam N hari" tidak akan pernah bermakna sampai ada ingestion berkelanjutan.

**Yang harus kamu kerjakan:**

- Perlakukan `first_seen_at` seperti `last_activity_at` diperlakukan sejak Sprint 2: **jangan tampilkan sebagai "pertama terlihat"** di layar mana pun, kecuali disertai keterangan sumbernya. Kalau kamu memutuskan tetap menampilkannya pada baris `live_txn_ingest` (di sana ia nyata), maka pembedaannya harus eksplisit di UI — bukan satu kolom yang artinya berbeda diam-diam tergantung barisnya.
- Tambahkan temuan ini ke bagian temuan `/quality`, dengan angkanya.
- **Tulis `docs/KOLOM-WAKTU.md`** — satu tabel: setiap kolom waktu di `master_customer`, apa yang sebenarnya diukur, boleh dipakai untuk apa, dan **dilarang untuk apa**. Ini deliverable terpenting sprint ini, karena Fase 3 (Segments) akan dibangun di atas kolom-kolom ini dan segmentasi hampir selalu berbasis waktu. Sertakan kalimat eksplisit: segmentasi berbasis recency **tidak mungkin jujur** dengan data hari ini.
- Perbarui komentar di `crm_profile_behavior` — eh, **jangan**: itu komentar di database, dan mengubahnya adalah DDL. Cukup catat di `docs/KOLOM-WAKTU.md` bahwa komentar tabel itu perlu diperluas untuk ikut menyebut `first_seen_at`, dan tandai sebagai usulan untuk migrasi berikutnya.

---

## TUGAS 3 — Anomali waktu di `/quality`

Panel "Anomali nilai" di `/quality` saat ini memuat satu entri (lifetime value negatif). Tambahkan pasangannya di sisi waktu.

Terverifikasi 11 Agustus 2026: **14 baris punya `first_seen_at` LEBIH BARU dari `created_at`**, dengan selisih terbesar **7 hari 11 jam**. Sebuah baris "pertama terlihat" setelah barisnya sendiri dibuat adalah kontradiksi logis, bukan sekadar data kotor.

Sama seperti LTV negatif, yang membuatnya layak diangkat adalah **ia tidak terlihat di mana pun**: tidak ada filter di layar mana pun yang akan memunculkannya.

Verifikasi ulang angkanya sendiri. Kalau PostgREST tidak bisa mengungkapkannya (ia tidak punya perbandingan antar-kolom — pelajaran yang sama dari Sprint 3B), masukkan ke `VERIFIED_ARTIFACTS` dengan tanggal verifikasi, **jangan** dipaksakan jadi filter yang mendekati.

---

## TUGAS 4 — Utang test dari Sprint 3D

Sprint 3D naik **0 test** (146 → 146), dengan alasan "logika audit baru bersifat server-only sehingga tak bisa di-unit-test". Itu benar untuk lapisan query, tapi tidak untuk semua yang 3D tambahkan.

Yang ditambahkan 3D dan **murni** — tanpa I/O, bisa diuji hari ini:

- Pembatas panjang nilai filter kota (60 karakter) dan perekaman panjang aslinya. Kasus batas: tepat 60, 61, string kosong, unicode multi-byte.
- Predikat kategori kepatuhan vs operasional (dan setelah TUGAS 1, ia jadi satu-satunya sumber — makin wajib diuji).
- Perhitungan rasio "Kepatuhan X · Operasional Y · Lain Z" pada himpunan baris yang diberikan.

**Kerjakan:** pisahkan logika murni itu dari modul `server-only` bila perlu (pola `audience-constants.ts` dan `quality-types.ts` sudah ada — ikuti), lalu tulis testnya. Aturan yang ditegakkan sprint ini dan seterusnya: **kalau sebuah aturan bisa dinyatakan sebagai fungsi murni, ia harus punya test.** "Server-only" adalah alasan sah untuk lapisan query, bukan untuk aturan.

---

## TUGAS 5 — Perbarui berkas PR

`docs/PR-sprint-3b-3c.md` sekarang mencakup 3B+3C+3D. Perbarui agar mencakup 3E dan ganti namanya supaya tidak menyesatkan.

Yang harus berubah isinya:

- Tambahkan perubahan 3E, tandai mana yang **mengubah tampilan** (`/quality`, dan `first_seen_at` di detail profil) versus mana yang hanya menambah pagar
- Naikkan satu risiko baru ke daftar: sprint ini mengubah `/quality` dan detail profil, dua layar yang **masih** belum pernah dieksekusi terhadap Supabase
- Prasyarat merge tidak berubah: `scripts/verify-live.mjs` + `docs/CEKLIS-verifikasi-live.md` dijalankan **oleh orang dengan kredensial**, hasilnya dilampirkan

**JANGAN merge, jangan buka PR ke `main` tanpa izin eksplisit.**

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan merge atau push ke `main` | Deploy produksi ke sistem yang sedang dipakai orang |
| Jangan ubah migrasi 8 atau migrasi mana pun yang sudah diterapkan | File-nya catatan sejarah; yang berubah sisi TypeScript-nya |
| Jangan buat migrasi, view, atau RPC baru; jangan `supabase db push` | Ledger diverge; migrasi 3 ditahan |
| Jangan ubah komentar tabel di database | Itu DDL — usulkan di dokumen, jangan jalankan |
| Jangan `INSERT`/`UPDATE`/`DELETE` di `master_customer`, `crm_*`, atau `crm_user_role` | Read-only per desain; `crm_user_role` mengendalikan akses manusia |
| Jangan perbaiki data anomali (LTV negatif, 14 baris waktu terbalik) | Remediasi data milik tim, bukan sprint ini — tugasmu membuatnya terlihat |
| Jangan buat aksi audit baru | Allowlist migrasi 8 memangkas per nama eksak |
| Jangan jadwalkan purge | Memo keputusan sudah ada; pelaksanaannya keputusan tim |
| Jangan bangun layar baru | Semua yang tersisa terkunci di consent |
| Jangan cetak PII di skrip, log, atau laporan | Alat verifikasi tidak boleh jadi kebocoran baru |
| Jangan menyalakan RLS di tabel lama | Fase 0, milik tim |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu — sudah salah dua kali |

---

## LAPORAN PENUTUP

1. **Status remote** — keluaran `fetch` + tiga `git log`, apa adanya
2. **Daftar retensi tunggal** — di mana sumbernya sekarang, dan **bukti test gagal** saat kamu menyimpangkan satu entri (pesan gagalnya, lalu hijau setelah dikembalikan)
3. **Kolom waktu** — angka yang kamu ukur sendiri per sumber, apa yang berubah di UI, dan ringkasan `docs/KOLOM-WAKTU.md`
4. **Anomali waktu** — jumlah baris yang kamu ukur, dan apakah ia live atau masuk `VERIFIED_ARTIFACTS` (beserta alasannya)
5. **Utang test** — jumlah test sebelum dan sesudah, dan apa yang masih sengaja tidak diuji beserta alasannya
6. **Berkas PR** — nama barunya dan risiko yang kamu tambahkan
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi** — sebut apa adanya

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, `NODE_ENV=production npm run build` lulus.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
