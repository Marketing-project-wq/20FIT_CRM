# CLAUDE CODE PROMPT — Sprint 3W: Rantai Klinis, Cakupan `/quality`, Filter Segmen

> **Migrasi 13 terverifikasi independen.** Fungsi live, `SECURITY DEFINER`, `proacl` hanya
> `postgres | service_role`, ledger `20260812063419`, dan pemanggilan nyata mengembalikan
> `{"marketing":82253,"transactional":82253}`.
>
> Penanganan granularitas suppression di K-26 patut dicatat: kamu **membaca**
> `isContactableForPurpose` alih-alih mengasumsikan, menemukan aturannya memang
> per-identitas-global sesuai D-3, lalu mengesahkannya dengan syarat pembalikan tertulis dan
> test pengunci. Itu cara yang benar menutup aturan yang database-nya sendiri tak bisa uji.
>
> Sprint ini menyelesaikan sisa TUGAS 3: rantai `clinic_*`, cakupan `/quality`, dan filter
> segmen. **Slice arena/gym sudah mendarat, jadi polanya tinggal diulang — kecuali dua hal
> yang berbeda dan harus ditangani lebih dulu.**

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **351**. Berbeda → **berhenti dan lapor**.
**Nol perubahan skema sprint ini.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Untuk klinik, TELEPON adalah kunci utama, bukan email

Ini membalik urutan yang dipakai slice arena/gym. Terverifikasi 12 Agustus 2026, **ukur
ulang sendiri**:

| | `clinic_patients` (143 baris) |
|---|---|
| Punya email | **49** |
| Punya telepon | **143** (semuanya) |
| Cocok ke `master_customer` lewat email | **12** |
| Cocok lewat telepon (normalisasi perkiraan) | **106** |

Email hanya menemukan 12 dari 143 profil; telepon menemukan 106. Memakai urutan
"email dulu, telepon fallback" di sini akan membuang hampir seluruh pasien klinik dari
pandangan CS — dan itu justru unit yang paling butuh konteks saat menelepon.

**Yang harus kamu kerjakan:**

- Jadikan urutan kunci **per sumber**, bukan konstanta global. `matchKeyOrder` sudah ada;
  perluas supaya klinik memakai telepon lebih dulu. Alasannya tulis di komentar dengan
  angkanya, supaya orang berikutnya tidak "merapikannya" kembali jadi seragam.
- Normalisasi tetap wajib lewat `normalizePhoneID` (K-06). Angka 106 di atas dari
  normalisasi perkiraan yang saya jalankan langsung di SQL — **hasil sebenarnya lewat
  `normalizePhoneID` bisa berbeda**. Ukur dengan fungsi yang sebenarnya dan laporkan
  selisihnya; kalau lebih rendah, itu justru sinyal ada bentuk telepon yang belum tertangani.
- Tandai di layar kunci mana yang dipakai, seperti yang sudah kamu lakukan untuk arena/gym.

---

## TUGAS 2 — Selidiki `clinic_transactions` sebelum menampilkannya

`clinic_transactions` punya **2.477 baris**, tetapi hanya **200** yang tersambung ke
`clinic_patients` lewat `patient_id`. Sisanya — 2.277 baris, hampir 92% — tidak menemukan
pasangannya.

Tiga kemungkinan, dan konsekuensinya berbeda:

1. Transaksi merujuk pasien yang tidak ada di `clinic_patients` (data terpisah atau terhapus)
2. `patient_id` di kedua tabel memakai ruang id yang berbeda
3. Ada tabel pasien kedua — perhatikan ada `clinic_transaction` **dan** `clinic_transactions`
   (tunggal dan jamak), serta `clinic_legacy_patient_import`

**Selidiki dan laporkan sebelum membangun apa pun di atasnya.** Menampilkan "200 transaksi"
sementara 2.277 tidak terlihat akan membuat staf menyimpulkan pasiennya memang jarang
bertransaksi. Kalau ternyata kuncinya salah, angka yang tampil bukan sekadar tidak lengkap —
ia menyesatkan.

Kalau penyebabnya tidak bisa dipastikan, **tampilkan apa adanya beserta keterangannya**:
berapa yang tersambung, berapa yang tidak, dan bahwa penyebabnya belum diketahui.

Perhatikan juga tabel yang isinya sangat sedikit: `clinic_posture_scans` **2 baris**,
`clinic_patient_packages` **6 baris**. Keduanya nyaris tidak membawa informasi. Putuskan
apakah layak ditampilkan sama sekali, dan sebutkan pilihanmu — menampilkan bagian yang
selalu kosong hanya menambah kebisingan di layar profil.

---

## TUGAS 3 — Rantai klinis, seluruhnya di balik `profile.view_health`

**Seluruh 143 baris `clinic_patients` memuat NIK** (`id_number`), ditambah `date_of_birth`,
`address`, dan `emergency_contact_*`. Temuanmu benar dan menjadi dasar aturan di sini.

| Aturan | Rinci |
|---|---|
| Gerbang | `profile.view_health` — `super_admin` dan `crm_manager` (matriks PRD 17.2) |
| Peran lain | seluruh bagian klinis **tidak dikirim sama sekali** dari server, bukan disamarkan di klien |
| Sambungan | lewat `patient_id` **setelah** `clinic_patients` tercocokkan — jangan join tabel klinis langsung ke `master_customer` |
| Audit | satu baris `profile.viewed` yang sudah ada; **jangan** tambah baris kedua |
| `metadata` | jenis field saja, **tidak pernah nilainya** |

Kolom aman sebagai **konstanta teruji**, ikuti pola `MULTISOURCE_FORBIDDEN_COLUMNS` yang
sudah kamu buat. Yang masuk daftar terlarang: NIK, catatan bebas, bukti bayar, dan apa pun
yang tidak dibutuhkan CS untuk mengenali konteks pasien.

**Diagnosa, hasil skrining, riwayat obat, dan operasi:** tampilkan hanya bila memang
dibutuhkan alur kerja CS, dan putuskan dengan sadar. Sebuah layar CS yang menampilkan
diagnosa lengkap saat staf sekadar mengonfirmasi jadwal adalah paparan yang tak perlu.
Sebutkan apa yang kamu pilih tampilkan dan apa yang kamu tinggalkan, beserta alasannya —
ini keputusan, bukan detail implementasi.

---

## TUGAS 4 — Cakupan sumber di `/quality`

Tambahkan blok baru, dihitung live per request, mencakup **seluruh** sumber multi-sumber
(arena, gym, klinik):

- Berapa baris di sumbernya, berapa yang tersambung ke `master_customer`, berapa persen
- **Kunci mana yang dipakai** per sumber — email atau telepon — karena itu yang menjelaskan
  kenapa angkanya tinggi atau rendah
- Yang tak tersambung ditampilkan sebagai temuan kualitas data, bukan disembunyikan

Angka rendah di sini **bukan kegagalan implementasi**, melainkan gambaran nyata bahwa
identitas antar-sistem belum terpadu. Bingkai begitu di layar, supaya tidak dibaca sebagai
bug.

---

## TUGAS 5 — Filter segmen dari sumber baru

Sumber baru jadi kondisi filter AND/OR: pasien klinik, member arena, member gym, punya
booking, dan seterusnya.

- Bentuk AND/OR dari 3P berlaku. Kalau sebuah bentuk tak bisa diungkapkan jujur ke
  PostgREST, **tolak di validasi** — jangan diam-diam menyederhanakan.
- Jumlah berpasangan (§18.8) tetap: audiens dan bisa-dihubungi. Setelah migrasi 11 dan 13,
  angka kedua akhirnya bukan nol dan cepat dihitung.
- Segment builder tetap memakai jalur embed; RPC hanya untuk dashboard tanpa filter. Dua
  jalur, jangan disatukan.
- **Nol kriteria berbasis waktu** (K-19).
- Nilai dari daftar tertutup masuk `metadata` audit; teks bebas kena cap panjang (K-17).

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan pakai email sebagai kunci utama untuk klinik | 12 cocok versus 106 lewat telepon |
| Jangan tampilkan transaksi klinis sebelum penyebab 2.277 baris tak tersambung dijelaskan | Angka parsial tanpa keterangan menyesatkan, bukan sekadar tak lengkap |
| Jangan cocokkan lewat nama saja | Salah cocok = riwayat medis orang lain menempel di profil |
| Jangan kirim data klinis ke peran tanpa `profile.view_health` | Tidak dikirim dari server, bukan disamarkan di klien |
| Jangan taruh NIK atau nilai kesehatan di `metadata` audit atau log | — |
| Jangan tambah baris audit kedua untuk halaman profil yang sama | `profile.viewed` sudah ada |
| Jangan `UPDATE`/`INSERT`/`DELETE` di tabel mana pun | Nol tulis; proyek bersama |
| Jangan buat migrasi, view, atau RPC baru | Nol perubahan skema sprint ini |
| Jangan satukan jalur dashboard (RPC) dan segment builder (embed) | Kebutuhan join-nya berbeda |
| Jangan sediakan kriteria berbasis waktu | K-19 |
| Jangan arahkan Railway ke `main` sebelum merge | Produksi mundur sembilan commit |
| Jangan merge ke `main` sendiri | Izin di tangan pemilik |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Kunci klinik** — tingkat kecocokan lewat `normalizePhoneID` yang sebenarnya versus
   angka 106 di atas, dan selisihnya kalau ada
3. **`clinic_transactions`** — penyebab 2.277 baris tak tersambung, atau pernyataan jelas
   bahwa belum diketahui; dan keputusanmu soal tabel yang isinya 2 dan 6 baris
4. **Rantai klinis** — apa yang kamu tampilkan, apa yang kamu tinggalkan, dan alasannya
5. **Cakupan `/quality`** — angka per sumber dan kunci yang dipakai
6. **Filter segmen** — kondisi baru dan bentuk yang ditolak
7. **Yang masih menggantung** — termasuk tujuh item `MENUNGGU-TINDAKAN-MANUSIA.md`
8. **Yang ditemukan tapi tidak disentuh**
9. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (351) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
