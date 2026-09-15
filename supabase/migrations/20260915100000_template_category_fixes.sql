-- Fix template categories and archive __uji_internal__
-- REVIEW ONLY — not auto-applied.

-- Track A → NOTIFICATION
UPDATE crm_message_template
SET category = 'notification'
WHERE template_key ILIKE '%track_a%'
  AND (category IS NULL OR category = 'other')
  AND is_active = true;

-- ISS x JHR → EVENT
UPDATE crm_message_template
SET category = 'event'
WHERE (template_key ILIKE '%iss%jhr%' OR template_key ILIKE '%iss_x_jhr%')
  AND (category IS NULL OR category = 'other')
  AND is_active = true;

-- new 20FIT app → NOTIFICATION
UPDATE crm_message_template
SET category = 'notification'
WHERE (template_key ILIKE '%new_20fit_app%' OR template_key ILIKE '%20fit_app%')
  AND (category IS NULL OR category = 'other')
  AND is_active = true;

-- Everything 20FIT → NEWSLETTER
UPDATE crm_message_template
SET category = 'newsletter'
WHERE template_key ILIKE '%everything_20fit%'
  AND (category IS NULL OR category = 'other')
  AND is_active = true;

-- 50% off → PROMO
UPDATE crm_message_template
SET category = 'promo'
WHERE (template_key ILIKE '%50_off%' OR template_key ILIKE '%50pct%' OR template_key ILIKE '%50_percent%')
  AND (category IS NULL OR category = 'other')
  AND is_active = true;

-- Archive __uji_internal__ test template
UPDATE crm_message_template
SET status = 'archived'
WHERE template_key = '__uji_internal__'
  AND is_active = true;
