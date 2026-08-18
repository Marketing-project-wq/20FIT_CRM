# CLAUDE CODE PROMPT — Pasang dan Verifikasi `docs/riwayat/`

> **Sprint pendek, dokumentasi saja. Nol perubahan skema, nol perubahan kode aplikasi.**
>
> Berkas `riwayat-crm.zip` sudah diunggah ke repo. Isinya folder `docs/riwayat/` —
> rekaman prompt, keputusan, temuan, dan fakta data lintas sprint, yang selama ini hanya
> hidup di komentar kode dan riwayat percakapan yang mudah hilang.
>
> **Tugasmu bukan menerima isinya, melainkan memverifikasinya.** Berkas-berkas itu ditulis
> di luar Claude Code oleh sesi yang tidak punya akses repo penuh. Setiap angka commit,
> setiap versi ledger, dan setiap klaim status layar di dalamnya harus dicocokkan ke repo
> dan ke database. Rekaman yang salah lebih berbahaya daripada tidak ada rekaman, karena
> orang akan mempercayainya.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Laporkan ketiganya apa adanya. Harapan: `origin/main` di `eff733c`; branch memuat enam
commit (3G ×2, 3H ×3, 3I ×1) sampai `7760e15`. Berbeda → **berhenti dan lapor**.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Pasang folder, lalu bersihkan jejak arsipnya

1. Ekstrak `riwayat-crm.zip` ke akar repo sehingga menghasilkan `docs/riwayat/`.
2. **Hapus `riwayat-crm.zip` dan `SALIN-KE-REPO.md` dari repo** setelah diekstrak. Arsip
   yang tertinggal akan jadi salinan kedua yang menyimpang diam-diam dari isi foldernya.
3. Konfirmasi strukturnya: empat register di akar (`LINIMASA.md`, `KEPUTUSAN.md`,
   `TEMUAN.md`, `FAKTA-DATA.md`), `README.md`, folder `transkrip/`, dan satu folder per
   sprint dari `sprint-1-2` sampai `sprint-3j`.

---

## TUGAS 2 — Verifikasi setiap klaim yang bisa diperiksa

Jangan percaya berkasnya. Cocokkan, lalu **perbaiki di tempat** dan catat setiap koreksi.

**Terhadap repo:**

- Setiap SHA commit di `LINIMASA.md` — `0d3a66a`, `c0809ba`, `d92a92e`, `f9d9136`,
  `4bac312`, `bf736b0`, `322377f`, `68dd66f`, `9c44c00`, `e25a317`, `eff733c`,
  `9a7b296`, `ef0ea89`, `c63280a`, `15cb3f7`, `a0035d9`, `7760e15`. Pastikan ada, dan
  pastikan kolom "di `main`?" benar — pakai `git merge-base --is-ancestor`, bukan ingatan.
- Jumlah test per sprint (126 → 141 → 146 → 146 → 170 → 179 → 179 → 194 → 202).
  Kalau bisa, `git stash` dan checkout commit lama untuk memastikan; kalau terlalu mahal,
  katakan begitu dan tandai angkanya sebagai "dari laporan, tidak diverifikasi ulang".
- Setiap rujukan berkas di `KEPUTUSAN.md` (`lib/auth/roles.ts`, `lib/crm/normalize.ts`,
  `lib/crm/retention-policy.ts`, `lib/crm/mask.ts`, `docs/KOLOM-WAKTU.md`,
  `docs/SIGNOFF-legal-consent.md`, `docs/RENCANA-jalur-tulis-consent.md`,
  `docs/RISIKO-masking-bypass.md`, `docs/RISIKO-rpc-execute-terbuka.md`) — benar-benar ada.
- Tabel ledger di `LINIMASA.md` versus tabel ledger di `README.md` utama. Keduanya
  menggambarkan hal yang sama; kalau berbeda, itu persis pola aturan-ganda yang sudah dua
  kali menggigit proyek ini. Laporkan selisihnya, jangan diam-diam menyelaraskan salah satu.

**Terhadap database:**

- Versi ledger tiap migrasi, termasuk entri ganda migrasi 9
- Angka di `FAKTA-DATA.md`: jumlah baris `master_customer`, fill rate, LTV, duplikat,
  orphan/excluded, `staging_20fit_data` (**`count(*)`, bukan `reltuples`**), tabel `crm_*`,
  dan `proacl` keempat fungsi
- Kolom "terbukti jalan di produksi" di `LINIMASA.md` — cek `crm_audit_log` sekarang.
  **Angkanya bergerak**: jumlah baris bertambah karena sistem dipakai, dan `profile.viewed`
  bisa saja sudah tidak nol. Perbarui, dan pastikan setiap angka membawa tanggal
  pengukuran barumu.

---

## TUGAS 3 — Isi yang bisa kamu isi, tandai jelas yang tidak

Sebelas berkas `02-laporan.md` dan `03-tinjauan.md` bertanda **BELUM DIISI**.

- **`02-laporan.md`** butuh laporan penutup asli tiap sesi. **Kamu tidak memilikinya dan
  jangan merekonstruksinya dari `git log`** — rekonstruksi yang terlihat seperti arsip
  adalah kebohongan yang paling sulit ketahuan nanti. Biarkan penandanya, dan pastikan
  kalimatnya jelas bahwa ini menunggu tempelan manusia.
- **`03-tinjauan.md`** untuk sprint yang **kamu sendiri kerjakan** boleh kamu isi, karena
  itu memang pengetahuanmu: apa yang kamu verifikasi saat itu, apa yang gagal, apa yang
  kamu putuskan biarkan. Isi yang kamu bisa; sisanya biarkan bertanda.
- Untuk Sprint 3G, 3H, dan 3I, `03-tinjauan.md` bisa cukup lengkap — sertakan bukti yang
  sudah kamu hasilkan (probe rollback K-3, demonstrasi pagar EXECUTE, latihan revert).

---

## TUGAS 4 — Sambungkan supaya tidak jadi folder yatim

Dokumentasi yang tidak ditunjuk siapa pun tidak akan dibaca siapa pun.

- Tambahkan satu bagian pendek di `README.md` utama yang menunjuk `docs/riwayat/`, dan
  jelaskan kapan orang perlu membukanya — terutama: **sebelum mengubah sesuatu yang
  komentarnya berbunyi seperti peringatan**. Alasan di balik peringatan itu ada di
  `KEPUTUSAN.md`.
- Silang-rujuk dua arah: keputusan yang punya berkas dokumen sendiri (`KOLOM-WAKTU`,
  `SIGNOFF-legal-consent`, `RENCANA-jalur-tulis-consent`, kedua berkas `RISIKO-*`,
  `KEPUTUSAN-penjadwalan-purge`, `PERTAMA-suppression`) harus menunjuk balik ke nomor
  keputusan atau temuannya.
- Tambahkan langkah "perbarui `docs/riwayat/`" ke berkas PR siklus ini, supaya sprint
  berikutnya tidak lupa.

---

## TUGAS 5 — Periksa PII sebelum commit

Folder ini ikut ter-push ke GitHub, dan repo ini **sempat publik**.

Sapu seluruh `docs/riwayat/`: nomor telepon pelanggan, alamat email pelanggan, nama
lengkap pelanggan, `identity_key`, isi `reason_detail`, dan UUID `customer_id`. Email staf
internal (`tifany@20fit.id`, `marketing@20fit.id`) boleh — keduanya relevan pada keputusan
peran dan sudah ada di pesan commit maupun seed.

Laporkan apa yang kamu sapu dan apa yang kamu temukan. **Nol temuan adalah hasil yang sah
di sini** — berkasnya memang ditulis dengan aturan itu — tapi katakan apa yang sudah kamu
periksa sehingga yakin.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan rekonstruksi `02-laporan.md` dari `git log` | Rekonstruksi yang menyamar sebagai arsip lebih buruk daripada berkas kosong |
| Jangan ubah kode aplikasi, migrasi, atau skema | Sprint dokumentasi; nol perubahan skema |
| Jangan menyelaraskan diam-diam dua tabel ledger yang berbeda | Laporkan selisihnya; itu keputusan, bukan pembersihan |
| Jangan tinggalkan `riwayat-crm.zip` di repo | Salinan kedua akan menyimpang |
| Jangan pakai `pg_class.reltuples` untuk angka baris | Estimasi perencana; selalu `count(*)` |
| Jangan merge atau push ke `main` tanpa izin eksplisit | — |
| Jangan cetak PII di laporan | — |

---

## LAPORAN PENUTUP

1. **Status remote** — tiga keluaran `git log`, apa adanya
2. **Verifikasi** — tabel: klaim, hasil pemeriksaan, koreksi yang kamu buat. Sebutkan
   setiap angka yang **bergerak** sejak berkasnya ditulis, terutama `crm_audit_log`
3. **Dua tabel ledger** — apakah `LINIMASA.md` dan `README.md` utama sepakat; kalau tidak,
   di mana bedanya
4. **Yang kamu isi** — `03-tinjauan.md` mana yang kamu lengkapi, dan mana yang tetap menunggu
5. **Sambungan** — di mana `README.md` utama menunjuk, dan silang-rujuk yang kamu tambahkan
6. **Sapuan PII** — apa yang diperiksa, apa yang ditemukan
7. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau (202),
`NODE_ENV=production npm run build` lulus. Sprint dokumentasi tidak boleh mengubah
angka-angka itu — kalau berubah, ada yang tersentuh dan itu harus dilaporkan.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
