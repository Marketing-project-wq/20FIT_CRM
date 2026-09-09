-- ============================================================================================
-- crm_message_template: kolom sender_name (nama pengirim per-template) — 9 Sep 2026.
-- T-74 / K-65. Nama pengirim dulu di-hardcode "20FIT CRM" di lib/email/mailtrap.ts dan diwarisi
-- diam-diam oleh jalur kampanye yang dibangun di atas fungsi kirim email reset. Kolom ini memberi
-- kampanye nama pengirimnya sendiri; jalur reset tetap memakai default fungsi ("20FIT CRM").
--
-- ADITIF & nullable: baris lama (template yang sudah ada) tetap NULL → jalur kirim jatuh ke default
-- "20FIT CRM", jadi tak ada perubahan perilaku untuk template lama sampai operator menyetel nama.
-- Tabel ini append-only (versi baru = INSERT baru); menambah kolom nullable tak menyentuh baris/
-- versi mana pun yang sudah ada.
--
-- Batas panjang + pembersihan (baris baru/spasi berlebih) DITEGAKKAN DI RUTE (POST /api/templates),
-- jalur tulis satu-satunya ke tabel ini (service_role) — pola "tolak di jalur tulis, bukan hanya di
-- input" yang sama dengan cap full_name/city di crm_update_master_fields (di sana jalur tulisnya RPC;
-- di sini rute). Divalidasi lewat helper bersama lib/email/sender-name.ts (MAX_SENDER_NAME), dan
-- dibersihkan defensif sekali lagi tepat sebelum kawat di lib/email/mailtrap.ts.
-- ============================================================================================
alter table public.crm_message_template
  add column if not exists sender_name text;
