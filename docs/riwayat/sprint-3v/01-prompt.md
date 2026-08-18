# CLAUDE CODE PROMPT — Sprint 3V: Luruskan Deploy, RPC Contactability, Pelengkapan Sumber

> **T-18 terbukti dan mengubah beberapa hal sekaligus.** Bukti diskriminatifmu kuat: aksi
> `login.password_reset_requested` hanya ada di commit branch, `origin/main` memanggil
> `resetPasswordForEmail` langsung tanpa menulis audit, dan produksi menulis tiga baris itu
> untuk reset yang berhasil. Produksi menjalankan kode branch.
>
> **Dua konsekuensi yang belum ditarik di laporan, dan keduanya penting:**
>
> **(a) "Merge PR #11" BUKAN penghalang reset kata sandi.** Item nomor 3 di
> `docs/MENUNGGU-TINDAKAN-MANUSIA.md` menyatakan reset rusak sampai PR mendarat — itu keliru
> sekarang, karena kode perbaikannya sudah live lewat branch. Itu juga menjelaskan kenapa
> email 04:01 masih dari UOB sementara reset 04:48 berhasil: perbaikannya di-push di antara
> keduanya. Perbaiki daftar itu; kalau dibiarkan, orang akan mengejar penghalang yang tidak
> ada.
>
> **(b) Mengarahkan Railway ke `main` sekarang akan MEROSOTKAN produksi.** Ini yang paling
> berbahaya. `origin/main` tertinggal enam commit; ia tidak punya `/forgot-password`, tidak
> punya perbaikan email, dan **tidak punya perbaikan jalur baca contactability**. Sementara
> itu migrasi 11 dan 12 **sudah berlaku di database**. Jadi kode `main` + database sekarang
> = jalur baca lama menarik 408 ribu baris tanpa batas, terpotong diam-diam di 1000, dan
> menampilkan angka "bisa dihubungi" yang **salah tanpa error**.
>
> Urutannya wajib: **merge dulu, baru arahkan ulang.** Terbalik = regresi diam-diam di
> layar utama.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **340**. Berbeda → **berhenti dan lapor**.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Siapkan koreksi model deploy

Kamu tidak bisa mengubah setelan Railway. Yang bisa kamu lakukan: membuat urutannya jelas
dan aman, sehingga orang yang punya akses tidak salah langkah.

**Tulis `docs/KOREKSI-DEPLOY.md`** berisi urutan yang tidak boleh dibalik:

1. **Merge PR #11** (branch → `main`). Sesudah ini `main` dan branch identik, jadi langkah
   berikutnya tidak mengubah apa pun yang berjalan.
2. **Konfirmasi di dashboard Railway** service produksi tersambung ke branch apa. Sebutkan
   persis di mana melihatnya: Settings → Source → Branch.
3. **Arahkan ulang ke `main`** hanya setelah langkah 1 selesai.
4. **Verifikasi** lewat `/settings/diagnostik` — satu halaman yang menjalankan seluruh
   lapisan baca sekaligus.

Tulis **eksplisit apa yang terjadi kalau urutannya dibalik**: produksi mundur enam commit
ke kode yang membaca `crm_consent` tanpa batas, sementara tabelnya kini berisi 408 ribu
baris — hasilnya angka contactability yang salah dan tidak menimbulkan error sama sekali.
Itu justru jenis kegagalan yang paling lama tidak ketahuan.

**Perbaiki juga `docs/MENUNGGU-TINDAKAN-MANUSIA.md`:** item "merge PR #11" bukan lagi
penghalang reset kata sandi — turunkan alasannya jadi "meluruskan model deploy", dan
naikkan konfirmasi Railway sebagai prasyaratnya.

**Periksa apakah ada dokumen lain yang masih menyatakan `main` memicu deploy.** Kamu sudah
memperbaiki README; sisir juga berkas PR, `PASCA-MERGE-monitoring-revert.md`, ceklis
verifikasi, dan `docs/riwayat/`. Sepuluh sprint dokumentasi ditulis di atas model yang
salah — sebutkan berapa berkas yang kamu koreksi.

---

## TUGAS 2 — Migrasi 13: RPC contactability

Rekomendasimu benar dan sekarang **diizinkan**. Aplikasi hanya bicara PostgREST — tidak ada
driver `pg`, jadi tidak ada `count(distinct)` dan tidak ada `set local work_mem`. Selama itu
jadi batasnya, 2,9 detik adalah lantai, dan lantai itu terlalu tinggi untuk layar pertama
yang dibuka staf setiap hari.

Buat fungsi `SECURITY DEFINER` yang mengembalikan jumlah profil contactable per purpose.

**Yang wajib:**

- `set local work_mem` di dalam fungsi, secukupnya untuk menghindari tumpahan ke disk.
  `work_mem` instance ini **2184 kB** dan sort butuh sekitar 3200 kB — naikkan untuk
  transaksi ini saja, **jangan** global.
- **`revoke all … from public, anon, authenticated` DAN `grant execute … to service_role`**,
  di berkas migrasi yang sama (K-15). Pagar EXECUTE dari Sprint 3I harus meloloskannya.
- **Suppression tetap dikurangkan di dalam fungsi** (K-03). Nol baris hari ini tidak berarti
  boleh dihilangkan; kalau dihilangkan, ia akan tetap hilang saat baris pertama masuk.
- `customer_id is not null` eksplisit — FK-nya `ON DELETE SET NULL`, jadi baris yatim
  mungkin ada nanti meski nol sekarang.
- **Baca saja.** Nol tulis, nol audit dari dalam fungsi — ia dipanggil dari jalur yang sudah
  punya aturan auditnya sendiri (K-07: agregat tanpa parameter pengguna tidak diaudit).

**Gate:** tampilkan SQL, **berhenti**, tunggu konfirmasi, lalu `apply_migration` (bukan
`db push`).

**Verifikasi dengan angka:**

1. `EXPLAIN ANALYZE` sebelum dan sesudah. Sebelumnya ~2,9 detik lewat jalur embed. Laporkan
   angka sesudahnya apa adanya — kalau masih di atas satu detik, katakan begitu.
2. Hasilnya **tidak berubah**: 82.253 untuk marketing, 82.253 untuk layanan.
3. `proacl` hanya `postgres` dan `service_role`.
4. Versi ledger tercap, README diperbarui.

Segment builder **tetap memakai jalur embed** — kriterianya ada di tabel induk, jadi
join-nya wajib. Dua jalur berbeda, jangan disatukan; beri komentar yang menjelaskan kenapa.

---

## TUGAS 3 — Pelengkapan multi-sumber (sudah dua kali ditunda)

Ini bagian terbesar permintaan produk yang belum dikerjakan. Angka yang kamu ukur 12 Agustus
— tabelnya hidup dan bertumbuh, jadi **ukur ulang lagi** dan laporkan selisihnya:

| Sumber | 12 Agu | Kunci |
|---|---|---|
| `arena_class_bookings` | 2.731 | email, phone |
| `arena_bookings` | 247 | email, phone |
| `clinic_bookings` | 173 | `patient_id`, phone |
| `clinic_patients` | 139 | email, phone |
| `arena_package_orders` | 62 | email |
| `gym_class_bookings` | 10 | email |
| `arena_members` / `gym_membership_orders` | 3 / 3 | email |
| `clinic_assessments` / `clinic_screenings` | 151 / 137 | `patient_id` |

Plus `clinic_visits`, `clinic_posture_scans`, `clinic_patient_packages`,
`clinic_transactions` lewat `patient_id`.

**Rencana yang sudah kamu tulis sudah benar — jalankan.** Ringkasnya, dan ini yang mengikat:

- Email lewat `normalizeEmail`, telepon lewat `normalizePhoneID` (K-06). Telepon sebagai
  kunci kedua, dan **catat kunci mana yang dipakai** supaya tingkat keyakinannya terlihat —
  `clinic_bookings` hanya punya 2 email dari 173 baris.
- `clinic_*` lewat `patient_id` **setelah** `clinic_patients` tercocokkan.
- **Nol cocok-nama-saja.** Nama tidak unik; salah cocok menempelkan riwayat medis orang lain
  ke profil seseorang, dan itu tak terlihat sampai ada yang salah dihubungi.
- **Nol tulis.** Gabungkan saat tampil (pola 3N/3R). `master_customer` bisa ditulis 887 akun
  (T-17); yang menahan CRM hanya disiplin kode ini.
- Kolom aman sebagai **konstanta teruji**, pola `ENGAGEMENT_SAFE_COLUMNS`.
- Tingkat kecocokan di layar dan di `/quality`; profil tak tercocokkan berbunyi "tidak ada
  data … untuk profil ini", bukan bidang kosong.
- Sumber jadi kondisi filter AND/OR dengan jumlah berpasangan (§18.8). Angka kedua kini
  bukan nol.
- **Nol kriteria berbasis waktu** (K-19).
- Field sensitif tetap di balik `profile.view_health`; nilainya tidak pernah masuk `metadata`.

Kalau terlalu padat, kerjakan TUGAS 1–2 dulu dan laporkan TUGAS 3 sebagai sisa — **tapi ini
penundaan ketiga**, jadi sebutkan berapa banyak yang sempat kamu kerjakan, bukan sekadar
"ditunda".

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan arahkan Railway ke `main` sebelum merge | Produksi mundur enam commit; jalur baca lama + 408 ribu baris = angka salah tanpa error |
| Jangan biarkan dokumen menyatakan "merge PR #11 memperbaiki reset" | Kode itu sudah live lewat branch |
| Jangan naikkan `work_mem` global | Instance kecil; naikkan di dalam fungsi saja |
| Jangan hapus pengurangan suppression di dalam RPC | Nol baris sekarang tidak berarti selamanya |
| Jangan satukan jalur dashboard dan segment builder | Yang satu tak butuh join, yang satu wajib |
| Jangan cocokkan lewat nama saja | Salah cocok = riwayat orang lain menempel di profil |
| Jangan `UPDATE`/`INSERT`/`DELETE` di `master_customer` atau tabel tim lain | Proyek bersama |
| Jangan buat migrasi selain 13 | Satu perubahan skema per siklus |
| Jangan jalankan `supabase db push` | Ledger diverge dan punya entri ganda |
| Jangan tulis baris consent atau suppression uji | Consent uji mencemari hitungan; suppression tak bisa dihapus |
| Jangan ubah setelan SMTP, template, atau Auth di dashboard Supabase | Setelan proyek bersama |
| Jangan setval atau reset `crm_audit_log_id_seq` | K-21 |
| Jangan merge ke `main` sendiri | Siapkan urutannya; izin tetap di tangan pemilik |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Koreksi deploy** — isi `KOREKSI-DEPLOY.md`, berapa berkas lain yang masih menyatakan
   model lama dan kamu perbaiki, dan bagaimana `MENUNGGU-TINDAKAN-MANUSIA.md` berubah
3. **Migrasi 13** — SQL, versi ledger, `proacl`, **`EXPLAIN ANALYZE` sebelum vs sesudah
   dengan angka**, dan konfirmasi 82.253 tidak berubah
4. **Suppression** — bagaimana pengurangannya dipertahankan di dalam fungsi
5. **Sumber baru** — tingkat kecocokan per sumber yang kamu ukur, kunci mana yang dipakai,
   berapa yang tak tersambung, dan bagaimana itu ditampilkan
6. **Filter** — kondisi baru dan bentuk yang ditolak
7. **Yang masih menggantung**
8. **Yang ditemukan tapi tidak disentuh**
9. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (340) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
