# RENCANA — batas kirim & prasyarat pengiriman pertama

Contacting-half TUGAS 1. **Belum ada pengiriman yang dibangun**; ini rencana + rekomendasi.
Alasannya **reputasi domain**, bukan kuota Mailtrap.

## Dua prasyarat yang MEMBLOKIR pengiriman pertama

Dinaikkan ke **bagian memblokir** di `MENUNGGU-TINDAKAN-MANUSIA.md`:

1. **Rotasi `MAILTRAP_API_TOKEN`** — token yang bocor lewat screenshot belum dirotasi. Selama
   belum, siapa pun yang melihat screenshot bisa mengirim atas nama `20fit.id`.
2. **SPF, DKIM, DMARC untuk `20fit.id`** — belum diatur. Tanpa ini, kampanye pertama mendarat di
   Spam massal, dan **volume besar dari domain tanpa riwayat merusak reputasinya untuk seterusnya**
   — termasuk email reset kata sandi yang sudah berjalan.

**Nol email kampanye boleh dikirim sebelum keduanya beres** (LARANGAN).

## Batas yang direkomendasikan (dikonfigurasi di tingkat sistem)

| Aturan | Angka | Kenapa |
|---|---|---|
| **Batas harian sistem** | mulai **1.000/hari**, bisa dikonfigurasi | Plafon aman; paket Mailtrap boleh lebih besar, tapi mengirim sebanyak plafon di hari pertama merusak reputasi |
| **Ramp domain baru** | ~200 hari-1, ×2 tiap ~2 hari sampai batas paket | Mencapai seluruh 82.253 ≈ **3 minggu** — itu memang seharusnya, bukan hambatan. Domain baru harus "memanaskan" reputasi bertahap |
| **Konfirmasi > 500 penerima** | dialog terpisah dari tombol kirim | Bukan soal kuota; mencegah seseorang memilih "semua" lalu menekan kirim tanpa sadar skalanya |
| **Auto-stop bila bounce > ambang** | ambang **5%** hard bounce (usulan, dikonfigurasi) | Kampanye yang terus mengirim ke daftar yang banyak memantul merusak domain lebih cepat daripada apa pun. Berhenti otomatis, laporkan, jangan lanjut |

**Ramp/step (contoh):** 200 → 400 → 800 → 1.600 → 3.200 → 6.400 → 12.800 → 25.600 → 51.200 →
82.253. Setiap langkah tahan ~2 hari; naik hanya bila bounce & komplain di bawah ambang.

## Apa yang terjadi bila dilanggar

- **> batas harian:** sisa antre ke hari berikutnya (bukan ditolak diam-diam) — kampanye besar
  butuh antrean; itu konsekuensi batas ini, bukan bug.
- **> ambang bounce:** kampanye berhenti otomatis, status "dihentikan: bounce tinggi", butuh
  tinjauan manusia sebelum dilanjut. Daftar dibersihkan (bounce keras → `crm_suppression` reason
  `bounce`) sebelum kirim ulang.
- **Konfirmasi > 500 dilewati:** tak bisa — tombol kirim untuk > 500 penerima tak aktif sampai
  konfirmasi kedua ditekan.

## Yang butuh pemilik produk

- **Batas paket Mailtrap** (email/hari) — dicek di akun; batas SISTEM tetap perlu ada terlepas dari
  itu (paket 50.000/hari ≠ boleh 50.000 di hari-1).
- Ambang bounce final (usulan 5%) dan angka ramp final.
