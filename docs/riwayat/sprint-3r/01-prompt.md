# CLAUDE CODE PROMPT — Sprint 3R: Pelengkapan Profil (TUGAS 2 yang tertunda)

> **3P TUGAS 2 satu-satunya bagian permintaan produk yang belum dikerjakan.** Peta consent,
> filter AND/OR, kerapian nama, dan penandaan typo email sudah selesai di `40a6841`.
> Yang tersisa: menyambungkan sumber ekosistem yang belum masuk ke profil.
>
> **Verifikasi independen atas klasifikasi 3Q — angkamu bertahan:** 383 tabel di skema
> `public`, **199 anon-readable**, **43 authenticated-only**, **138 terkunci tanpa policy**.
> Selisih kecil hanya pada definisi "writable". Seluruh `crm_*` ada di kelompok terkunci,
> dan pola itu memang bekerja.
>
> Angka itu mengubah cara sprint ini harus dipikirkan. Sumber yang akan kamu baca —
> `cf_hyrox_participants` dengan 1.030 NIK — **sudah terbuka untuk anon hari ini**.
> Menariknya ke belakang RBAC CRM tidak menambah paparan; ia justru memberi jalur yang
> teraudit dan tergerbang untuk data yang sekarang bisa diambil siapa saja tanpa login.
> **Tapi itu bukan alasan untuk longgar** — justru sebaliknya. Sampai remediasi pemilik
> data berjalan, CRM harus jadi contoh cara memperlakukan data ini, bukan tempat kedua ia
> tersebar.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: branch membawa 3N, 3O, 3P (`40a6841`), 3Q (`c666d8d`) di atas `origin/main`
`e366347` — **empat commit belum ter-merge**, atau sudah ter-merge bila PR dibuka lebih
dulu. Baseline test **306**. Berbeda → **berhenti dan lapor**.

**Nol perubahan skema. Nol tulis ke tabel mana pun.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Sambungkan sumber, dan sebutkan berapa yang tidak tersambung

Angka pencocokan lewat email ternormalisasi, verifikasi ulang sendiri:

| Sumber | Baris | Cocok | Tidak cocok |
|---|---|---|---|
| `cf_hyrox_participants` | 1.038 | **288** | 750 |
| `my20fit_profile` | 886 | **169** | 717 |
| `my20fit_user_activity` | 175 | **44** | 131 |
| `rc_team_members` | 1.545 | — | hanya berkunci `name` |

**Yang tidak cocok lebih banyak daripada yang cocok, dan itu fakta yang harus ikut
tampil.** Sebuah layar yang menampilkan 288 peserta Hyrox tanpa menyebut 750 lainnya tidak
tersambung akan membuat orang menyimpulkan pesertanya memang 288.

**Aturan:**

- Pencocokan **wajib** lewat `normalize.ts` (K-06). Nol perbandingan string mentah.
- `rc_team_members` **jangan dicocokkan lewat nama.** Nama tidak unik; salah cocok berarti
  menempelkan riwayat orang lain ke profil seseorang — kesalahan yang tidak terlihat sampai
  seseorang dihubungi atas dasar yang keliru.
- **Nol tulis ke `master_customer` dan `crm_*`.** Gabungkan saat tampil, seperti
  `customer_engagement` di Sprint 3N. Ini bukan sekadar aturan lama: `master_customer` kini
  terbukti bisa ditulis 887 akun (T-17), jadi satu-satunya yang menahan CRM dari menulis ke
  sana adalah disiplin kode ini sendiri.
- Kolom yang diambil ditetapkan sebagai **konstanta teruji**, mengikuti pola
  `ENGAGEMENT_SAFE_COLUMNS` dari 3O. Daftar terlarang ikut diuji.
- Profil yang tidak tersambung berbunyi **"tidak ada data Hyrox untuk profil ini"** —
  bukan bidang kosong yang terbaca "tidak pernah ikut".

---

## TUGAS 2 — Field sensitif: gerbang, samarkan, audit tiap pembukaan

NIK, tanggal lahir, golongan darah, dan kontak darurat masuk lewat sumber ini.

| Aturan | Rinci |
|---|---|
| Gerbang | `profile.view_health` — `super_admin` dan `crm_manager` saja (matriks PRD 17.2) |
| Peran lain | disamarkan di server, tidak pernah terkirim ke browser (K-02) |
| Default bagi yang berhak | **tetap tersamar**; membuka butuh tindakan eksplisit |
| Tiap pembukaan | **satu baris audit**, dengan `target_id` profilnya |

Aksi auditnya: pakai `profile.viewed` dengan `metadata` yang menyebut **jenis** field yang
dibuka (`nik`, `health`) — **jangan** buat aksi baru, dan **jangan** taruh nilainya di
`metadata`. Audit mencatat bahwa NIK dibuka, bukan NIK-nya.

Ini pertama kalinya proyek ini menampilkan nomor identitas kependudukan. Kalau ada satu
tempat di mana "tersamar sampai diminta" terasa berlebihan, ini bukan tempatnya.

**Golongan darah, riwayat obat, operasi, dan diagnosa dari `clinic_*` JANGAN dibawa masuk
sama sekali** di sprint ini. Data medis butuh dasar pemrosesan tersendiri, dan
`crm_consent` masih kosong. Sebutkan di laporan sebagai batas yang kamu pilih, bukan
sebagai kelalaian.

---

## TUGAS 3 — Sambungkan ke filter AND/OR

Filter AND/OR dari 3P sekarang punya bahan baru. Tambahkan sebagai kondisi:

- **Peserta Hyrox** — ya/tidak
- **Pengguna my20fit** — ya/tidak
- **Punya data recency nyata** — hanya 44 profil; berguna justru karena kecil, karena ia
  memperlihatkan seberapa tipis data aktivitas yang benar-benar ada

Nilai dari daftar tertutup, masuk `metadata` audit seperti kriteria lain. Aturan PRD §18.8
tidak berubah: setiap jumlah tetap berpasangan dengan jumlah yang boleh dihubungi.

**Tetap nol kriteria berbasis waktu** (K-19), termasuk `last_active_at` dari
`my20fit_user_activity`. Kolom itu **nyata**, tapi hanya untuk 44 dari 82.253 profil —
menjadikannya kriteria akan menghasilkan segmen yang terlihat presisi sambil menyembunyikan
99,9% pool. Kalau suatu saat cakupannya naik, keputusan ini bisa ditinjau ulang; tulis
syaratnya di `docs/SUMBER-AKTIVITAS.md`.

---

## TUGAS 4 — Tutup lingkaran yang menggantung

- **`docs/SUMBER-AKTIVITAS.md`** — perbarui dengan hasil nyata: berapa tersambung, berapa
  tidak, dan **apa yang dibutuhkan agar naik.** Untuk `my20fit_user_activity`, kuncinya
  email; 131 tak cocok kemungkinan besar karena orangnya memang belum ada di
  `master_customer`, bukan karena normalisasinya gagal — pastikan mana yang benar dan
  laporkan.
- **`/quality`** — tambahkan cakupan sumber ekosistem sebagai blok baru, dihitung live.
  Tingkat kecocokan rendah adalah temuan kualitas data, bukan detail implementasi.
- **`docs/riwayat/`** — T-16 (`gmaol.com` sistematis), T-17 (policy `master_customer`),
  dan hasil sprint ini. Perbarui `FAKTA-DATA.md` dengan angka bertanggal.
- **Gap 37–39** — per 11 Agustus 15:07 UTC audit sudah **77 baris, `max(id)` 81, gap tetap
  `4, 37, 38, 39`.** Tiga puluh empat operasi teraudit baru, nol gap baru, termasuk
  pembukaan detail profil. Hipotesis "detail profil rusak" praktis gugur. Turunkan
  bobotnya di `TEMUAN.md` jadi episode historis terbatas — **tapi jangan ditutup**, karena
  penyebabnya tetap tak terjawab.
- **Baris suppression pertama** masih nol. Jangan buat baris uji.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan `UPDATE`/`INSERT`/`DELETE` di `master_customer` atau tabel mana pun | Kini hanya disiplin kode yang menahannya, bukan database (T-17) |
| Jangan cocokkan `rc_team_members` lewat nama | Nama tidak unik; salah cocok tak terlihat sampai orang salah dihubungi |
| Jangan bawa masuk data medis `clinic_*` | Butuh dasar pemrosesan; `crm_consent` masih kosong |
| Jangan tampilkan NIK tanpa gerbang, masking default, dan audit per pembukaan | Nomor identitas kependudukan |
| Jangan taruh nilai NIK atau field kesehatan di `metadata` audit | Audit mencatat bahwa ia dibuka, bukan isinya |
| Jangan buat aksi audit baru | Allowlist migrasi 8 memangkas per nama eksak |
| Jangan jadikan `last_active_at` kriteria segmen | Nyata, tapi hanya 44 dari 82.253 |
| Jangan ubah policy, RLS, atau grant | Remediasi milik pemilik data |
| Jangan backfill consent | Menunggu jawaban `basis`→`purpose` dari 3P TUGAS 1 |
| Jangan buat migrasi, tabel, view, atau RPC | Nol perubahan skema |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Pencocokan** — angka yang kamu ukur sendiri per sumber, dan bagaimana yang tidak
   tersambung ditampilkan di layar
3. **Field sensitif** — gerbang, masking default, bentuk audit saat dibuka, dan konfirmasi
   nilainya tidak masuk `metadata`
4. **Filter** — kondisi baru, dan alasan `last_active_at` tetap ditolak
5. **Lingkaran yang ditutup** — `SUMBER-AKTIVITAS`, `/quality`, `docs/riwayat/`, dan status
   baru gap 37–39
6. **Yang masih menggantung**
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (306) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
