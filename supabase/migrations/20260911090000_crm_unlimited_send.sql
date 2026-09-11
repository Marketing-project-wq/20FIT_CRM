-- MIGRASI · Kirim tanpa plafon + eksekutor tiap menit (keputusan pemilik, 11 September 2026)
--
-- KEPUTUSAN PEMILIK, BUKAN KEPUTUSAN AGEN. Pemilik meminta CRM dapat mengirim kampanye dengan
-- UKURAN BERAPA PUN tanpa jeda tunggu dan tanpa klik manual, dan secara eksplisit menerima dua risiko
-- yang selama ini dijaga oleh plafon ini:
--   1. Reputasi domain 20fit.id dipakai bersama delapan sistem transaksional (konfirmasi tiket, struk
--      POS, reset kata sandi). Lonjakan keluhan menyeret mereka juga.
--   2. Kuota bulanan Resend (~50.000) adalah SATU kolam bersama delapan sistem itu, dan Resend tidak
--      punya batas harian — plafon aplikasi inilah satu-satunya rem. Pemilik memilih menaikkan paket
--      Resend bila kuota habis, bukan menahan laju dari sisi CRM.
--
-- YANG TIDAK DICABUT: auto-stop bounce 5% dan auto-stop 20-gagal-beruntun tetap aktif di mesin kirim.
-- Yang dicabut hanyalah plafon VOLUME, bukan pengaman KERUSAKAN.
--
-- Rujukan: docs/ESKALASI-plafon-kirim.md (opsi b dipilih), docs/RENCANA-batas-kirim.md.

-- ── §1 · Plafon menjadi "tanpa batas" ────────────────────────────────────────────────────────
-- 2.000.000.000 adalah sentinel UNLIMITED_DAILY_LIMIT di lib/crm/send-limits.ts. Sengaja bilangan
-- berhingga, bukan NULL dan bukan angka maksimum int4: ia harus tetap lolos check constraint
-- daily_limit > 0 dan workflow_daily_cap <= daily_limit, dan tetap muat di kolom integer (maks
-- 2.147.483.647) tanpa risiko overflow saat dibandingkan/dikurangi di kode.
--
-- JANGAN ganti nilai ini tanpa mengganti UNLIMITED_DAILY_LIMIT juga — kode membaca "tak terbatas"
-- sebagai ">= sentinel", jadi dua sisi harus sepakat pada angka yang sama.
alter table public.crm_send_config
  alter column daily_limit        set default 2000000000,
  alter column workflow_daily_cap set default 2000000000;

update public.crm_send_config
   set daily_limit        = 2000000000,
       workflow_daily_cap = 2000000000,
       updated_by         = 'migration:unlimited-send-20260911',
       updated_at         = now()
 where id = true;

comment on table public.crm_send_config is
  'Singleton send-limit config: daily_limit (system daily ceiling) + workflow_daily_cap (sub-cap for '
  'automated workflow sends, must be <= daily_limit). Editable by Super Admin, audited. Sejak '
  '11 Sep 2026 keduanya default UNLIMITED (2e9 = sentinel UNLIMITED_DAILY_LIMIT di send-limits.ts) '
  'atas keputusan pemilik; mesin kirim memperlakukan nilai >= sentinel sebagai tanpa plafon dan '
  'melewati pembacaan penghitung harian sepenuhnya.';

-- ── §2 · Eksekutor pg_cron: tiap 5 menit → TIAP MENIT ────────────────────────────────────────
-- Tick adalah satu-satunya hal yang menentukan seberapa cepat sebuah run dilanjutkan setelah batch
-- sebelumnya. Pada 5 menit, run besar yang melewati DRAIN_BATCH menunggu 5 menit sia-sia; pada 1
-- menit, kelanjutannya praktis seketika.
--
-- MEMAKAI cron.alter_job, BUKAN unschedule+schedule ulang. Alasannya penting: perintah job memuat
-- SCHEDULED_SEND_CRON_SECRET secara harfiah. Menjadwal ulang berarti menuliskan kembali rahasia itu
-- ke dalam berkas migrasi yang masuk git — persis cara rahasia tersebut bocor pertama kali. alter_job
-- hanya mengubah jadwal dan membiarkan perintah (beserta rahasianya) utuh di database.
--
-- Idempoten dan aman bila job belum ada (mis. database segar yang belum menjalankan migrasi 31):
-- blok ini tidak melakukan apa-apa, dan migrasi 31 akan membuatnya dengan jadwal aslinya.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'crm-run-scheduled-sends';
  if jid is not null then
    perform cron.alter_job(jid, schedule := '* * * * *');
  end if;
end $$;
