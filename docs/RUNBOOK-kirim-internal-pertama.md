# RUNBOOK — kirim internal pertama (TUGAS 3, dijalankan manusia)

**Kenapa manusia, bukan agen:** lingkungan agen tak punya rahasia runtime (`MAILTRAP_API_TOKEN`,
`SUPABASE_SERVICE_ROLE_KEY`, dll. semuanya **unset**) dan tak menjalankan app. Kirim nyata tak bisa
dipicu dari sana. Langkah + query verifikasi di bawah membuktikan seluruh rantai.

**Prasyarat aman:** `CAMPAIGN_SEND_ENABLED` **mati** (default) → gerbang kode hanya mengizinkan
alamat `@20fit.id`; alamat pelanggan ditahan. Token Mailtrap yang bocor **tetap belum boleh** dipakai
untuk kirim pelanggan — tapi uji internal ke `@20fit.id` aman.

> ## ⚠️ DEADLOCK yang ditemukan 24 Agu 2026 — kenapa composer TAK BISA dipakai untuk uji internal
> Diverifikasi ke DB langsung: **`master_customer` memuat 0 alamat `@20fit.id`** (staf bukan
> pelanggan). Segmen menarik penerima **hanya** dari `master_customer`, dan dengan kirim nyata mati
> gerbang **hanya** mengizinkan `@20fit.id`. Dua pengaman yang masing-masing benar, bersama-sama
> membuat "segmen berisi profil `@20fit.id`" **mustahil** — composer akan menampilkan 0 "Akan
> dikirimi". Karena itu uji internal dijalankan lewat **harness** di bawah, bukan composer.

## Langkah — via harness (panel "Uji kirim internal" di /campaigns, tampil saat kirim nyata mati)

1. **Set alamat tujuan di lingkungan:** `SEND_TEST_INTERNAL_ADDRESS=<alamat @20fit.id kamu>` di
   Railway (jangan hardcode; harness menolak alamat non-`@20fit.id` dan menolak jalan bila kirim
   nyata menyala). Redeploy agar variabelnya termuat.
2. **Buka /campaigns** (sebagai peran ber-izin kirim; kini `super_admin`). Selama `CAMPAIGN_SEND_ENABLED`
   mati, panel **"Uji kirim internal (pra-luncur)"** tampil di bawah composer.
3. **Tekan "Jalankan uji kirim internal".** Harness menyuntikkan satu penerima internal ke **engine,
   ports, audit, dan gerbang yang SAMA** dengan jalur produksi (template + segmen uji dibuat otomatis,
   run dibuka), lalu menampilkan artefak ketujuh butir langsung di layar.
4. **Uji unsubscribe:** buka email uji yang mendarat, klik tautan unsubscribe, lalu jalankan kueri
   `crm_suppression` di bawah (baris pertama tabel itu sejak sistem ada).
5. **Uji suppression-menang:** tekan tombol harness sekali lagi (run baru) — penerima yang sudah
   berhenti harus tercatat `skipped_suppressed`, bukan dikirimi.
6. **Bersihkan:** tombol "Bersihkan data uji" mengarsipkan segmen uji (soft-delete). Yang **permanen**
   (append-only, tak bisa dihapus): template uji (tersembunyi dari composer via kunci sentinel), plus
   baris `crm_message_log` / `crm_audit_log` / `crm_campaign_run` / `crm_suppression` hasil uji.

**Kenapa harness, bukan composer:** deadlock di atas. Harness memakai **jalur yang sama persis**
(lewat `sendCampaign`, hanya penerimanya yang disuntik) supaya yang terbukti adalah rantainya, bukan
implementasi kedua — pola satu-aturan-dua-implementasi itu sudah lima kali menggigit proyek ini.

## Verifikasi (jalankan di SQL editor, per butir TUGAS 3)

```sql
-- a. provider_message_id BENAR-BENAR terisi? (kontrak vs nilai nyata)
select status, provider_message_id, failure_cause, sent_at
from public.crm_message_log order by created_at desc limit 5;

-- b. status baris benar (sent / skipped_suppressed / failed dgn sebab)?  → kolom status di atas

-- c. tepat SATU baris audit campaign.sent per run?
select action, count(*), max(occurred_at)
from public.crm_audit_log where action = 'campaign.sent' group by action;

-- d/e. email sampai dari pengirim benar, tautan unsubscribe bekerja → cek kotak masuk internal,
--      klik tautan unsubscribe, lalu:
-- baris crm_suppression PERTAMA muncul? (0 sejak sistem ada)
select customer_id, channel, reason_code, source, created_at
from public.crm_suppression order by created_at desc limit 5;
```

## Yang harus dilaporkan (jangan perbaiki kegagalan diam-diam)

- `provider_message_id` **nilai nyatanya** (bukan null) — bila null, klien tak menerima id dari
  Mailtrap; itu temuan, laporkan.
- Apakah audit `campaign.sent` **tepat satu** (bukan nol, bukan dua).
- Apakah klik unsubscribe **benar-benar menulis** baris `crm_suppression` (uji ujung-ke-ujung
  jalur unsubscribe — kesempatan pertama sejak sistem ada).
- Kegagalan apa pun = temuan terpenting; laporkan penuh.

**Kirim ke alamat pelanggan tetap diblokir** sampai token Mailtrap dirotasi (dan SPF/DKIM/DMARC set).
