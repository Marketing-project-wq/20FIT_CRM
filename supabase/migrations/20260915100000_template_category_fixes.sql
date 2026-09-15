-- Fix template categories and archive __uji_internal__
-- Can also be applied via POST /api/templates/fix-categories

-- The new 20FIT app is here — update now → NOTIFICATION
UPDATE crm_message_template SET category = 'notification'
WHERE (display_name ILIKE '%The new 20FIT app is here%' OR name ILIKE '%The new 20FIT app is here%')
  AND category = 'other' AND is_active = true;

-- ISS x JHR Participants → EVENT
UPDATE crm_message_template SET category = 'event'
WHERE (display_name ILIKE '%ISS x JHR Participants%' OR name ILIKE '%ISS x JHR Participants%')
  AND category = 'other' AND is_active = true;

-- Your Sportfest photos will be deleted → NOTIFICATION
UPDATE crm_message_template SET category = 'notification'
WHERE (display_name ILIKE '%Sportfest photos will be deleted%' OR name ILIKE '%Sportfest photos will be deleted%')
  AND category = 'other' AND is_active = true;

-- 50% off at 20FIT Arena → PROMO
UPDATE crm_message_template SET category = 'promo'
WHERE (display_name ILIKE '%50% off at 20FIT Arena%' OR name ILIKE '%50% off at 20FIT Arena%')
  AND category = 'other' AND is_active = true;

-- PLN Mobile Electric 5K → EVENT
UPDATE crm_message_template SET category = 'event'
WHERE (display_name ILIKE '%PLN Mobile Electric 5K%' OR name ILIKE '%PLN Mobile Electric 5K%')
  AND category = 'other' AND is_active = true;

-- Track A · Adopsi aplikasi → NOTIFICATION
UPDATE crm_message_template SET category = 'notification'
WHERE (display_name ILIKE '%Track A%Adopsi aplikasi%' OR name ILIKE '%Track A%Adopsi aplikasi%')
  AND category = 'other' AND is_active = true;

-- Track A · Aktifkan kembali aplikasi → NOTIFICATION
UPDATE crm_message_template SET category = 'notification'
WHERE (display_name ILIKE '%Track A%Aktifkan kembali%' OR name ILIKE '%Track A%Aktifkan kembali%')
  AND category = 'other' AND is_active = true;

-- Track A · Ajakan ke Arena → PROMO
UPDATE crm_message_template SET category = 'promo'
WHERE (display_name ILIKE '%Track A%Ajakan ke Arena%' OR name ILIKE '%Track A%Ajakan ke Arena%')
  AND category = 'other' AND is_active = true;

-- Everything 20FIT, All in One Place → NEWSLETTER
UPDATE crm_message_template SET category = 'newsletter'
WHERE (display_name ILIKE '%Everything 20FIT%' OR name ILIKE '%Everything 20FIT%')
  AND category = 'other' AND is_active = true;

-- Archive __uji_internal__ test template
UPDATE crm_message_template SET status = 'archived'
WHERE template_key = '__uji_internal__' AND is_active = true;
