# CLAUDE CODE PROMPT — Sprint 3D: Mendaratkan Apa yang Sudah Dibangun

> **Tujuan sprint ini: tidak ada layar baru. Menutup celah verifikasi yang sudah tiga sprint menganga, dan membuat dua sprint kode yang menumpuk bisa di-merge dengan risiko yang terukur.**
>
> Semua layar berikutnya (Segments, Exports, Campaigns, Templates, Messages) terkunci di consent register yang masih menunggu legal. Menambah lapisan ketiga di atas dua lapisan yang belum pernah dijalankan bukan kemajuan — itu menumpuk utang.
>
> **Apa yang berubah dari sprint-sprint sebelumnya, dan kenapa ini penting:** Sprint 3A **sudah live di produksi dan sudah dipakai orang.** `crm_audit_log` menunjukkan `tifany@20fit.id` membuka audience pool berkali-kali pada 11 Agustus 2026 (id 6–25, filter unit/segment/kota/revenue, `masked: false` sesuai peran `super_admin`). Regresi sekarang mengenai layar yang benar-benar dibuka orang, bukan layar hipotetis.
>
> **Yang TETAP ditahan:** migrasi 3 `crm_consent` (menunggu legal), pengisian `crm_*` (Fase 0 / RLS OFF), pengiriman pesan, ekspor, segment builder, alur approval, merge/unmerge.

---

## ATURAN PROSES

Sama seperti 3C, dan jangan dilewati:

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Laporkan ketiganya apa adanya di awal laporan. Status yang diharapkan per 11 Agustus 2026: `origin/main` di `4bac312` (Sprint 3A), branch kerja memuat `bf736b0` (3B) + `322377f` (3C) yang **belum** ter-merge. Kalau berbeda, **berhenti dan lapor**.

Catatan: repo sempat tidak bisa diakses anonim. Konfirmasi kamu bisa `fetch` dan `push` sebelum mulai, jangan sampai ketahuan di akhir.

---

## PRASYARAT

1. Bekerja di atas `322377f`. Baseline `npm test` hijau (146 test). Baseline merah → berhenti dan lapor.
2. Angka-angka di prompt ini diverifikasi 11 Agustus 2026 dan **akan bergeser** — `crm_audit_log` bertambah karena dipakai orang sungguhan. Verifikasi ulang sendiri; laporkan selisihnya, jangan sesuaikan diam-diam.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

Gate seperti biasa: **tulis → tunjukkan → jalankan → verifikasi.** Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

---

## TUGAS 1 — Ubah "tidak bisa saya verifikasi" jadi sesuatu yang tim bisa jalankan

Tiga sprint berturut-turut melaporkan hal yang sama: query `supabase-js` di `/api/quality`, `/api/dashboard`, `/api/audit`, dan `/api/audience/[id]` **belum pernah sekali pun dieksekusi**. Environment-mu memblokir host Supabase (CONNECT tunnel failed, 403). Itu kendala yang sah dan tidak akan hilang di sprint ini.

**Berhenti mencoba menjalankannya sendiri. Bangun alat supaya orang yang punya kredensial bisa menjalankannya dalam sepuluh menit.**

### 1a. Skrip verifikasi lapisan data

Tulis `scripts/verify-live.mjs`. Dijalankan dengan variabel Railway di `.env.local`:

- Panggil **fungsi lapisan baca yang sebenarnya** — `fetchAudience`, `fetchQualitySnapshot`, `fetchDashboardStats`, lapisan baca audit, dan lapisan baca detail profil. Bukan SQL tiruan. Titik yang belum terverifikasi adalah **konstruksi query PostgREST-nya**, jadi yang harus dieksekusi adalah kode itu sendiri.
- Bandingkan hasilnya dengan nilai yang diharapkan, cetak tabel LULUS/GAGAL, dan `exit(1)` bila ada yang gagal. Nilai acuan per 11 Agustus 2026 (ambil dari satu konstanta di atas file supaya mudah diperbarui):

  | Cek | Harapan |
  |---|---|
  | total `master_customer` | 82.253 |
  | `city` / `segment` / `ltv>0` / `ltv<0` terisi | 5.786 / 81.011 / 1.112 / 1 |
  | telepon tidak berawalan `62` | 31 |
  | duplikat / orphan / excluded | 15 / 32 / 6.361 |
  | `crm_profile_*` | 0 / 0 / 0 |
  | `source` | tepat 2 nilai: `20fit_data_import` (81.178), `live_txn_ingest` (1.075) |
  | filter audience: `unit=arena` | 664 |
  | filter audience: `unit=arena` + `revenue=none` | 12 |
  | filter audience: `city~jakarta` | 530 |

- **BACA SAJA. NOL EFEK SAMPING.** Skrip memanggil lapisan baca, **bukan** route handler — jadi ia tidak boleh menulis satu pun baris `crm_audit_log`. Buktikan itu: hitung baris audit sebelum dan sesudah, dan gagalkan skrip kalau angkanya berubah.
- **Jangan pernah cetak PII.** Angka, dan contoh kontak yang sudah ter-mask saja. Sebuah skrip verifikasi yang membuang telepon pelanggan ke terminal adalah kebocoran baru, bukan verifikasi.
- Skrip ini **tidak** dijalankan di CI dan **tidak** masuk `npm test` — ia butuh kredensial produksi. Jelaskan itu di header file.

### 1b. Daftar periksa manual untuk yang butuh sesi login

Tulis `docs/CEKLIS-verifikasi-live.md` — langkah yang harus dilakukan manusia dengan browser, karena RBAC dan audit hanya nyata di balik sesi:

1. Buka `/` — empat kartu dashboard terisi sesuai aturan `0` vs `—`
2. Buka `/quality` — angkanya cocok dengan skrip 1a, dan **nol** baris audit baru tertulis
3. Buka `/audience`, pakai satu filter — **satu** baris `list.viewed` bertambah
4. Klik satu nama → detail profil terbuka — **satu** baris `profile.viewed` bertambah, `target_id` terisi
5. Buka `/settings` — layar audit tampil, dan pembukaannya sendiri menulis `list.viewed` dengan `target_table='crm_audit_log'`
6. Untuk tiap langkah: SQL persis yang harus dijalankan untuk memastikan barisnya benar-benar mendarat

Sertakan satu langkah yang **tidak bisa** diverifikasi tanpa akun uji: `analyst` benar-benar melihat kontak ter-mask di UI. Tulis apa yang harus tim siapkan (satu akun Supabase Auth + satu baris `crm_user_role` peran `analyst`), dan tegaskan **kamu tidak boleh membuatnya sendiri** — itu memberi akses akun manusia di produksi.

---

## TUGAS 2 — Layar audit: default yang berguna, dan keputusan penjadwalan purge

Data nyata per 11 Agustus 2026: dari 25 baris `crm_audit_log`, **20 di antaranya `list.viewed` dari satu orang dalam satu sore.** Baris kepatuhan yang justru jadi alasan tabel ini ada — dua `role.granted` dan satu `retention.purge_executed` — hanya tiga. Rasio itu akan makin buruk begitu tim lain ikut memakai.

Layar audit yang membuka ke daftar tanpa filter akan menampilkan dinding baris seragam, dan hal yang paling perlu dilihat justru terkubur di bawahnya.

**Yang harus kamu kerjakan:**

- **Tampilan default berpihak pada kepatuhan.** Saat dibuka tanpa filter, prioritaskan kategori kepatuhan (`consent.*`, `suppression.*`, `role.*`, `profile.deleted`, `export.*`, `retention.*`). Baris operasional tetap bisa diakses satu klik — jangan disembunyikan, cukup jangan dijadikan yang pertama menyambut.
- **Tampilkan rasionya.** Berapa banyak baris kepatuhan vs operasional dalam rentang yang sedang dilihat. Angka itu sendiri adalah sinyal operasional: ia yang memberi tahu tim kapan purge perlu dijadwalkan.
- **Tulis `docs/KEPUTUSAN-penjadwalan-purge.md`.** Fungsi `crm_purge_audit_log` sudah ada sejak Sprint 3A dan **sengaja belum dijadwalkan**. Sekarang ada data pemakaian nyata, jadi keputusannya bisa diambil dengan angka. Isi memo: laju pertumbuhan yang terukur hari ini, kapan volume operasional mulai mengganggu, opsi penjadwalan beserta konsekuensinya, dan risiko menjadwalkan terlalu dini vs terlalu lambat.

**JANGAN jadwalkan purge-nya.** Tetap larangan. Memo ini bahan keputusan tim, bukan pelaksanaannya.

---

## TUGAS 3 — Nilai filter bebas-teks di `metadata` audit

Sprint 3C memeriksa 22 baris dan menemukan nol PII pelanggan di `metadata`. Benar — tapi jaminannya **perilaku, bukan struktur.**

Baris `id=18` menyimpan `filters.city = "tifany"`, yaitu apa pun yang diketik pengguna, tersimpan verbatim. Tidak ada yang mencegah seorang operator menempelkan nama atau nomor telepon pelanggan ke kotak filter kota besok — dan itu langsung mendarat di tabel **append-only** yang tidak bisa dihapus lewat aplikasi.

Peredamnya kebetulan sudah tepat: `list.viewed` masuk kelas operasional yang dipangkas setelah 90 hari. Tapi purge **belum dijadwalkan**, jadi hari ini peredam itu belum berjalan.

**Putuskan dan tegakkan satu dari dua ini** — argumentasikan pilihanmu di komentar, jangan diam-diam:

| Opsi | Untung | Rugi |
|---|---|---|
| Simpan nilainya, batasi panjang | Audit tetap menjawab "filter apa yang dipakai" | PII yang diketik operator tetap bisa masuk |
| Simpan hanya penanda "filter kota dipakai: ya" + panjangnya | Tidak mungkin bocor lewat jalur ini | Kehilangan konteks: dua pembacaan berbeda jadi tak terbedakan |

Apa pun pilihannya: batasi panjang nilai yang disimpan, tulis alasannya di `/api/audience`, dan **sebutkan di layar audit** bahwa nilai filter berasal dari ketikan pengguna sehingga pembaca tidak memperlakukannya sebagai data terkurasi.

Jangan sentuh baris yang sudah ada — append-only, dan tidak ada satu pun yang bermasalah hari ini.

---

## TUGAS 4 — Koreksi narasi `live_txn_ingest`

Sprint 3B menyuruh kartu dashboard diberi kerangka "impor satu kali, bukan feed hidup". **Instruksi itu tidak akurat**, dan koreksinya penting karena menyangkut apa yang tim simpulkan dari layar.

Terverifikasi 11 Agustus 2026:

- `20fit_data_import` — 81.178 baris
- `live_txn_ingest` — 1.075 baris, dan **seluruhnya mendarat dalam satu pekan** (pekan 27 Juli, berhenti 31 Juli)

Jadi ini **dua muatan batch**, bukan satu impor dan bukan feed berkelanjutan. Sumber bernama `live_txn_ingest` yang hanya pernah berjalan satu kali adalah label yang menyesatkan.

Akibatnya kartu "Profil terakhir bertambah: 31 Juli 2026" akan terbaca *"pipeline-nya telat 11 hari"*, padahal yang benar *"tidak pernah ada pipeline berkelanjutan"*. Dua kesimpulan itu memicu tindakan yang sangat berbeda: yang pertama menyuruh orang mencari pipeline yang rusak.

**Yang harus kamu kerjakan:** verifikasi ulang sebarannya sendiri, lalu perbaiki kalimat di kartu dashboard dan tambahkan temuan ini ke bagian temuan `/quality`. Jangan ganti nama `source` di database — itu data, bukan milik sprint ini.

---

## TUGAS 5 — Siapkan PR-nya, jangan merge

Branch ini membawa **dua sprint sekaligus** (3B + 3C) ke produksi yang sudah dipakai orang. Itu butuh deskripsi yang bisa dibaca peninjau dalam lima menit, bukan daftar commit.

Tulis `docs/PR-sprint-3b-3c.md` berisi:

1. Apa yang benar-benar ter-deploy, per layar, dan mana yang **berubah** vs mana yang **baru** — `/audience` berubah perilakunya (nama jadi bisa diklik), dan itu layar yang sudah dipakai orang
2. Apa yang **tidak** berubah: nol migrasi, nol perubahan skema, nol tulis ke data pelanggan
3. Daftar risiko jujur, dipimpin oleh yang terbesar: endpoint yang belum pernah dieksekusi terhadap Supabase
4. Rencana revert: commit mana, dan apa yang kembali ke keadaan semula
5. Prasyarat merge: TUGAS 1a dan 1b sudah dijalankan **oleh orang dengan kredensial**, dengan hasilnya dilampirkan

**JANGAN merge, jangan buka PR ke `main` tanpa izin eksplisit.** Push ke `main` memicu deploy Railway ke sistem yang sedang dipakai.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan merge atau push ke `main` | Deploy produksi ke sistem yang sedang dipakai orang |
| Jangan buat/ubah/hapus baris `crm_user_role` | Memberi atau mencabut akses akun manusia di produksi |
| Jangan `INSERT`/`UPDATE`/`DELETE` di `master_customer` atau `crm_*` | Read-only per desain; audit append-only |
| Jangan jadwalkan purge | Memo keputusan saja |
| Jangan buat migrasi, view, atau RPC baru; jangan `supabase db push` | Ledger diverge; migrasi 3 ditahan |
| Jangan buat aksi audit baru | Allowlist migrasi 8 memangkas per nama eksak |
| Jangan bangun layar baru | Semua yang tersisa terkunci di consent |
| Jangan cetak PII di skrip, log, atau laporan | Alat verifikasi tidak boleh jadi kebocoran baru |
| Jangan menyalakan RLS di tabel lama | Fase 0, milik tim |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu — sudah salah dua kali |

---

## LAPORAN PENUTUP

1. **Status remote** — keluaran `fetch` + tiga `git log`, apa adanya
2. **Alat verifikasi** — apa yang dicakup skrip, apa yang hanya bisa manusia, dan bukti skrip tidak menulis baris audit
3. **Layar audit** — default barunya, rasio kepatuhan vs operasional yang kamu ukur hari ini, dan ringkasan memo penjadwalan
4. **Nilai filter** — opsi yang kamu pilih dan alasannya
5. **`live_txn_ingest`** — sebaran yang kamu ukur sendiri, dan kalimat baru di kartu dashboard
6. **Berkas PR** — di mana, dan apa risiko teratas yang kamu tulis
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi** — sebut apa adanya, termasuk kalau blokir Supabase masih sama

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
