-- ============================================================================
-- crm_message_template — metadata columns for better naming & display
-- ============================================================================
-- Referensi: Task 7 — Template Management (Penamaan & Tampilan yang Lebih Baik)
--
-- Adds four columns:
--   display_name  — user-friendly name shown in UI (fallback: name)
--   description   — short purpose/usage note
--   category      — newsletter / promo / event / notification / other
--   status        — draft / active / archived (replaces boolean is_active)
--
-- BELUM DIJALANKAN — review dulu, lalu execute via Supabase SQL editor.
-- ============================================================================

-- 1. Add columns
ALTER TABLE public.crm_message_template
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS category     text DEFAULT 'other'
    CHECK (category IN ('newsletter', 'promo', 'event', 'notification', 'other')),
  ADD COLUMN IF NOT EXISTS status       text DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived'));

-- 2. Backfill existing rows
--    display_name ← name (existing human-readable name)
--    status       ← derive from is_active boolean
--    category     ← infer from template_key patterns, default 'other'
UPDATE public.crm_message_template
SET
  display_name = COALESCE(display_name, name),
  status       = CASE
                   WHEN NOT is_active THEN 'archived'
                   ELSE COALESCE(status, 'active')
                 END,
  category     = CASE
                   WHEN category IS NOT NULL THEN category
                   WHEN template_key ILIKE '%newsletter%' THEN 'newsletter'
                   WHEN template_key ILIKE '%promo%' THEN 'promo'
                   WHEN template_key ILIKE '%event%' THEN 'event'
                   WHEN template_key ILIKE '%notif%' THEN 'notification'
                   ELSE 'other'
                 END;

-- 3. Index for filtered queries (category + status)
CREATE INDEX IF NOT EXISTS idx_crm_message_template_category_status
  ON public.crm_message_template (category, status);

-- VERIFIKASI setelah eksekusi:
-- SELECT display_name, description, category, status FROM crm_message_template LIMIT 10;
-- SELECT category, COUNT(*) FROM crm_message_template GROUP BY category;
-- SELECT status, COUNT(*) FROM crm_message_template GROUP BY status;
