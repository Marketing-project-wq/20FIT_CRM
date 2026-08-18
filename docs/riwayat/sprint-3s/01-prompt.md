# CLAUDE CODE PROMPT — Sprint 3S: Buka Semua Data

> **Keputusan pemilik produk: buka seluruh data ke dalam CRM.** Ini sistem internal untuk
> staf mengelola data pelanggan dari berbagai sumber, datanya milik perusahaan, dan staf
> butuh melihatnya untuk melakukan pekerjaannya. Batas-batas yang sebelumnya ditahan
> menunggu jawaban legal dibuka sekarang.
>
> **Yang dibuka:** seluruh sumber ekosistem masuk ke profil — clinic, arena, gym, my20fit,
> Hyrox, event. Field sensitif (NIK, tanggal lahir, golongan darah, kontak darurat, data
> kesehatan) ditampilkan ke staf yang berhak. Consent di-backfill sehingga angka "bisa
> dihubungi" berhenti nol.
>
> **Empat hal tetap dipertahankan, dan tak satu pun soal legal** — semuanya soal
> pekerjaan CS tidak rusak:
>
> | Tetap | Kenapa |
> |---|---|
> | Audit tetap ditulis | Cara staf tool bekerja: kalau data salah berubah, harus bisa ditelusuri siapa. Sudah jalan, nol biaya |
> | Suppression tetap menang | Kalau pelanggan bilang "jangan hubungi saya lagi", menghubunginya lagi merusak hubungan dan memancing keluhan. Nol baris sekarang, jadi tidak menahan apa pun |
> | Nol tulis ke `master_customer` | Tabel ini dipakai sistem tim lain di proyek bersama. Menulis ke sana bisa merusak aplikasi mereka — ini soal integritas database, bukan legal |
> | Nilai NIK & kesehatan tidak masuk `metadata` audit | Audit dipangkas 90 hari dan append-only; menaruh nilai di sana menyalin data sensitif ke tempat yang tak bisa dibersihkan |
>
> Sisanya dibuka.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: PR #8 sudah merge 3N–3Q; branch membawa 3R (`f1d6ef3`). Baseline test **313**.
Berbeda → **berhenti dan lapor**.

**Sprint ini besar.** Kalau tidak muat satu siklus, kerjakan TUGAS 1–2 dulu (yang paling
langsung terasa staf), laporkan sisanya. Jangan paksakan selesai setengah-setengah.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Semua sumber masuk ke profil

Sumber yang sudah tersambung: `customer_engagement`, `cf_hyrox_participants`,
`my20fit_profile`, `my20fit_user_activity`. Yang belum, dengan angka terverifikasi
11 Agustus 2026 — **ukur ulang sendiri**:

| Sumber | Baris | Punya email | Kunci |
|---|---|---|---|
| `arena_class_bookings` | 2.727 | 2.727 | email, phone |
| `arena_bookings` | 247 | 247 | email, phone |
| `clinic_bookings` | 170 | **2** | `patient_id`, phone |
| `clinic_patients` | 137 | 47 | email, phone |
| `arena_package_orders` | 62 | 62 | email |
| `gym_class_bookings` | 10 | 10 | email |
| `arena_members`, `gym_membership_orders` | 3 + 3 | 6 | email |

Plus data klinis yang menempel ke `clinic_patients` lewat `patient_id`:
`clinic_visits`, `clinic_assessments` (149 baris, 107 diagnosa), `clinic_screenings`
(131 baris, 35 kolom), `clinic_posture_scans`, `clinic_patient_packages`,
`clinic_transactions`.

**Aturan pencocokan:**

- Email **wajib** lewat `normalizeEmail`, telepon lewat `normalizePhoneID` (K-06). Nol
  perbandingan string mentah.
- **Telepon boleh dipakai sebagai kunci kedua** bila email tidak ada — `clinic_bookings`
  hanya punya 2 email dari 170 baris, jadi tanpa telepon sumber itu praktis tak terpakai.
  Cocokkan email dulu, telepon sebagai fallback, dan **catat kunci mana yang dipakai** di
  hasilnya supaya tingkat keyakinannya terlihat.
- `clinic_*` disambungkan lewat `patient_id` **setelah** `clinic_patients` tercocokkan —
  jangan cocokkan tabel klinis langsung ke `master_customer`.
- **Tetap jangan cocokkan lewat nama saja** (`rc_team_members`, `cf_user`). Nama tidak
  unik; salah cocok menempelkan riwayat medis atau transaksi orang lain ke profil
  seseorang, dan itu tidak terlihat sampai seseorang dihubungi atas dasar yang keliru.
  Ini satu-satunya pembatasan pencocokan yang tersisa.
- **Nol tulis.** Gabungkan saat tampil, seperti Sprint 3N dan 3R.
- Tingkat kecocokan per sumber ditampilkan di layar dan di `/quality`.

---

## TUGAS 2 — Tampilkan semuanya ke staf yang berhak

**Field sensitif dibuka:** NIK, tanggal lahir, golongan darah, kontak darurat, diagnosa,
hasil skrining, riwayat obat dan operasi, posture scan, data kesehatan my20fit.

Yang berubah dari 3R: **tidak lagi tersamar secara default.** Staf yang berhak melihatnya
langsung saat membuka profil — CS yang sedang menelepon pelanggan tidak perlu mengklik
tiap field.

Yang tetap:

- **Gerbang peran.** Tetapkan lewat matriks RBAC yang sudah ada, bukan lewat kondisi yang
  tersebar di komponen. Kalau pemilik produk ingin lebih banyak peran melihat data
  kesehatan, itu satu baris di `lib/auth/roles.ts` — dan itu memang tempat yang benar
  untuk mengubahnya. Sebutkan di laporan peran mana yang kini melihat apa.
- **Audit pembukaan profil** (`profile.viewed`, sudah ada). Cukup satu baris per profil;
  jangan tambah baris per field.
- **Nilai tidak masuk `metadata`.** Cukup jenis field yang tersedia.

Hapus endpoint reveal terpisah dari 3R kalau sudah tidak dipakai — jangan tinggalkan jalur
mati (pelajaran T-07).

---

## TUGAS 3 — Backfill consent

Tujuannya: angka "bisa dihubungi" berhenti nol dan mulai berarti.

**Catat, jangan asumsikan.** Jangan buat `isContactableForMarketing` mengembalikan `true`
untuk semua orang, dan jangan lewati pemeriksaannya. Isi `crm_consent` sungguhan. Bedanya
praktis: consent yang tercatat bisa ditunjukkan saat pelanggan bertanya "dari mana Anda
dapat nomor saya", bisa dicabut per orang, dan meninggalkan jejak. Yang diasumsikan tidak
bisa satu pun.

**Pelaksanaan:**

- `basis` = **`legacy_import_unverified`** untuk data impor. Ini bukan pembatasan — ia
  nilai yang jujur, dan peta `basis`→`purpose` dari 3P sudah mengizinkan `marketing`.
  Gunakan `explicit_opt_in` **hanya** bila ada catatan opt-in yang bisa ditunjuk per orang.
  Kalau kelak ada yang bertanya dari mana consent-nya, jawabannya harus cocok dengan
  kenyataan — itu satu-satunya alasan pembedaan ini penting.
- `evidence` menunjuk sumbernya (nama sumber + tanggal impor), **tanpa PII**.
- Lewat fungsi Postgres atomik (K-14, pola `crm_record_suppression`) — satu transaksi
  dengan barisnya audit. Ini migrasi 11, satu-satunya perubahan skema sprint ini.
- Channel dan purpose sesuai kosakata CHECK constraint migrasi 3 yang sudah ada. **Jangan
  ubah constraint-nya**; kalau butuh nilai baru, tunjukkan dulu.
- **Idempoten** — jalan dua kali tidak menggandakan baris atau audit.
- **`clinic_consents` (300 baris) periksa dulu.** Kalau isinya consent per pasien yang
  nyata, itu justru sumber `explicit_opt_in` yang sah untuk sebagian orang. Laporkan apa
  isinya sebelum memutuskan.

**Gate:** tunjukkan SQL migrasi 11 dan rencana backfill-nya, **berhenti**, tunggu
konfirmasi. Sesudah jalan: laporkan berapa baris consent tertulis, berapa profil kini
"bisa dihubungi", dan pastikan `crm_suppression` tetap dihormati.

---

## TUGAS 4 — Filter mengikuti data baru

Semua sumber baru jadi kondisi filter: pasien clinic, member arena, member gym, pengguna
my20fit, peserta Hyrox, punya booking, dan seterusnya.

- Bentuk AND/OR dari 3P berlaku penuh. Kalau sebuah bentuk tidak bisa diungkapkan jujur ke
  PostgREST, **tolak di validasi** — jangan diam-diam menyederhanakan. Filter yang berubah
  arti diam-diam adalah kegagalan terburuk di layar itu.
- Aturan PRD §18.8 tetap: jumlah audiens berpasangan dengan jumlah bisa dihubungi. Setelah
  TUGAS 3, angka kedua akhirnya bukan nol.
- **Kriteria berbasis waktu tetap ditolak** (K-19) — bukan soal legal, soal angkanya bohong:
  98,5% kolom waktu adalah cap waktu muat, jadi "aktif 90 hari terakhir" akan mengembalikan
  ratusan orang sambil menyembunyikan puluhan ribu. Kecuali kamu menemukan sumber waktu
  yang cakupannya memadai di TUGAS 1 — kalau iya, pakai itu dan laporkan cakupannya.

---

## TUGAS 5 — Ekspor

Dengan consent tercatat dan data lengkap, ekspor jadi masuk akal. Bangun untuk peran yang
berhak per matriks (`export.*`).

- Ekspor menulis baris audit `export.*` — **sudah ada di denylist kepatuhan** migrasi 8,
  jadi dikecualikan permanen dari pemangkasan. Ini yang membuat pertanyaan "siapa mengunduh
  data siapa, kapan" masih bisa dijawab enam bulan lagi.
- Catat jumlah baris dan kriteria yang dipakai; **jangan** catat isinya.
- **Suppression tetap dikecualikan dari ekspor untuk tujuan marketing.** Ekspor adalah
  jalur paling mudah membuat orang yang sudah minta berhenti tetap dihubungi — lewat file
  yang beredar di luar sistem dan tak bisa ditarik kembali.
- Ambang `export ≤ threshold` vs `> threshold` sudah ada di matriks RBAC. Tetapkan
  angkanya, sebutkan di laporan.

Kalau sprint sudah terlalu padat, tunda TUGAS 5 dan laporkan — empat tugas pertama sudah
memberi staf hampir semua yang diminta.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan `UPDATE`/`INSERT`/`DELETE` di `master_customer` atau tabel tim lain | Proyek bersama; bisa merusak aplikasi tim lain |
| Jangan cocokkan lewat nama saja | Salah cocok = riwayat medis/transaksi orang lain menempel di profil |
| Jangan buat consent dianggap ada tanpa baris `crm_consent` | Catat, jangan asumsikan — supaya bisa ditunjukkan dan dicabut |
| Jangan pakai `explicit_opt_in` tanpa catatan opt-in yang bisa ditunjuk | Jawaban harus cocok dengan kenyataan saat ditanya |
| Jangan hapus pemeriksaan suppression di mana pun, termasuk ekspor | Menghubungi orang yang minta berhenti memancing keluhan |
| Jangan taruh nilai NIK/kesehatan di `metadata` audit atau log | Audit append-only dan dipangkas 90 hari |
| Jangan ubah CHECK constraint migrasi 3 tanpa menunjukkan dulu | Sudah diterapkan di produksi |
| Jangan buat aksi audit baru di luar prefiks yang sudah ada | Allowlist migrasi 8 memangkas per nama eksak |
| Jangan sediakan kriteria waktu dari kolom cap-muat | Angkanya bohong (K-19) |
| Jangan ubah policy, RLS, atau grant | Remediasi milik pemilik data (T-17) |
| Jangan buat migrasi selain migrasi 11 | Satu perubahan skema per siklus |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Sumber tersambung** — tingkat kecocokan per sumber yang kamu ukur sendiri, kunci mana
   yang dipakai (email/telepon), dan berapa yang tetap tak tersambung
3. **Field sensitif** — peran mana melihat apa, dan konfirmasi nilai tidak masuk audit
4. **Consent** — isi `clinic_consents`, `basis` yang dipakai dan alasannya, jumlah baris
   tertulis, dan **berapa profil kini "bisa dihubungi"**
5. **Filter** — kondisi baru, dan bentuk yang ditolak beserta alasannya
6. **Ekspor** — dibangun atau ditunda; kalau dibangun, ambang dan bentuk auditnya
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (313) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
