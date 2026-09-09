# RUNBOOK — Pindah penyedia email CRM ke Resend

> ## ⏱ DIUKUR: 9 September 2026
> Angka kuota bersama (≈50.000/bulan, ≈550/hari baseline), plafon CRM (1.000/hari), dan ukuran audiens
> (890 ISS, 3.371 event) **berasal dari pemilik** per 9 Sep 2026 — BUKAN diukur dari kode/DB oleh saya.
> Kuota Resend berubah saat perpanjangan 10 Sep; **cek dasbor Resend untuk angka terkini** sebelum
> kiriman besar.

Status: **siap, belum dijalankan.** Peralihan adalah SATU sakelar env (`EMAIL_PROVIDER`), rollback juga
satu sakelar, tanpa deploy kode. Ikuti urut. Jangan lompat ke langkah 7 sebelum 5–6 hijau.

> ⚠️ **PERINGATAN — KUOTA DIBAGI.** Akun Resend `20fit.id` dipakai bersama **delapan sistem 20FIT lain**
> (konfirmasi tiket, struk POS, atur ulang kata sandi, dll.) pada **satu kuota bulanan** (≈50.000, angka
> dari pemilik per 9 Sep, perpanjangan 10 Sep — cek dasbor Resend untuk angka terkini). Resend **tidak
> punya batas harian** — plafon CRM (`crm_send_config.daily_limit`) adalah satu-satunya rem. **Beri tahu
> tim lain sebelum kiriman besar pertama.** Kampanye CRM yang lepas kendali tidak melukai dirinya sendiri
> saja — ia bisa menghabiskan kuota yang dipakai konfirmasi tiket pelanggan. (Lihat TEMUAN T-75.)

## Prasyarat (sudah beres di kode ronde ini)

- Penghitung plafon dihitung dari `sent_at` (T-43/T-44) — rem tak lagi bocor lintas-run.
- Adaptor Resend + sakelar `EMAIL_PROVIDER` + rute webhook Resend + verifikasi tanda tangan — ada, diuji.
- `send-run.ts` (mesin kirim) **tidak berubah** — peralihan murni di lapisan port.

## Langkah

1. **Verifikasi domain `20fit.id` di Resend.** Di dasbor Resend → Domains, pastikan `20fit.id`
   **Verified** (SPF/DKIM/DMARC hijau). Tanpa ini, kiriman dari `info@20fit.id` ditolak.
   **JANGAN hapus catatan DNS Mailtrap** — jalur reset + rollback masih memakainya.

2. **Isi env di Railway, `EMAIL_PROVIDER` masih `mailtrap`:**
   - `RESEND_API_KEY` = kunci `CRM` (izin Sending) dari Resend. **Jangan pakai ulang nama variabel
     Mailtrap.**
   - `RESEND_FROM` = `info@20fit.id` (alamat pengirim kampanye baru — lihat catatan alamat di bawah).
   - `RESEND_WEBHOOK_SECRET` = signing secret Svix dari endpoint webhook Resend (`whsec_…`).
   - `MAILTRAP_*` **tetap terisi** (reset + rollback bergantung padanya; `MAILTRAP_FROM` tetap
     `crm@20fit.id`).

3. **Deploy — NOL perubahan perilaku.** `EMAIL_PROVIDER` masih `mailtrap`, jadi semua kirim tetap lewat
   Mailtrap. Ini hanya menaruh kredensial Resend di tempatnya. Pre-cek env kini sadar-penyedia: pada
   `mailtrap` ia memeriksa var Mailtrap (TAMBAHAN B).

4. **Ubah `EMAIL_PROVIDER=resend`, redeploy.** Mulai titik ini, kirim lewat Resend dari `info@20fit.id`.
   Pratinjau template kini menampilkan `info@20fit.id` (dibaca dari server, bukan hardcode — TAMBAHAN A).

5. **Uji kirim ke LIMA alamat internal `@20fit.id` dulu** (Campaigns → Kirim uji). Jangan ke pelanggan.

6. **Periksa hasil uji:**
   - `crm_message_log.provider_message_id` **terisi** (id Resend, bukan null).
   - Event webhook masuk (`/api/resend/webhook` menerima; cek log).
   - Status berpindah `sent → delivered`.
   - `failure_cause` **nol `unknown`** (kalau ada `unknown`, `THROTTLE_STATUSES`/pemetaan perlu ditinjau
     — lihat TEMUAN T-75 §THROTTLE).

7. **Baru kampanye nyata.** **Kiriman nyata pertama sebaiknya 890 peserta ISS**, bukan 3.371 audiens
   event — mereka baru mendaftar, mengenali 20FIT, menunggu info wave: buka tinggi, keluhan hampir nol.
   Naikkan setelah melihat angka bounce & keluhan beberapa hari. (Alasan reputasi domain di bawah.)

8. **Rollback (kapan saja):** kembalikan `EMAIL_PROVIDER=mailtrap`, redeploy. **Nol perubahan kode.**
   Detik, bukan menit. Ini sebabnya peralihan dibuat sebagai sakelar, bukan penggantian.

## Catatan alamat pengirim baru (`crm@` → `info@`) — konsekuensi yang harus disebut

Alamat pengirim kampanye berubah dari `crm@20fit.id` ke **`info@20fit.id`** bersamaan peralihan. Empat
konsekuensi:

1. **Balasan pergi ke `info@20fit.id`.** Email kampanye selalu memancing balasan ("berhenti kirim",
   "kapan acaranya", "salah nama saya"). **Pastikan ada yang membaca kotak `info@` SEBELUM kiriman besar
   pertama.** Balasan tak terbaca adalah cara tercepat kehilangan kepercayaan yang baru dibangun.
2. **Tautan berhenti berlangganan TIDAK terpengaruh** — ia lewat `crm.20fit.id` (host aplikasi), bukan
   alamat email. Tak perlu ikut diubah.
3. **Rollback mengembalikan alamat juga.** `EMAIL_PROVIDER=mailtrap` berarti kembali ke `crm@20fit.id`.
   Penerima yang melihat `info@` lalu `crm@` di dua email berurutan akan bingung — ini konsekuensi
   rollback yang diketahui, bukan kejutan.
4. **Reputasi domain milik bersama.** `20fit.id` sudah terverifikasi ~dua bulan; reputasinya dibangun
   delapan sistem transaksional (email yang diminta & dibuka). Kampanye pemasaran berperilaku beda: buka
   lebih rendah, keluhan lebih tinggi. Kalau kampanye CRM menghasilkan banyak keluhan, yang ikut turun
   bukan hanya kampanyenya — **konfirmasi tiket pelanggan bisa mulai masuk spam.** Karena itu langkah 7
   memulai dari 890 ISS, bukan 3.371.

## Rute Mailtrap TETAP HIDUP — jangan hapus ronde ini

Rute `/api/mailtrap/webhook` **tidak dihapus**. Email yang sudah dikirim lewat Mailtrap akan terus
mengirim event `delivered`/`bounced` berhari-hari; mematikan rutenya berarti status itu hilang selamanya
dan CRM menampilkan `sent` selamanya. **Boleh dihapus hanya setelah nol baris `crm_message_log` berstatus
`sent` yang dikirim lewat Mailtrap** (kondisi ditulis di kepala `app/api/resend/webhook/route.ts`).
