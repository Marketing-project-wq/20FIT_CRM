# CLAUDE CODE PROMPT — Sprint 3U: Luruskan Jalur Deploy, Percepat Contactability, Lanjutkan Sumber

> **TUGAS 1 harus dijawab sebelum yang lain**, karena jawabannya mengubah model risiko
> seluruh proyek ini.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **340**. Berbeda dari harapanmu → **berhenti dan lapor**.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Kontradiksi status deploy

Laporan terakhir menyatakan PR #11 **belum di-merge**, sehingga produksi masih memakai
`resetPasswordForEmail()`. Tapi produksi menulis tiga baris audit reset — 04:48:41,
04:48:44, 04:57:35 UTC — dan `marketing@20fit.id` berhasil masuk pada **04:58:21**, tepat
sesudahnya. Resetnya nyata dan berhasil.

Dua penjelasan, dan konsekuensinya sangat berbeda:

| Kemungkinan | Artinya |
|---|---|
| Reset berhasil lewat **jalur lama** (Sprint 3T sudah ter-deploy sejak awal) | PR #11 masih perlu didaratkan; staf berikutnya tetap menerima email dari "UOB Heartbeat Run" berisi tautan, bukan kode OTP |
| **Railway men-deploy dari branch**, bukan dari `main` | Setiap push ke branch langsung masuk produksi — dan seluruh gate "jangan merge ke `main` tanpa izin" selama sepuluh sprint tidak pernah benar-benar menahan apa pun |

**Selidiki, jangan pilih yang enak didengar:**

1. Periksa pengaturan Railway: service ini men-deploy dari branch apa? Kalau tidak punya
   akses, katakan begitu dan sebutkan persis apa yang harus dilihat orang yang punya.
2. Periksa apakah `login.password_reset_requested` dengan `actor_email='system:password-reset'`
   dan `metadata.outcome='sent'` ditulis oleh kode Sprint 3T **atau** hanya oleh kode
   email-fix. `git log -S` pada string aksinya akan menjawab ini dalam satu perintah.
3. `auth.users.recovery_sent_at` kini **null** untuk akun itu — dulu terisi. Nilai itu
   di-set oleh `resetPasswordForEmail` dan **tidak** oleh `generateLink`, tapi juga
   dibersihkan setelah reset berhasil. Jadi ia **tidak** bisa membedakan kedua jalur;
   jangan pakai sebagai bukti. Sebutkan itu di laporan supaya tak dipakai keliru nanti.

**Kalau ternyata Railway men-deploy dari branch**, itu temuan yang lebih besar daripada
sprint ini: catat sebagai temuan `T-` baru dan keputusan `K-` di `docs/riwayat/`, dan
perbarui `README.md` serta berkas PR yang menyatakan merge ke `main` yang memicu deploy.
Sepuluh sprint dokumentasi menyatakan hal yang salah kalau begitu.

---

## TUGAS 2 — Contactability masih terlalu lambat, dan sebabnya dua

Indeks migrasi 12 bekerja: Index Only Scan, **Heap Fetches 0**. Tapi pengukuran ulang
menunjukkan biayanya berpindah, bukan hilang.

Query tanpa join sekalipun — `count(distinct customer_id)` dari `crm_consent` saja — masih
**1,5 detik**, dan rinciannya jelas: scan mencapai baris pertama dalam **3,6 ms**,
sisanya habis di **sort 163.252 baris yang tumpah ke disk** (`external merge Disk: 3200kB`).
`work_mem` instance ini **2184 kB**.

Jadi ada **dua** kemacetan, bukan satu seperti yang dilaporkan: hash join ke
`master_customer`, **dan** sort untuk `DISTINCT`. Keduanya berakar pada `work_mem` yang kecil.

**Yang harus kamu kerjakan:**

**2a. Hilangkan join yang tidak perlu.** Untuk dashboard **tanpa filter**, join ke
`master_customer` tidak dibutuhkan: FK menjamin setiap `customer_id` di `crm_consent`
valid, dan saat ini nol yang null. Pertanyaan "berapa profil punya consent aktif" bisa
dijawab dari `crm_consent` saja.

Join **tetap wajib** untuk segment builder, karena kriterianya ada di tabel induk. Jadi ini
dua jalur berbeda, bukan satu jalur yang disederhanakan — beri nama dan komentar yang jelas
supaya tidak ada yang menyatukannya kembali.

Karena FK-nya `ON DELETE SET NULL`, sertakan `customer_id is not null` secara eksplisit.
Nol null hari ini tidak berarti selamanya.

**2b. Atasi sort yang tumpah.** Pilih satu, argumentasikan, dan **ukur**:

- Naikkan `work_mem` untuk jalur ini saja (per sesi/transaksi), bukan global
- Atau hilangkan `DISTINCT`-nya: dengan unique key `(customer_id, channel, purpose)`, jumlah
  profil per purpose bisa diturunkan tanpa sort penuh — pikirkan bentuk yang memakai indeks
  baru secara langsung

**Wajib: `EXPLAIN ANALYZE` sebelum dan sesudah, dengan angka.** Laporkan apa adanya. Kalau
tetap di atas satu detik, katakan begitu — jangan laporkan "sudah dioptimalkan" tanpa angka
yang membuktikannya.

**Jawabannya tidak boleh berubah:** 82.253 untuk marketing dan 82.253 untuk layanan.
Kalau berubah, optimasinya salah, bukan datanya.

Suppression tetap dikurangkan (K-03). Nol baris hari ini tidak berarti boleh dihapus.

---

## TUGAS 3 — Lanjutkan TUGAS 1 prompt 3S yang tertunda

Ini bagian terbesar permintaan produk yang belum dikerjakan, dan tidak ada lagi yang
memblokirnya. Angka terverifikasi 11 Agustus 2026 — **ukur ulang sendiri**:

| Sumber | Baris | Punya email | Kunci |
|---|---|---|---|
| `arena_class_bookings` | 2.727 | 2.727 | email, phone |
| `arena_bookings` | 247 | 247 | email, phone |
| `clinic_bookings` | 170 | **2** | `patient_id`, phone |
| `clinic_patients` | 137 | 47 | email, phone |
| `arena_package_orders` | 62 | 62 | email |
| `gym_class_bookings` | 10 | 10 | email |
| `arena_members`, `gym_membership_orders` | 3 + 3 | 6 | email |

Plus tabel klinis lewat `patient_id` setelah `clinic_patients` tercocokkan:
`clinic_visits`, `clinic_assessments` (149 baris), `clinic_screenings` (131 baris),
`clinic_posture_scans`, `clinic_patient_packages`, `clinic_transactions`.

**Aturan:**

- Email lewat `normalizeEmail`, telepon lewat `normalizePhoneID` (K-06). **Telepon boleh
  jadi kunci kedua** — `clinic_bookings` hanya punya 2 email dari 170 baris, jadi tanpa
  telepon sumber itu praktis tak terpakai. Email dulu, telepon sebagai fallback, dan
  **catat kunci mana yang dipakai** supaya tingkat keyakinannya terlihat.
- `clinic_*` disambungkan lewat `patient_id` **setelah** `clinic_patients` tercocokkan,
  bukan langsung ke `master_customer`.
- **Jangan cocokkan lewat nama saja.** Ini satu-satunya pembatasan pencocokan yang tersisa,
  dan alasannya tetap: nama tidak unik, dan salah cocok menempelkan riwayat medis atau
  transaksi orang lain ke profil seseorang — tidak terlihat sampai ada yang salah dihubungi.
- **Nol tulis.** Gabungkan saat tampil, seperti Sprint 3N dan 3R. `master_customer` kini
  terbukti bisa ditulis 887 akun (T-17); yang menahan CRM hanyalah disiplin kode ini.
- Kolom yang diambil sebagai **konstanta teruji**, ikuti pola `ENGAGEMENT_SAFE_COLUMNS`.
- Tingkat kecocokan tampil **di layar** dan di `/quality`. Profil tak tercocokkan berbunyi
  "tidak ada data … untuk profil ini", bukan bidang kosong.
- Sumber baru jadi kondisi filter AND/OR, dengan jumlah berpasangan (§18.8). Setelah
  migrasi 11, angka kedua akhirnya bukan nol.
- **Tetap nol kriteria berbasis waktu** (K-19).

Kalau sprint terlalu padat, kerjakan TUGAS 1–2 dulu dan laporkan TUGAS 3 sebagai sisa.
Jangan paksakan selesai setengah-setengah.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan simpulkan status deploy dari `recovery_sent_at` | Dibersihkan setelah reset berhasil; tak bisa membedakan kedua jalur |
| Jangan naikkan `work_mem` secara global | Instance kecil; naikkan untuk jalur yang membutuhkannya saja |
| Jangan satukan jalur dashboard dan segment builder | Yang satu tak butuh join, yang satu wajib |
| Jangan hapus pengurangan suppression saat mengoptimalkan | Nol baris hari ini tidak berarti selamanya |
| Jangan cocokkan lewat nama saja | Salah cocok = riwayat orang lain menempel di profil |
| Jangan `UPDATE`/`INSERT`/`DELETE` di `master_customer` atau tabel tim lain | Proyek bersama |
| Jangan buat migrasi, tabel, view, atau RPC | Nol perubahan skema; indeks sudah ada |
| Jangan tulis baris consent atau suppression uji | Consent uji mencemari hitungan; suppression tak bisa dihapus |
| Jangan ubah setelan SMTP, template, atau Auth di dashboard Supabase | Setelan proyek bersama |
| Jangan tampilkan NIK, data kesehatan, atau kontak darurat tanpa gerbang `profile.view_health` | — |
| Jangan setval atau reset `crm_audit_log_id_seq` | K-21 |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Sampai TUGAS 1 menjawab, anggap ini masih berlaku |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status deploy** — mana dari dua kemungkinan yang benar, **dengan bukti**. Kalau Railway
   men-deploy dari branch, sebutkan apa saja dokumen yang perlu dikoreksi
2. **Contactability** — `EXPLAIN ANALYZE` sebelum vs sesudah dengan angka, pilihan yang kamu
   ambil untuk sort yang tumpah, dan konfirmasi 82.253 tidak berubah
3. **Sumber baru** — tingkat kecocokan per sumber, kunci mana yang dipakai, berapa yang tak
   tersambung, dan bagaimana itu ditampilkan
4. **Filter** — kondisi baru dan bentuk yang ditolak
5. **Yang masih menggantung** — termasuk enam item di `docs/MENUNGGU-TINDAKAN-MANUSIA.md`
6. **Yang ditemukan tapi tidak disentuh**
7. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (340) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
