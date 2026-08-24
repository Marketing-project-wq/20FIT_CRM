# RENCANA — penyimpanan template (crm_message_template) — GATED

Storage untuk TUGAS 2 (template). **SQL DITUNJUKKAN, BELUM DIJALANKAN** — migrasi di proyek ini
lewat gerbang satu-per-satu (peringatan ledger di README). Inti murni yang tak butuh tabel sudah
dibangun & diuji: `lib/crm/template.ts` (kosakata variabel tertutup, validasi saat simpan, render,
pratinjau). Yang di bawah menunggu persetujuan untuk `apply_migration`.

## Kenapa CRM berdiri sendiri (bukan pakai tabel tim lain)

Temuan investigasi (24 Agu 2026, lihat `EVALUASI-LINGKUP-24agu.md` + laporan sprint):
`my20fit_message_log`, `my20fit_campaign_enrollments`, `my20fit_email_templates` semuanya
**nol baris** (rancangan matang, belum diwiring) dan **di-key pada `user_id` (auth my20fit)**,
bukan `master_customer.customer_id`. Pool CRM 82.253 profil, hanya ~47 pengguna my20fit. Jadi
tabel-tabel itu **tak bisa dipakai bersama** (key beda + milik tim lain + RLS-on/0-policy). CRM
menulis hanya ke `crm_*` (aturan tetap). **Tapi skema `my20fit_message_log` ditiru** untuk
`crm_message_log` kelak (kolom `idempotency_key`, `provider_message_id`, `status`, cap waktu
siklus kirim, `unsubscribed_at`, `language`) — meniru bentuk yang baik, bukan membangun yang
berbeda. **Keputusan "pakai bersama" bukan wewenang saya** — bila pemilik produk ingin CRM &
my20fit berbagi satu log kirim, itu keputusan lintas-tim (lihat pertanyaan di laporan).

## Skema yang diusulkan (append-version, dwibahasa, email + WhatsApp)

```sql
-- crm_message_template — satu BARIS per (template_key, language, version).
-- Versi baru = INSERT baru (riwayat versi utuh); "current" = versi tertinggi per key+language.
-- Tak ada UPDATE isi & tak ada DELETE (K-14 semangat: yang dipakai kampanye kemarin harus bisa
-- dibaca apa adanya saat itu). RLS ON, 0 policy → hanya service_role (pola crm_*).
create table if not exists public.crm_message_template (
  id                uuid primary key default gen_random_uuid(),
  template_key      text not null,                 -- id stabil lintas versi & bahasa (mis. "promo_ramadan")
  channel           text not null check (channel in ('email','whatsapp')),
  language          text not null check (language in ('id','en')),
  version           integer not null check (version >= 1),
  name              text not null,                 -- label internal untuk staf
  subject           text,                          -- email saja; WA null (dijaga di bawah)
  body              text not null,
  variables         text[] not null default '{}',  -- diturunkan dari body saat simpan (kosakata tertutup)
  -- WhatsApp: pesan di luar jendela 24 jam wajib template yang SUDAH disetujui Meta.
  wa_approval_status text not null default 'not_applicable'
    check (wa_approval_status in ('not_applicable','draft','pending','approved','rejected')),
  wa_provider_template_id text,                    -- id template dari penyedia (Meta), null sampai ada
  is_active         boolean not null default true, -- versi bisa dinonaktifkan tanpa dihapus
  created_at        timestamptz not null default now(),
  created_by        text,                          -- email staf; free-text (pola updated_by tim lain)
  -- Aturan bentuk yang ditegakkan DB (selain validasi variabel di lib/crm/template.ts):
  constraint crm_tpl_email_has_subject
    check (channel <> 'email' or subject is not null),
  constraint crm_tpl_wa_no_subject
    check (channel <> 'whatsapp' or subject is null),
  constraint crm_tpl_email_wa_status
    check (channel <> 'email' or wa_approval_status = 'not_applicable'),
  unique (template_key, language, version)
);

create index if not exists crm_message_template_key_lang_idx
  on public.crm_message_template (template_key, language, version desc);

-- Grant: service_role only (RLS ON + 0 policy sudah memblokir anon/authenticated; grant eksplisit
-- untuk kejelasan, pola migrasi crm_* sebelumnya).
revoke all on public.crm_message_template from public, anon, authenticated;
grant select, insert on public.crm_message_template to service_role;
```

## Yang TIDAK dibuat sekarang

- **Tak ada tabel `crm_message_log`** — itu untuk saat pengiriman nyata dibangun; skemanya akan
  meniru `my20fit_message_log`. Dicatat, bukan dibuat (belum ada pengiriman).
- **Tak ada tabel campaign/enrollment** — workflow paling akhir di peta jalan.

## Revert

`drop table if exists public.crm_message_template;` — nol data pelanggan, nol trigger, aman.
Migrasi ini **hanya menambah** satu tabel `crm_*` kosong; tak menyentuh data mana pun yang ada.
