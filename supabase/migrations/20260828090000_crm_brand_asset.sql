-- ============================================================================================
-- MIGRASI 30 · Brand assets (logo upload) — crm_brand_asset + storage bucket
-- --------------------------------------------------------------------------------------------
-- TUJUAN: tim bisa upload logo (dan gambar brand lain) sekali, simpan, lalu sisipkan ke template
-- email sebagai <img src="URL publik">. Email client (Gmail/Outlook) butuh URL publik yang stabil —
-- base64 sering diblokir — jadi file disimpan di Supabase Storage (bucket publik) dan URL-nya
-- dicatat di crm_brand_asset untuk daftar/pilih/hapus.
--
-- POLA: tabel CRM (RLS ON, service_role) seperti crm_message_template. File di bucket 'brand-assets'
-- yang PUBLIC (read anon) supaya <img> di email bisa memuatnya tanpa auth. Upload/hapus lewat
-- service role (server action) — anon tak bisa menulis.
-- ============================================================================================

-- §1 · Metadata aset (URL publik + info). File sesungguhnya di storage bucket.
create table if not exists public.crm_brand_asset (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  storage_path text not null unique,
  public_url   text not null,
  mime_type    text,
  size_bytes   integer,
  uploaded_by  text,
  created_at   timestamptz not null default now(),
  is_active    boolean not null default true
);

alter table public.crm_brand_asset enable row level security;
revoke all on public.crm_brand_asset from public, anon, authenticated;
grant select, insert, update on public.crm_brand_asset to service_role;

-- §2 · Bucket publik untuk file brand. Public = objek bisa dibaca via URL tanpa auth (syarat <img>
--       di email). Idempoten. Batasi 2 MiB + tipe gambar umum.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets', 'brand-assets', true, 2097152,
  array['image/png','image/jpeg','image/gif','image/webp','image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'];

-- §3 · Policy storage: siapa pun boleh MEMBACA objek di bucket ini (email <img>); tulis/hapus
--       hanya service_role (lewat server action). anon/authenticated tak boleh menulis.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='brand_assets_public_read') then
    create policy brand_assets_public_read on storage.objects
      for select using (bucket_id = 'brand-assets');
  end if;
end $$;
