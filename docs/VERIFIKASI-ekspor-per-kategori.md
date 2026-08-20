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
3. Berkas terunduh dengan nama berpola **`segmen-<kategori>-YYYY-MM-DD-HHMM.csv`**
   (mis. `segmen-punya-email-dan-tanpa-telepon-2026-08-20-0413.csv`). Jam (UTC) di nama membuat
   beberapa unduhan di hari sama tak lagi jadi `(1)`, `(2)`. **Buka dengan editor teks** dulu,
   lalu periksa:
   - **Baris pertama** diawali blok `#` provenans; baris `# kriteria:` menyebut kategori
     sebenarnya (bukan "filter lanjutan" generik).
   - Judul kolom untuk email-only berbunyi `customer_id,nama,email,kota,unit_pertama,segment,lifetime_value`
     — **kolom `telepon` tidak ada** (dijamin kosong untuk kategori ini, jadi dibuang). Sebaliknya
     "telepon saja" tak memuat kolom `email`, dan **tak satu pun alamat email** muncul di berkasnya.
   - **Baris terakhir** berbunyi persis: `# EOF total_baris=638`.
   Kalau baris terakhir hilang, atau muncul `# GAGAL: ekspor terputus…`, **berhenti** — berkas
   tak lengkap; laporkan (sebab sudah tercatat di log server).
4. Buka juga di **Excel** dan periksa dua hal: tak ada karakter aneh (mojibake) di nama/kota, dan
   (di kategori yang berkolom telepon, mis. "punya email dan telepon") **nomor telepon terbaca
   penuh sebagai teks** — bukan `6,28111E+11`. Nomor ditulis dalam bentuk `="628…"` supaya Excel
   membacanya sebagai teks; lihat catatan trade-off di bawah bila berkas ini akan diunggah ke
   alat lain.

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

---

## Catatan format nomor telepon (trade-off, sengaja)

Nomor telepon ditulis sebagai **teks Excel** dalam bentuk `="628…"`. Alasannya: tanpa itu Excel
memperlakukan deret 12–13 digit sebagai bilangan dan menampilkannya `6,28111E+11` — tak terbaca
staf, padahal ekspor ini justru untuk menelepon orang.

**Konsekuensi yang harus diketahui:** sebuah alat yang menerima CSV ini tetapi **tidak**
mengevaluasi formula (mis. pengunggah kampanye WhatsApp/SMS) akan melihat literal `="628…"` dan
harus **melepas pembungkus `="` dan `"`** untuk mendapatkan nomor mentah `628…`. Jadi:

- **Untuk dibaca staf di Excel** → apa adanya, sudah benar.
- **Untuk diunggah ke alat lain** → minta operator strip `="` dan `"` (satu find-replace), atau
  minta ekspor bentuk mentah bila alat itu jadi konsumen tetap (belum dibangun — satu jalur ekspor
  saja untuk saat ini).

Nama/email/kota **tidak** dibungkus begini — hanya nomor telepon (nilai digit terkontrol sistem),
supaya pagar anti-injeksi-formula untuk teks bebas tetap utuh.
