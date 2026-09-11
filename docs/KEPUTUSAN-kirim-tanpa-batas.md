# KEPUTUSAN — kirim tanpa batas, tanpa jam tunggu

> ## ⏱ DIUKUR: 11 September 2026, 08:40 UTC
> **Asal tiap angka, supaya tak ada yang dikira hasil pengukuran padahal bukan:**
> - Nilai konfigurasi (1.000/hari, 300 workflow, 500 ms, DRAIN_BATCH 200, tick 5 menit) **dibaca
>   langsung dari kode** pada tanggal ini, sebelum diubah.
> - `CAMPAIGN_SEND_ENABLED=true` dan `EMAIL_PROVIDER=resend` **dibaca dari env Railway produksi**
>   pada tanggal ini.
> - Kuota Resend **≈50.000/bulan**, audiens **890 ISS** dan **3.371 event** berasal dari **pemilik**
>   (per 9 Sep 2026, lewat `RUNBOOK-pindah-resend.md`) — **tidak** saya ukur ulang. Kuota berubah saat
>   perpanjangan 10 Sep; **cek dasbor Resend untuk angka terkini.**
> - Batas Resend **10 permintaan/detik per tim** dan **batch maks 100** dari dokumentasi Resend,
>   dibaca pada tanggal ini.
> - Angka **18.243 baris / plafon 1.000** pada 3 Sep dikutip dari `ESKALASI-plafon-kirim.md`.

**Tanggal:** 11 September 2026. **Pemutus:** pemilik produk. **Status:** DIPUTUSKAN dan DIBANGUN.

Dokumen ini menutup `docs/ESKALASI-plafon-kirim.md` (yang menunggu keputusan sejak 3 Sep) dan
mengubah arah `docs/RENCANA-batas-kirim.md`.

---

## 1. Keputusan

> CRM **tidak boleh memasang plafon sendiri**. Kampanye berukuran berapa pun harus terkirim sekaligus:
> tanpa plafon harian, tanpa jeda antar-email, dan tanpa klik "Lanjutkan" dari manusia.

Instruksi pemilik, dikutip apa adanya:

> "ini jangan lu yang membatasi yah, dari sistemnya CRM biarkan saja kirim unlimited, perihal resend
> kan kalau habis bisa di upgrade, lu jangan membatasi yah."

Artinya: bila kuota Resend habis, jawabannya **menaikkan paket Resend**, bukan memperlambat CRM.

## 2. Risiko yang diterima secara sadar

Plafon lama ada karena dua alasan nyata. Keduanya **tidak hilang** — pemilik memilih menanggungnya.

1. **Kuota Resend adalah kolam bersama.** Akun `20fit.id` dipakai delapan sistem 20FIT lain
   (konfirmasi tiket, struk POS, reset kata sandi, dll.) pada SATU kuota bulanan (~50.000 per angka
   pemilik, 9 Sep), dan Resend tidak menerapkan batas harian per-kunci. Tanpa plafon aplikasi, satu
   kampanye besar **bisa menghabiskan kuota yang diandalkan konfirmasi tiket pelanggan.**
   → Mitigasi yang dipilih pemilik: pantau dasbor Resend, naikkan paket bila perlu.
2. **Reputasi domain dipakai bersama.** `20fit.id` dibangun oleh email transaksional (diminta,
   dibuka). Kampanye pemasaran berperilaku beda — buka lebih rendah, keluhan lebih tinggi. Lonjakan
   keluhan tidak hanya menjatuhkan kampanye; **konfirmasi tiket bisa ikut masuk spam.**

> **Saran operasional yang TETAP berlaku** (saran, bukan pagar): kiriman besar pertama sebaiknya ke
> segmen paling hangat (890 peserta ISS), bukan 3.371 audiens event — lihat
> `docs/RUNBOOK-pindah-resend.md` langkah 7. Sistem tidak lagi memaksakan ini.

## 3. Yang DICABUT vs yang DIPERTAHANKAN

Yang dicabut adalah plafon **VOLUME**. Pengaman **KERUSAKAN** sengaja dibiarkan hidup.

| Rem | Dulu | Sekarang |
|---|---|---|
| Plafon harian (`daily_limit`) | 1.000/hari | **tanpa batas** (sentinel 2e9) |
| Sub-cap workflow | 300/hari | **tanpa batas** |
| Jeda antar-email (`interRecipientDelayMs`) | 500 ms (≈2 email/detik) | **0** |
| Batas per-tick (`DRAIN_BATCH`) | 200 | **50.000** (unit pemulihan crash, bukan kebijakan volume) |
| Tick pg_cron | tiap 5 menit | **tiap menit** |
| Lanjut setelah plafon | **tunggu klik manusia** | **lanjut otomatis** |
| Auto-stop bounce 5% | aktif | **tetap aktif** |
| Auto-stop 20 gagal beruntun | aktif | **tetap aktif** |
| Backoff 429/503 | aktif | **tetap aktif** |
| Suppression / unsubscribe / idempotency | aktif | **tetap aktif, tak tersentuh** |

Backoff tetap ada karena ia **bukan jeda yang kita pilih** — itu provider menyuruh kita berhenti.

## 4. Perubahan teknis pendukung

- **Batch Resend.** `POST /emails/batch`, 100 email per permintaan. Selain ~100× lebih cepat, ini juga
  yang paling sopan: batas Resend adalah 10 **permintaan**/detik untuk SELURUH tim — dibagi delapan
  sistem tadi. Batching menaikkan throughput email tanpa menambah tekanan pada anggaran permintaan itu.
- **Satu alamat buruk tidak menjatuhkan 99 lainnya.** Resend memvalidasi batch secara utuh, jadi satu
  alamat cacat menolak seluruh permintaan. Mesin kirim menangkap penolakan tingkat-penerima lalu
  **mengirim ulang chunk itu satu per satu**, sehingga hanya pelakunya yang gagal.
- **T-43 diperbaiki.** `budget--` dipindah dari jalur sukses ke jalur percobaan. Ini opsi (b) di
  `ESKALASI-plafon-kirim.md`: bila seseorang memasang plafon berhingga lagi, angka itu kini berarti
  **percobaan**, bukan keberhasilan. (Dengan plafon tanpa batas, perbaikan ini tak terasa — tapi
  bugnya nyata dan sudah ditutup.)
- **"Paused" tak lagi berarti menunggu orang.** Bila operator sengaja memasang plafon berhingga,
  run berhenti sampai tengah malam WIB lalu **lanjut sendiri** pada tick berikutnya.

## 5. Yang perlu diawasi setelah ini

1. **Dasbor Resend** — sisa kuota. Ini satu-satunya plafon yang tersisa, dan CRM tidak lagi menahannya.
2. **Angka bounce/keluhan kampanye pertama** — auto-stop 5% adalah jaring terakhir, bukan pengganti
   melihat hasilnya.
3. **Kotak `info@20fit.id`** — balasan kampanye masuk ke sana (lihat RUNBOOK-pindah-resend).

## 6. Cara memasang plafon kembali

Settings → Batas kirim → isi angka berhingga → Simpan. Tak perlu deploy. Auto-continue lintas hari
tetap berlaku, jadi memasang plafon memperlambat kampanye — **tidak** mengembalikan klik manual.
