-- ============================================================================================
-- crm_workflow · trigger_source — pemicu waktu boleh dari POOL, bukan hanya lapisan aktivitas.
-- --------------------------------------------------------------------------------------------
-- TUJUAN: sambutan pendaftar baru (~577/bln) memicu dari master_customer.created_at (cakupan penuh),
-- bukan crm_customer_activity.joined_at (cakupan 0,88%). Jenis `type` TETAP welcome/reengagement
-- (makna PESAN); kolom baru `trigger_source` memisahkan DARI MANA waktunya dibaca.
--
-- Backward-compatible: default 'activity' → baris lama (0 baris saat apply) & insert lama tak berubah.
-- Disetujui pemilik produk 31 Agu 2026 (docs/PETA-WORKFLOW.md §9). Applied + verified 31 Agu:
-- kolom text NOT NULL DEFAULT 'activity', check ('activity','pool'), crm_workflow 0 baris.
-- ============================================================================================

alter table public.crm_workflow
  add column if not exists trigger_source text not null default 'activity'
    check (trigger_source in ('activity', 'pool'));

comment on column public.crm_workflow.trigger_source is
  'Sumber pemicu waktu: activity = crm_customer_activity (joined_at/last_active_at, cakupan 0,88%); '
  'pool = master_customer.created_at (profil baru di pool, cakupan penuh). welcome+pool = sambutan '
  'pendaftar baru (~577/bln). Default activity menjaga perilaku baris lama.';
