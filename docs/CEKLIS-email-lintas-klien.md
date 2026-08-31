# Ceklis uji email lintas klien (untuk pemilik produk)

Pratinjau di peramban **tidak** setara klien email. Satu-satunya uji yang meyakinkan adalah **Send
test ke alamat nyata** (Campaigns → Kirim uji; jalur ini sudah terbukti bekerja). Masalah paling
berbahaya — **inversi mode gelap** — hanya muncul di klien sungguhan, tak pernah di pratinjau.

## Cara pakai
Kirim Send test ke satu alamat di tiap klien, lalu buka di tiap kombinasi di bawah. Butuh menit,
bukan jam. Lakukan **sebelum** kirim massal pertama dengan template atau perubahan template apa pun.

## Matriks (12 kombinasi)

| Klien | Mode | Perangkat | Yang wajib dilihat |
|---|---|---|---|
| **Gmail** | Terang | Ponsel (app) | Satu kolom, tak ada gulir samping, huruf ≥14px, tombol bisa diketuk |
| **Gmail** | Terang | Desktop (web) | Isi terpusat ~600px, jarak antar-bagian wajar (bukan renggang aneh) |
| **Gmail** | Gelap | Ponsel (app) | **Teks tetap terbaca** — bukan gelap di atas gelap; logo tak hilang |
| **Gmail** | Gelap | Desktop (web) | Sama; perhatikan latar yang dibalik Gmail |
| **Outlook** | Terang | Desktop | Lebar 600px dihormati (ghost table MSO), tombol tetap terlihat **tanpa** sudut membulat |
| **Outlook** | Gelap | Desktop | Inversi Outlook berbeda dari Gmail — cek keterbacaan |
| **Outlook** | Terang | Ponsel (app) | Satu kolom, gambar tak melebar |
| **Outlook** | Gelap | Ponsel (app) | Keterbacaan |
| **Apple Mail** | Terang | Ponsel (iOS) | Huruf ≥16px (di bawah itu iOS memperbesar sendiri & merusak tata letak) |
| **Apple Mail** | Gelap | Ponsel (iOS) | Inversi Apple berbeda lagi — cek teks & logo |
| **Apple Mail** | Terang | Desktop (macOS) | Terpusat, rapi |
| **Apple Mail** | Gelap | Desktop (macOS) | Keterbacaan |

## Yang paling sering rusak (perhatikan khusus)
- **Mode gelap → teks tak terbaca.** Kerangka bawaan CRM sudah **latar terang** justru karena
  inversi lebih dapat diduga. Kalau sebuah template memakai **latar gelap** (mis. `email_1787897773605`
  memakai `#0b0b0d`/`#141416`), ia **wajib** diuji di keenam kombinasi mode-gelap sebelum dipakai.
- **Gambar diblokir.** Banyak klien tak memuat gambar sampai diizinkan — pastikan tiap gambar punya
  `alt` bermakna, dan pesan tetap masuk akal tanpa gambar.
- **Outlook mengabaikan `border-radius`.** Tombol harus tetap layak sebagai kotak persegi.
- **Gmail memotong ~102 KB.** Ukur ukuran HTML; kalau mendekati, ringkas. Tautan unsubscribe harus
  jauh sebelum titik potong. (Template kini ~19 KB — aman.)

## Kalau ada yang rusak
Jangan tebak dari screenshot. Laporkan **klien + mode + perangkat + apa yang terlihat**, lalu template
diperbaiki dan di-Send-test ulang. Template berversi: perbaikan = versi baru, yang lama tetap terlihat
apa adanya.
