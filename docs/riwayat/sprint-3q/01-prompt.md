# CLAUDE CODE PROMPT — Sprint 3Q: "RLS ON" Ternyata Tidak Berarti Terlindungi

> **Kekhawatiran yang kamu tulis sendiri di poin 8 laporan 3O ternyata benar, dan akibatnya
> ada di tabel utama produk ini.**
>
> Kamu menulis: *"Saya mengukur `relrowsecurity`, bukan tiap policy — sebuah tabel 'RLS ON'
> secara teoretis bisa punya policy permisif yang mengizinkan anon."* Kehati-hatian itu
> tepat. Diverifikasi 11 Agustus 2026:
>
> ```
> master_customer      → policy "authenticated_full_access"
>                        PERMISSIVE · roles {authenticated} · cmd ALL · USING true
> customer_engagement  → policy "authenticated_full_access"
>                        PERMISSIVE · roles {authenticated} · cmd ALL · USING true
> ```
>
> **Artinya setiap akun yang bisa login punya akses penuh — BACA dan TULIS — ke seluruh
> 82.253 profil, tanpa masking dan tanpa audit.** `cmd = ALL` mencakup `UPDATE` dan
> `DELETE`. Ada **887 akun** di `auth.users`.
>
> Ini melewati, bukan menembus: matriks RBAC, masking server-side (K-02), aturan
> read-only `master_customer`, dan seluruh jejak `list.viewed`. Seorang `analyst` tidak
> perlu `/api/audience` — anon key plus sesi login sudah cukup, dan itu ada di setiap
> bundel JavaScript yang dikirim ke browser.
>
> **Yang mendesak bukan hanya lubangnya, tapi dokumennya.** `docs/ESKALASI-paparan-data-sensitif.md`
> saat ini menyatakan `master_customer` aman dan bahwa "kontrol yang dibangun tim CRM
> berfungsi; yang bocor ada di jalur sekelilingnya". Itu **tidak benar**, dan dokumen itu
> ditulis untuk dibaca pengambil keputusan. Dokumen eskalasi yang salah lebih berbahaya
> daripada tidak ada dokumen, karena ia mengarahkan perhatian ke tempat yang keliru.
>
> **Sprint ini pendek dan disela.** Pekerjaan profil, filter AND/OR, nama, dan email
> (prompt 3P) tetap mengantre tepat setelah ini.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `e366347` (PR #7 memuat 3K+3L+3M); branch `e0c0d90` membawa
3N + 3O. Baseline test **265**. Berbeda → **berhenti dan lapor**.

**Nol perubahan skema. Nol policy diubah. Nol RLS dinyalakan atau dimatikan.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Ukur ulang paparan, kali ini lewat policy

Inventaris Sprint 3O memakai `relrowsecurity` sebagai ukuran. Ukuran itu terbukti tidak
cukup. Ulangi dengan pertanyaan yang benar: **siapa sebenarnya yang bisa membaca dan
menulis tabel ini?**

Untuk **setiap** tabel di skema `public`, tentukan aksesnya bagi `anon` dan bagi
`authenticated`, dengan menggabungkan tiga hal — bukan satu:

1. `relrowsecurity` — RLS menyala atau tidak
2. Policy yang berlaku: peran, `cmd`, `permissive`, dan ekspresi `USING`/`WITH CHECK`
3. Grant tabel (`information_schema.role_table_grants`) — RLS tidak berlaku bila
   `SELECT` memang tak pernah di-grant, dan sebaliknya

Angka awal untuk dibandingkan, ukur ulang sendiri: **24 tabel** punya policy
`PERMISSIVE` / `ALL` / `USING true` untuk `authenticated`, dan **69 policy** menyebut
`anon`. Bandingkan dengan 887 akun di `auth.users` — "authenticated" di proyek bersama ini
bukan lingkaran kecil.

**Hasilkan satu klasifikasi tiga tingkat**, bukan daftar mentah:

| Tingkat | Arti |
|---|---|
| **Terbuka untuk anon** | tanpa login sama sekali |
| **Terbuka untuk siapa pun yang login** | 887 akun, lintas sistem |
| **Terkunci** | hanya `service_role` — seperti seluruh `crm_*` (nol policy, benar) |

Tandai mana yang memuat data pribadi atau sensitif menurut inventaris 3O. **Hitungan saja,
nol nilai contoh** — larangan 3O tetap berlaku penuh.

---

## TUGAS 2 — Perbaiki dokumen eskalasi, dan tandai apa yang berubah

`docs/ESKALASI-paparan-data-sensitif.md` harus diperbaiki hari ini juga.

- **Ganti pernyataan yang salah.** Bagian yang menyatakan `master_customer` aman dan
  masalahnya "di jalur sekeliling" harus diganti dengan keadaan sebenarnya.
- **Tulis perubahannya secara terbuka**, dengan tanggal: apa yang semula dinyatakan, apa
  yang ternyata benar, dan **kenapa terlewat** — karena ukurannya `relrowsecurity`, bukan
  policy. Jangan diam-diam menyunting. Siapa pun yang sudah membaca versi sebelumnya perlu
  tahu bahwa dasar keputusannya berubah.
- **Susun ulang urutan remediasinya.** `master_customer` memuat 82.253 orang dan terbuka
  untuk tulis; `cf_hyrox_participants` memuat 1.030 NIK dan terbuka untuk anon. Keduanya
  berat karena alasan berbeda — jelaskan bedanya alih-alih sekadar mengurutkan.
- **Sebutkan risiko perbaikannya dengan jujur.** Policy `authenticated_full_access` hampir
  pasti sengaja dibuat supaya aplikasi tim lain bisa jalan. Mencabutnya **akan memutus
  aplikasi itu** kecuali mereka pindah ke akses server-side lebih dulu. Itulah kenapa ini
  bukan perbaikan sepihak, dan itu harus tertulis — bukan supaya terdengar hati-hati, tapi
  supaya keputusannya diambil dengan gambaran yang benar.
- Naikkan ke `docs/riwayat/TEMUAN.md` dengan nomor T- berikutnya, dan silang-rujuk T-02.

---

## TUGAS 3 — Jadikan pelajarannya permanen

Kekeliruan ini punya bentuk yang jelas: **"RLS ON" dipakai sebagai sinonim "terlindungi".**
Itu akan terulang.

- Catat sebagai keputusan baru di `docs/riwayat/KEPUTUSAN.md`: klaim keamanan tabel hanya
  sah bila menyebut RLS **dan** policy **dan** grant. Menyebut salah satunya saja bukan
  jawaban.
- Catat juga di `docs/riwayat/TEMUAN.md` bagian kesalahan sendiri (`S-`): ukuran yang
  dipakai lebih sempit daripada klaim yang ditulis — **dan bahwa kehati-hatian di poin 8
  laporan 3O itu benar.** Keraguan yang ditulis lalu tidak ditindaklanjuti adalah pola yang
  layak dicatat; ini kali kedua jawabannya sudah ada di tempat yang sudah dilihat.
- Tambahkan kueri klasifikasi TUGAS 1 ke `docs/PASCA-MERGE-monitoring-revert.md` supaya
  bisa dijalankan ulang kapan saja. Policy bisa berubah tanpa ada yang memberi tahu tim ini
  — proyek ini dipakai bersama, dan 102 fungsi anon-exec sudah naik dari 101 dalam hitungan
  hari.

---

## TUGAS 4 — Periksa apakah asumsi ini bocor ke kode

Cari di seluruh repo — komentar, dokumen, nama variabel, pesan di layar — tempat mana pun
yang menyatakan atau menyiratkan bahwa `master_customer` atau `customer_engagement` hanya
bisa diakses lewat service role.

Komentar seperti *"RLS ON tanpa policy — anon key tidak bisa dan tidak boleh"* benar untuk
`crm_*` tetapi **salah** untuk kedua tabel itu. Perbaiki tiap kalimat yang keliru dan
sebutkan berapa yang kamu temukan. Komentar yang salah tentang keamanan akan dipercaya oleh
orang berikutnya justru karena ia terlihat sudah dipikirkan.

Ini pekerjaan teks, bukan perubahan perilaku. Masking, RBAC, dan audit di jalur aplikasi
tetap benar dan tetap perlu — ia melindungi jalur yang lewat aplikasi. Yang keliru adalah
keyakinan bahwa itu satu-satunya jalur.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan ubah, hapus, atau tambah policy apa pun | Mencabut `authenticated_full_access` akan memutus aplikasi tim lain |
| Jangan nyalakan atau matikan RLS di tabel mana pun | Fase 0; keputusan pemilik data |
| Jangan `SELECT` isi kolom sensitif | Larangan 3O tetap berlaku; hitungan saja |
| Jangan menyunting dokumen eskalasi diam-diam | Pembaca sebelumnya perlu tahu dasarnya berubah |
| Jangan `UPDATE`/`INSERT`/`DELETE` di `master_customer` atau `customer_engagement` | Read-only per desain — kini terbukti bukan karena database menahannya |
| Jangan buat migrasi, tabel, view, atau RPC | Nol perubahan skema |
| Jangan bangun pekerjaan prompt 3P di sprint ini | Sprint ini disela dan pendek; 3P tetap mengantre |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Klasifikasi akses** — tiga tingkat, jumlah tabel per tingkat, dan mana yang memuat
   data pribadi. Sebutkan angka yang kamu ukur sendiri untuk 24 policy `ALL`/`USING true`
   dan 69 policy `anon`
3. **Dokumen eskalasi** — apa yang diganti, bagaimana perubahannya ditandai, dan urutan
   remediasi yang baru
4. **Pelajaran permanen** — keputusan dan temuan yang dicatat, dan kueri monitoring
5. **Sapuan komentar** — berapa kalimat keliru yang ditemukan dan diperbaiki
6. **Yang masih menggantung**
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (265) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
