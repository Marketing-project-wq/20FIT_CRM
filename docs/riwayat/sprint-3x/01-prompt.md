# CLAUDE CODE PROMPT — Sprint 3X: Selesaikan Cakupan `/quality` dan Filter Segmen

> **Verifikasi independen atas laporanmu: cocok.** `clinic_transactions` 2.477 baris —
> **2.277 ber-`patient_id` NULL**, 200 tertaut; `clinic_legacy_patient_import` 876 baris.
> Penyelidikanmu benar dan kesimpulannya tepat: hitungan per-pasien hanya memuat baris yang
> memang tertaut, jadi angkanya benar dan tidak menyesatkan.
>
> Keputusan meninggalkan isi klinis — diagnosa, hasil skrining, riwayat obat, operasi —
> dan hanya menampilkan identitas serta **hitungan** keterlibatan adalah pilihan yang tepat.
> Alasan yang kamu tulis persis benar: CS mengenali pasien dan jadwalnya, bukan membaca
> rekam medis.
>
> Sprint ini pendek: dua tugas tersisa, keduanya sudah punya angka dan rencana.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **357**. Berbeda → **berhenti dan lapor**.
**Nol perubahan skema.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Blok cakupan sumber di `/quality`

Angkanya sudah kamu ukur; tinggal dipasang sebagai blok live yang dihitung per request.
`fetchEnrichmentCoverage` sudah ada — cerminkan polanya, jangan tulis jalur kedua.

**Yang ditampilkan per sumber:** jumlah baris, jumlah profil tercocokkan, persentase, dan
**kunci yang dipakai** (email atau telepon). Kolom kunci itu yang menjelaskan kenapa
angkanya tinggi atau rendah — tanpa itu, pembaca akan mengira selisihnya acak.

Acuan hasil ukuranmu, **ukur ulang sendiri** karena tabelnya hidup:

| Sumber | Baris | Cocok | Kunci |
|---|---|---|---|
| `arena_class_bookings` | 2.731 | 639 | email |
| `arena_bookings` | 247 | 13 | email |
| `arena_package_orders` | 63 | 31 | email |
| `gym_class_bookings` | 10 | 6 | email |
| `gym_memberships` / `arena_members` | 3 / 3 | 0 / 0 | email |
| `clinic_patients` | 143 | 12 email / **106 telepon** | telepon dulu |

**Tiga hal yang harus jujur terbaca, bukan disembunyikan:**

1. **`arena_bookings` cocok 13 dari 247 padahal semuanya punya email.** Itu bukan
   kekurangan data — orangnya memang tidak ada di `master_customer`. Bedakan dari
   `clinic_patients` yang rendah karena emailnya kosong. Dua sebab berbeda dengan gejala
   yang sama, dan pembaca perlu bisa membedakannya.
2. **`gym_memberships` dan `arena_members` cocok nol.** Nol dari tiga baris. Tampilkan
   sebagai nol terukur (K-08), jangan hilangkan barisnya dari tabel.
3. **`clinic_transactions`: 2.277 dari 2.477 ber-`patient_id` NULL.** Tampilkan sebagai
   temuan kualitas data tersendiri, bukan sebagai tingkat kecocokan — penyebabnya berbeda
   (impor spreadsheet yang tak pernah ditautkan), dan mencampurnya ke tabel yang sama akan
   mengaburkan keduanya.

Bingkai seluruh blok ini sebagai **temuan kualitas data**, bukan kegagalan implementasi:
identitas antar-sistem 20FIT memang belum terpadu. Kalimat itu perlu ada di layar, karena
tanpanya angka rendah akan dibaca sebagai bug.

Catat juga `clinic_posture_scans` (2 baris) dan `clinic_patient_packages` (6 baris) di sini
— keputusanmu untuk tidak menampilkannya per-profil sudah benar, tapi keberadaannya layak
tercatat di halaman kualitas.

---

## TUGAS 2 — Filter segmen dari sumber baru

Rencananya sudah lengkap di `docs/RENCANA-multisumber.md`. Bangun.

**Kondisi baru:** pasien klinik, member/peserta arena, member gym, punya booking arena,
punya transaksi klinik — masing-masing ya/tidak, dari daftar tertutup.

**Yang mengikat:**

- Bentuk AND/OR dari 3P berlaku penuh. Kalau sebuah bentuk **tidak bisa diungkapkan jujur**
  ke PostgREST, **tolak di validasi** — jangan diam-diam menyederhanakannya jadi sesuatu
  yang lain. Filter yang berubah arti tanpa diberitahukan adalah kegagalan terburuk di layar
  itu.
- Kondisi lintas-tabel diselesaikan jadi himpunan `customer_id` lalu diiris, seperti yang
  sudah kamu lakukan untuk kriteria ekosistem. Kalau OR lintas-tabel tidak bisa diungkapkan,
  **katakan begitu di UI** — jangan sediakan pilihan yang diam-diam berperilaku sebagai AND.
- Jumlah berpasangan §18.8 tetap: audiens dan bisa-dihubungi berdampingan. Setelah migrasi
  11 dan 13, angka kedua bukan nol lagi.
- **Segment builder tetap memakai jalur embed.** RPC `crm_contactable_counts` hanya untuk
  dashboard tanpa filter. Dua jalur, sudah dikomentari — jangan disatukan.
- **Nol kriteria berbasis waktu** (K-19).
- Nilai daftar-tertutup masuk `metadata` audit; teks bebas kena cap panjang (K-17).
- Kondisi berbasis data klinis **wajib digerbangi `profile.view_health`**. Seorang analis
  yang bisa menyaring "pasien klinik" sedang menyimpulkan status kesehatan dari hitungan,
  meski tak pernah melihat satu diagnosa pun. Kalau kamu memutuskan tetap menyediakannya
  untuk peran lain, **argumentasikan** — jangan diloloskan diam-diam.

**Ukuran segmen yang sangat kecil perlu perhatian.** Beberapa sumber hanya cocok 6, 13, atau
31 profil. Segmen sebesar itu praktis menunjuk individu tertentu, dan itu mengubah sifat
layarnya — dari agregat jadi pengungkapan. Putuskan apakah ada ambang minimum, dan sebutkan
pilihanmu beserta alasannya.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan campur "tidak ada di master" dengan "identifier kosong" | Dua sebab berbeda dengan gejala sama; pembaca perlu membedakannya |
| Jangan hilangkan baris bernilai nol dari tabel cakupan | K-08: nol terukur bukan tidak ada sumbernya |
| Jangan sediakan pilihan OR yang diam-diam berperilaku AND | Filter yang berubah arti tanpa diberitahukan |
| Jangan loloskan kriteria klinis tanpa `profile.view_health` | Menyaring "pasien klinik" adalah menyimpulkan status kesehatan |
| Jangan satukan jalur dashboard (RPC) dan segment builder (embed) | Kebutuhan join-nya berbeda |
| Jangan sediakan kriteria berbasis waktu | K-19 |
| Jangan baca isi klinis — diagnosa, hasil, obat, operasi | Sudah di `CLINIC_FORBIDDEN_COLUMNS`; keputusan sadar sprint lalu |
| Jangan `UPDATE`/`INSERT`/`DELETE` di tabel mana pun | Nol tulis; proyek bersama |
| Jangan buat migrasi, view, atau RPC baru | Nol perubahan skema |
| Jangan arahkan Railway ke `main` sebelum merge | Produksi mundur dua belas commit |
| Jangan merge ke `main` sendiri | Izin di tangan pemilik |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Blok cakupan** — angka yang kamu ukur ulang beserta selisih dari acuan, dan bagaimana
   tiga sebab berbeda (tak ada di master, identifier kosong, `patient_id` NULL) dibedakan
   di layar
3. **Filter segmen** — kondisi yang tersedia, bentuk yang **ditolak** beserta alasannya, dan
   bagaimana batas OR lintas-tabel disampaikan ke pengguna
4. **Gerbang klinis pada filter** — keputusanmu dan alasannya
5. **Ambang segmen kecil** — pilihanmu dan alasannya
6. **Yang masih menggantung** — termasuk tujuh item `MENUNGGU-TINDAKAN-MANUSIA.md`
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (357) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
