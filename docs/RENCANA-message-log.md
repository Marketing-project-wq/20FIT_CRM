# RENCANA — crm_message_log (log pengiriman) — GATED, SQL DITUNJUKKAN, BELUM DIJALANKAN

Langkah 1 dari urutan pengiriman (pemilik produk, 24 Agu). **Berhenti di sini** untuk tinjauan
SQL — jalur kirim manual (langkah 2) dan layar Campaigns/Messages (langkah 3) menyusul setelah
skema ini disetujui.

## Kenapa meniru `my20fit_message_log`, tapi berkunci `customer_id`

`my20fit_message_log` punya skema kirim matang tapi **di-key pada `user_id` (auth my20fit)** —
tak mencakup pool CRM (hanya ~47/82.253). **Skemanya ditiru** (kolom siklus kirim yang sama, jadi
analitik lintas-tim berbaris), **kuncinya diganti** ke `master_customer.customer_id` (K-37 #1).
Kolom my20fit-spesifik (`meal_window`) dibuang; ditambah yang CRM butuh (identitas tujuan +
referensi template + status `skipped_suppressed`).

## SQL yang diusulkan (BELUM dijalankan)

```sql
-- crm_message_log — satu BARIS per upaya kirim ke satu penerima. Append-only (K-14 semangat):
-- INSERT saat dikirim; UPDATE hanya untuk cap-waktu siklus (delivered/opened/bounced/…) via
-- webhook penyedia. RLS ON / 0 policy / service_role only (pola crm_*, seperti crm_message_template).
create table if not exists public.crm_message_log (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null,                 -- KUNCI CRM (master_customer.customer_id), bukan user_id
  channel              text not null check (channel in ('email','whatsapp')),
  campaign_id          uuid,                           -- kampanye/aksi yang memicunya (null = kirim ad-hoc)
  template_key         text,                           -- template + versi yang BENAR-BENAR dikirim
  template_version     integer,                        --   → "apa yang sebenarnya diterima orang itu"
  identity_kind        text check (identity_kind in ('email','phone')),
  identity_key         text,                           -- tujuan ternormalisasi (K-06) — korelasi unsubscribe
  subject              text,                           -- email saja
  language             text check (language in ('id','en')),
  -- Anti kirim-ganda: bila proses putus di baris 6.000 dari 10.000, kirim ulang tak boleh
  -- menghasilkan baris kedua untuk 6.000 pertama. UNIQUE menegakkan idempotensi.
  idempotency_key      text not null,
  provider_message_id  text,                           -- id dari Mailtrap / Meta
  status               text not null default 'queued'
    check (status in ('queued','sent','delivered','bounced','complained','failed','skipped_suppressed')),
  error_message        text,                           -- alasan gagal per-penerima (PII-free)
  -- Cap waktu siklus kirim (ditiru dari my20fit_message_log; diisi webhook penyedia):
  sent_at              timestamptz,
  delivered_at         timestamptz,
  opened_at            timestamptz,
  clicked_at           timestamptz,
  bounced_at           timestamptz,
  complained_at        timestamptz,
  unsubscribed_at      timestamptz,
  created_at           timestamptz not null default now(),
  constraint crm_message_log_idem_unique unique (idempotency_key)
);

create index if not exists crm_message_log_customer_idx on public.crm_message_log (customer_id);
create index if not exists crm_message_log_campaign_idx on public.crm_message_log (campaign_id);
create index if not exists crm_message_log_status_idx   on public.crm_message_log (status);

alter table public.crm_message_log enable row level security;
revoke all on public.crm_message_log from public, anon, authenticated;
grant select, insert, update on public.crm_message_log to service_role;
```

**Catatan `update`:** berbeda dari `crm_message_template` (select+insert saja), log ini butuh
`update` untuk cap-waktu siklus (`delivered_at`, `opened_at`, `bounced_at`, …) yang datang dari
**webhook penyedia** setelah baris dibuat. Isi pesan tak pernah di-UPDATE; hanya kolom siklus.

**`status = 'skipped_suppressed'`** adalah bukti bahwa pemeriksaan suppression **saat kirim**
(bukan saat segmen dihitung) berjalan: penerima yang unsubscribe di antara "hitung segmen" dan
"kirim" menghasilkan baris `skipped_suppressed`, bukan email terkirim.

## Revert

`drop table if exists public.crm_message_log;` — aditif, nol data pelanggan, aman.

## BERHENTI

Sesuai instruksi: SQL ditunjukkan, **belum dijalankan**. Menunggu tinjauan sebelum:
- **Langkah 2** — jalur kirim manual ke segmen lewat Mailtrap (suppression saat-kirim,
  idempotency, batas harian + konfirmasi >500, tautan unsubscribe bertanda tangan, kegagalan
  per-penerima dicatat tanpa menghentikan sisanya).
- **Langkah 3** — layar Campaigns + Messages menggantikan ComingSoon.
