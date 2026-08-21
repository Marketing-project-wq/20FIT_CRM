# CLAUDE CODE PROMPT — Sprint 3O: Paparan Data Sensitif — Ukur, Angkat, lalu Daratkan

> **Temuan poin 5 laporan 3N adalah yang paling berat sepanjang proyek ini, dan ia terkubur di poin 5.**
>
> Diverifikasi ulang 11 Agustus 2026:
>
> ```
> cf_hyrox_participants   relrowsecurity = false
> 1.030 dari 1.038 baris memuat NIK
> ditambah: tgl_lahir, gol_darah, kontak_darurat, no_kontak_darurat
> ```
>
> **NIK adalah nomor identitas kependudukan.** Siapa pun yang memegang anon key bisa
> menariknya beserta tanggal lahir, golongan darah, dan nomor kontak darurat — tanpa login.
> Ini kelas yang berbeda dari `staging_20fit_data` (T-02, nama/email/telepon): di bawah
> UU 27/2022 — undang-undang yang jadi rujukan desain consent proyek ini — NIK dan data
> kesehatan masuk kategori yang penanganannya paling ketat.
>
> **Yang benar dari 3N:** `customer_engagement` sendiri **RLS ON**, jadi jalur baca CRM
> yang baru dibangun sudah benar. Masalahnya ada di tabel sumber milik tim lain.
>
> **Batasnya tidak berubah: jangan menyalakan RLS, jangan menulis policy, jangan menyentuh
> tabel itu.** Fase 0 milik tim pemilik data. Yang bisa dan harus dilakukan sprint ini
> adalah **mengukurnya dengan tepat dan mengangkatnya sedemikian rupa sehingga tidak bisa
> lagi terkubur di poin 5.**

---

## KOREKSI ANGKA — verifikasi ulang sendiri

Laporan 3N memperbaiki catatan saya, dan **koreksinya benar**. Untuk arsip:

| | |
|---|---|
| `last_seen_at = first_seen_at` | **89.974** (99,51%) — definisi yang tepat |
| `last_seen_at::date = 2026-04-20` | 89.054 — yang saya pakai; selisih **922** baris ber-cap-muat di tanggal lain |
| Aktivitas nyata | **445** total = 444 (`Transaksi Clinic` 274 + `Transaksi Arena` 170) + 1 bertanggal masa depan |
| `rc_participant_photos` | **0 baris** — saya keliru menggabungkannya dengan `rc_team_members` (1.545) |

Satu angka perlu dicek ulang: laporan menyebut clinic **1.157** baris / 1.014 distinct;
pengukuran ulang memberi **1.163** baris / 1.014 distinct. Distinct-nya cocok. Periksa
apakah selisih enam baris itu karena data bertambah atau karena filternya berbeda, dan
laporkan mana yang benar.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `36a2291`; branch `354a4f0` membawa **empat commit belum
ter-merge** (3K, 3L, 3M, 3N). Berbeda → **berhenti dan lapor**.

**Nol perubahan skema. Nol perubahan pada tabel tim lain.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Ukur paparannya, seluruhnya

Sapu **seluruh skema `public`** dan hasilkan satu inventaris: tabel mana yang RLS OFF
**dan** memuat data pribadi sensitif. Tanda yang dicari pada nama kolom dan tipe:

- Identitas kependudukan — `nik`, `ktp`, `passport`, `no_identitas`
- Kesehatan — diagnosa, ICD, keluhan, hasil skrining, postur, golongan darah, MCU
- Tanggal lahir dan usia
- Kontak darurat
- Kredensial dan kunci — `api_key`, `token`, `secret`, `otp`

Untuk tiap tabel: nama, status RLS, jumlah baris, **kolom sensitif mana yang ada**, dan
berapa baris yang benar-benar terisi pada kolom itu.

**HANYA hitungan. Nol nilai contoh.** Jangan pernah `SELECT` isi kolom sensitif, jangan
menaruhnya di laporan, jangan menaruhnya di berkas. Sebuah inventaris yang membocorkan
apa yang sedang diinventarisasi adalah pelanggaran kedua, bukan dokumentasi.

Bandingkan dengan angka yang sudah ada: 101 fungsi `SECURITY DEFINER` anon-executable
(T-03) dan `staging_20fit_data` 88.536 baris RLS OFF (T-02). Angka-angka itu bergerak naik
tiap tim lain men-deploy — ukur ulang, jangan kutip.

---

## TUGAS 2 — Satu berkas eskalasi, ditulis untuk pemilik proyek

`docs/ESKALASI-paparan-data-sensitif.md`. Ini bukan catatan teknis untuk sesama engineer;
ini yang akan dibaca orang yang memutuskan. Maksimum dua halaman.

Isinya:

1. **Apa yang terpapar, diurutkan berdasarkan keparahan** — NIK dan data kesehatan di
   atas, nama/telepon/email di bawah. Sertakan jumlah orang, bukan hanya jumlah baris:
   "1.030 orang" berbeda bobotnya dari "1.030 baris".
2. **Bagaimana terpaparnya** — anon key + PostgREST, tanpa login. Sebutkan bahwa anon key
   ada di setiap bundel JavaScript yang dikirim ke browser, jadi "hanya tim yang punya"
   bukan asumsi yang bisa dipegang.
3. **Apa yang TIDAK terpapar** — `master_customer` dan seluruh `crm_*` RLS ON;
   `customer_engagement` RLS ON. Kontrol yang dibangun tim CRM berfungsi. Yang bocor ada
   di jalur sekelilingnya. Ini penting supaya keputusannya diarahkan ke tempat yang benar.
4. **Kenapa ini bukan pekerjaan tim CRM** — Fase 0 milik pemilik data; menyalakan RLS
   tanpa policy akan memutus aplikasi tim lain yang memakai tabel-tabel itu. Sebutkan risiko
   itu terang-terangan, karena itulah alasan sesungguhnya kenapa ini belum dikerjakan.
5. **Urutan remediasi yang diusulkan**, dengan konsekuensi tiap langkah — dan siapa yang
   harus memutuskan tiap langkah.
6. **Apa yang terjadi kalau tidak diapa-apakan.** Tulis jujur, tanpa dramatisasi.

Silang-rujuk T-02, T-03, dan temuan baru ini di `docs/riwayat/TEMUAN.md` dengan nomor
T- berikutnya. Naikkan juga ke ringkasan paling atas `docs/riwayat/README.md`: temuan
keamanan tidak boleh hanya hidup di poin 5 sebuah laporan sprint.

---

## TUGAS 3 — Periksa CRM sendiri tidak ikut membocorkan

Sprint 3N sudah membatasi kolom yang dibaca dari `customer_engagement` (`raw_value`,
`source_row_id`, `period` sengaja tidak diambil). Pastikan itu berlaku menyeluruh.

Telusuri **setiap** lapisan baca dan setiap route CRM, lalu jawab per berkas: kolom apa
yang benar-benar keluar dari server, dan adakah satu pun yang sensitif menurut daftar
TUGAS 1. Termasuk `metadata` audit dan log kegagalan Sprint 3K.

Kalau menemukan sesuatu, perbaiki dan tulis testnya. Kalau tidak menemukan apa pun,
**katakan apa yang sudah kamu periksa sehingga yakin** — nol temuan tanpa uraian tidak
bisa dibedakan dari tidak memeriksa.

Tambahkan satu test yang menegakkan daftar kolom aman `customer_engagement`, supaya
seseorang tidak menambahkan `raw_value` ke `select` enam bulan lagi tanpa ada yang sadar.

---

## TUGAS 4 — Daratkan empat commit

3K, 3L, 3M, dan 3N menunggu, dan tak satu pun bisa berguna dari branch. Perbarui berkas PR
jadi mencakup 3O.

Kalimat teratas: **siklus ini tidak menambah paparan apa pun — ia mengukurnya.** Seluruh
sprint di dalamnya baca-saja, nol perubahan skema, dan satu-satunya tabel baru yang
disentuh (`customer_engagement`) sudah RLS ON.

Sertakan juga: `/settings/diagnostik` dari Sprint 3L adalah cara tercepat memvalidasi
deploy-nya sendiri — buka satu halaman setelah deploy, seluruh lapisan baca terperiksa.

**JANGAN merge sendiri.** Siapkan, lalu minta izin.

---

## TUGAS 5 — Yang masih menggantung

- **Baris suppression pertama** belum ada. Jalur tulis dan pencarian sudah di `main` dan
  terbukti jalan; hambatannya bukan lagi teknis. **Jangan buat baris uji.**
- **Penyebab gap 37–39** belum terbukti, dilemahkan oleh operasi sukses berikutnya, belum
  ditutup. Jangan tutup temuan yang belum terjawab hanya karena berhenti muncul.
- **`my20fit_user_activity`** adalah satu-satunya sumber recency asli di seluruh ekosistem,
  tapi hanya **44 profil** yang cocok. Catat di `docs/SUMBER-AKTIVITAS.md` apa yang
  dibutuhkan agar angka itu naik — dan bahwa kuncinya email, jadi pencocokan wajib lewat
  `normalize.ts` (K-06), bukan perbandingan string mentah.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan menyalakan RLS atau menulis policy di tabel mana pun | Fase 0 milik pemilik data; bisa memutus aplikasi tim lain |
| Jangan `SELECT` isi kolom sensitif, sekalipun untuk memeriksa | Inventaris tidak boleh jadi kebocoran kedua |
| Jangan tulis nilai NIK, kesehatan, atau kontak darurat di berkas atau laporan mana pun | — |
| Jangan sentuh tabel di luar `crm_*`, `master_customer`, `customer_engagement` (baca saja) | Proyek dipakai bersama tim lain |
| Jangan `INSERT` ke `crm_*`, termasuk `crm_profile_behavior` | Fase 0 belum dicabut |
| Jangan buat migrasi, tabel, view, atau RPC | Nol perubahan skema |
| Jangan bangun ingestion dari sumber mana pun | Butuh keputusan Fase 0 + dasar pemrosesan |
| Jangan tampilkan `last_seen_at` sebagai "terakhir aktif" bila sama dengan `first_seen_at` | K-19 |
| Jangan setval atau reset `crm_audit_log_id_seq` | K-21 |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — dan hasil cek selisih enam baris clinic
2. **Inventaris paparan** — tabel, RLS, jumlah baris, kolom sensitif, jumlah terisi.
   **Hitungan saja.** Sebutkan juga angka T-02 dan T-03 hasil ukuran ulangmu
3. **Berkas eskalasi** — ringkasan, terutama urutan remediasi dan siapa yang memutuskan
4. **Pemeriksaan CRM sendiri** — apa yang kamu periksa, apa yang ditemukan, test apa yang
   kamu tambahkan
5. **Berkas PR** — kalimat teratas
6. **Yang masih menggantung**
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (262) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
