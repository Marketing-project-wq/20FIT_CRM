# RENCANA — id instans kampanye (kirim ulang disengaja) — DIUSULKAN, BELUM DIBANGUN

## Masalah

`campaignId` sekarang = **`{segment}:{template}`** (lihat `sendCampaignAction`). Karena
`idempotency_key = {campaignId}:{customer}:{channel}` bersifat deterministik, **menjalankan ulang =
resume**: penerima yang sudah terkirim dilewati. Itu tepat untuk kampanye satu-tembak (dan itulah
yang membuat segmen > jatah harian bisa selesai lintas hari). **Tapi** newsletter berkala tak akan
pernah bisa dikirim **dua kali** ke orang yang sama — pengiriman kedua dilewati sebagai "sudah
terkirim".

## Usulan: tambahkan dimensi INSTANS

```
campaignId      = {segment}:{template}:{instance}
idempotency_key = {campaignId}:{customer}:{channel}
                = {segment}:{template}:{instance}:{customer}:{channel}
```

**Invarian yang harus dijaga:** `instance` **STABIL sepanjang hidup satu terbitan** (bukan acak
per percobaan). Dari sini dua sifat sekaligus:

- **Resume tetap bekerja DI DALAM satu instans.** Instans sama → kunci sama → penerima yang sudah
  terkirim dilewati. Newsletter #7 yang putus di baris 6.000 dilanjutkan tanpa kirim ganda.
- **Kirim ulang disengaja jadi mungkin ANTAR instans.** Instans baru → `campaignId` baru → kunci
  baru → orang yang sama boleh dikirimi lagi (terbitan berikutnya).

> Kalau `instance` dibuat acak **per percobaan**, resume rusak (tiap percobaan jadi instans baru →
> kirim ganda). Itu larangan yang sama dengan `idempotency_key` acak (K-38 koreksi 2).

## Bentuk `instance` — tiga pilihan

| Pilihan | Instans = | Resume | Kirim ulang | Biaya |
|---|---|---|---|---|
| A. Cap tanggal `YYYYMMDD` | satu per hari per (segmen,template) | ✓ dalam hari | ✓ hari lain | murah, tanpa tabel; tak bisa 2× sehari |
| B. **Baris run (uuid)** — **disarankan** | satu "terbitan" eksplisit | ✓ dalam run | ✓ run baru | perlu tabel + pilihan "resume/mulai baru" |
| C. Penghitung `#1,#2,…` per (segmen,template) | nomor terbitan | ✓ | ✓ | perlu simpan penghitung; balapan saat konkuren |

**Disarankan B.** Composer menawarkan **"lanjutkan run X (sudah N terkirim)"** atau **"mulai run
baru"**; run baru membuat satu baris identitas → `instance` = uuid-nya, stabil. Ini yang paling
jujur untuk newsletter (tiap terbitan punya identitas + jejaknya) dan menjaga kedua sifat di atas.

### SQL sketsa (BELUM dibangun)

```sql
create table if not exists public.crm_campaign_run (
  id           uuid primary key default gen_random_uuid(),   -- ini "instance"
  segment_id   uuid not null,
  template_key text not null,
  label        text,                    -- diberi manusia: "Newsletter Sept #1"
  created_by   text,
  created_at   timestamptz not null default now(),
  status       text not null default 'draft'
    check (status in ('draft','sending','sent','stopped'))
);
-- crm_message_log.campaign_id kemudian = crm_campaign_run.id::text (atau {run}:{customer}:{channel}
-- untuk idempotency_key). Pola crm_*: RLS on / 0 policy / service_role.
```

## DITERAPKAN — bentuk B, ledger 20260824180426

Bentuk **B (baris run) disetujui + DITERAPKAN** (K-41). Migrasi:
`supabase/migrations/20260824180426_crm_campaign_run.sql` (RLS on, 0 policy, relacl {postgres,
service_role}, 7 kolom, 0 baris; FK ke crm_segment on delete restrict). Ini **harus mendarat sebelum kampanye pertama**: tanpanya, kampanye kedua
ke segmen+template yang sama diam-diam tak mengirim apa pun (kunci idempotensi identik → dilewati).

Menunggu konfirmasi untuk: terapkan migrasi (via `apply_migration`, verifikasi biasa), lalu ubah
`sendCampaignAction` agar `campaignId = crm_campaign_run.id`, dan composer menawarkan
**resume run yang ada** (status `sending`, sudah N terkirim) **vs mulai run baru**.
