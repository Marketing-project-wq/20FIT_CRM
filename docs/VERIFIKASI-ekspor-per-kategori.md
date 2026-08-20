# Verifikasi Ekspor per Kategori — untuk Pemilik Produk

> **Kenapa dokumen ini ada.** Ekspor nyata pertama (20 Agu 2026 04:13 UTC) menghasilkan berkas
> yang **terputus**: blok provenans + baris judul kolom, lalu berhenti — nol baris data, tanpa
> baris penutup `total_baris=`. Sebabnya sudah ditemukan dan diperbaiki (lihat catatan di bawah).
> Yang **belum** terbukti adalah jalur unduh sungguhan di balik login — sandbox tak punya sesi
> login, jadi hanya Anda yang bisa membuktikannya. Ikuti langkah singkat ini sekali.

---

## Yang sudah diperbaiki (ringkas)

- **Sebab:** jalur **hitung** memilih kolom `customer_id` saja; jalur **ambil-baris** memilih
  semua kolom ekspor — dan daftar kolom menyebut `phone`, kolom yang **tidak ada** di
  `master_customer` (yang ada `phone_normalized`). Jadi hitung berhasil, ambil-baris melempar
  galat *setelah* HTTP 200 + judul terkirim → berkas terpotong tanpa status galat. Hanya jalur
  hitung yang pernah diuji, jadi selisih ini tak terlihat.
- **Perbaikan:** kolom diarahkan ke `phone_normalized`; ada test yang menjalankan **kedua** jalur
  untuk keempat kategori dan gagal kalau keduanya menyimpang lagi.
- **Kalau gagal lagi, berkas mengumumkan diri:** bila streaming putus di tengah, berkas kini
  menulis baris penanda `# GAGAL: ekspor terputus, jangan pakai berkas ini` sebelum berhenti,
  dan sebabnya tercatat di log (tanpa PII). Berkas lengkap **selalu** berakhir dengan
  `# EOF total_baris=<jumlah>` — tak ada baris itu = jangan dipakai.
- **Excel-ramah:** berkas kini diawali UTF-8 BOM (tanda `—` tak lagi jadi `â€"`), dan baris
  `# kriteria:` menuliskan kategori sebenarnya ("punya email DAN punya telepon", dst.).

---

## Langkah verifikasi (sekali, ~2 menit)

Pakai kategori tercepat: **punya email TANPA telepon** (email-only). Jumlah barisnya **638**
(dikonfirmasi ke DB) — cukup kecil untuk selesai seketika, cukup besar untuk membuktikan baris
data benar-benar mengalir.

1. **Masuk** ke CRM sebagai `super_admin` atau `crm_manager` (peran yang berhak ekspor).
2. Buka **Dashboard**. Di blok cakupan kontak, klik tombol ekspor **"email saja"**
   (label "punya email, tanpa telepon").
3. Berkas `segmen-2026-08-20.csv` (atau tanggal hari itu) akan terunduh. **Buka dengan editor
   teks** (bukan langsung Excel dulu), lalu periksa **tiga** hal:
   - **Baris pertama** diawali blok `#` provenans, dan baris `# kriteria:` menyebut
     kategori email-only (bukan "filter lanjutan" generik).
   - Ada **baris data** setelah judul kolom `customer_id,nama,email,telepon,kota,...` —
     kolom `telepon` **kosong** untuk kategori ini (itu benar: email saja).
   - **Baris terakhir** berbunyi persis: `# EOF total_baris=638`.
   Kalau baris terakhir hilang, atau muncul `# GAGAL: ekspor terputus…`, **berhenti** — berkas
   tak lengkap; laporkan (sebab sudah tercatat di log server).
4. Buka juga di **Excel** sekali untuk memastikan tak ada karakter aneh (mojibake) di nama/kota.

---

## Konfirmasi jejak audit (SQL, opsional tapi disarankan)

Setiap ekspor lengkap menulis **satu** baris `export.performed` **setelah** streaming, dengan
jumlah baris nyata. Jalankan ini tak lama setelah unduh:

```sql
select
  actor_email,
  occurred_at,
  (metadata->>'row_count')::int as row_count,
  metadata->'columns'          as columns,
  metadata->>'suppression_excluded' as suppression_excluded
from crm_audit_log
where action = 'export.performed'
order by occurred_at desc
limit 5;
```

Harapan:
- **Tepat satu** baris baru untuk unduhan Anda (satu unduh = satu baris; bukan nol, bukan dua).
- `row_count` = **638**, sama persis dengan `# EOF total_baris=638` di berkas.
- `columns` **tidak** memuat NIK / tanggal lahir / data klinis (hanya kolom kontak & atribut).
- `suppression_excluded` = `true`.

Kalau `row_count` di audit **tidak** sama dengan angka EOF di berkas, hentikan pemakaian berkas
dan laporkan — itu tanda jalur hitung dan jalur baris menyimpang lagi (justru yang test baru
jaga agar tak terjadi diam-diam).

---

## Kategori lain (untuk referensi)

| Kategori | Kriteria | Jumlah baris (per DB) |
|---|---|---|
| Punya email **dan** telepon | `hasEmail AND hasPhone` | 80.999 |
| **Email saja** (uji ini) | `hasEmail AND noPhone` | **638** |
| **Telepon saja** | `hasPhone AND noEmail` | 616 |
| Tak keduanya | `noPhone AND noEmail` | 0 (tombol nonaktif) |

Kategori "punya email dan telepon" (80.999 baris) adalah ekspor besar sungguhan; kueri hitungnya
terukur ~48 ms, dan streaming ~80 halaman. Uji itu **setelah** email-only lolos, kalau Anda ingin
bukti skala penuh.
