# RUNBOOK — kirim internal pertama (TUGAS 3, dijalankan manusia)

**Kenapa manusia, bukan agen:** lingkungan agen tak punya rahasia runtime (`MAILTRAP_API_TOKEN`,
`SUPABASE_SERVICE_ROLE_KEY`, dll. semuanya **unset**) dan tak menjalankan app. Kirim nyata tak bisa
dipicu dari sana. Langkah + query verifikasi di bawah membuktikan seluruh rantai.

**Prasyarat aman:** `CAMPAIGN_SEND_ENABLED` **mati** (default) → gerbang kode hanya mengizinkan
alamat `@20fit.id`; alamat pelanggan ditahan. Token Mailtrap yang bocor **tetap belum boleh** dipakai
untuk kirim pelanggan — tapi uji internal ke `@20fit.id` aman.

## Langkah

1. **Siapkan data uji** (sekali):
   - Pastikan ada minimal satu template email aktif yang memuat `{{unsubscribe_url}}` (Templates).
   - Di /segments, buat segmen kecil yang **hanya** mencocokkan satu/dua profil dengan email
     `@20fit.id` (mis. filter `email` + kota/unit yang mempersempit ke akun internal), lalu **Simpan
     segmen** (beri nama).
2. **Susun & kirim** di /campaigns: pilih segmen tersimpan → pilih template → **Lihat penerima**
   (periksa: Cocok / Punya email / Di-suppress / Akan dikirimi tampil) → **Kirim**.
   - Untuk uji nyata (bukan hanya tahan-pra-luncur), set `CAMPAIGN_SEND_ENABLED=true` **sementara**
     di Railway (hanya bila token sudah dirotasi; kalau belum, biarkan mati dan uji jalur "ditahan").

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
