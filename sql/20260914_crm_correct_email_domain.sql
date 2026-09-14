-- ============================================================================
-- crm_correct_email_domain(email text) → text
-- ============================================================================
-- Referensi: K-06 — normalisasi utama tetap di TypeScript (normalize.ts).
--            Fungsi SQL ini OPSIONAL — bisa dipanggil dari RPC ingest
--            sebagai defense-in-depth, atau di query ad-hoc backfill.
--
-- BELUM DIJALANKAN — review dulu, lalu execute via Supabase SQL editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.crm_correct_email_domain(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_email IS NULL OR p_email = '' OR position('@' IN p_email) = 0
      THEN p_email

    ELSE
      split_part(lower(trim(p_email)), '@', 1) || '@' ||
      COALESCE(
        (SELECT correct_domain FROM (VALUES
          -- gmail typos
          ('gmail.col',  'gmail.com'),
          ('gmail.con',  'gmail.com'),
          ('gmail.co',   'gmail.com'),
          ('gmail.cim',  'gmail.com'),
          ('gmail.vom',  'gmail.com'),
          ('gmial.com',  'gmail.com'),
          ('gmai.com',   'gmail.com'),
          ('gmal.com',   'gmail.com'),
          ('gnail.com',  'gmail.com'),
          ('gmaol.com',  'gmail.com'),
          ('gamil.com',  'gmail.com'),
          -- yahoo typos
          ('yahoo.con',  'yahoo.com'),
          ('yahoo.col',  'yahoo.com'),
          ('yaboo.com',  'yahoo.com'),
          ('yahooo.com', 'yahoo.com'),
          ('yaho.com',   'yahoo.com'),
          -- hotmail typos
          ('hotmail.con', 'hotmail.com'),
          ('hmail.com',   'hotmail.com'),
          ('hotmial.com', 'hotmail.com'),
          ('hotmai.com',  'hotmail.com'),
          -- outlook typos
          ('outlok.com',  'outlook.com'),
          ('outloo.com',  'outlook.com')
        ) AS t(typo_domain, correct_domain)
        WHERE t.typo_domain = lower(trim(split_part(lower(trim(p_email)), '@', 2)))),
        -- no match → keep original domain
        lower(trim(split_part(lower(trim(p_email)), '@', 2)))
      )
  END;
$$;

COMMENT ON FUNCTION public.crm_correct_email_domain(text) IS
  'Auto-correct known email domain typos (gmail.con→gmail.com etc). Returns input unchanged for unknown domains.';

-- VERIFIKASI setelah eksekusi:
-- SELECT crm_correct_email_domain('user@gmail.con');   -- → user@gmail.com
-- SELECT crm_correct_email_domain('user@gmail.com');   -- → user@gmail.com (unchanged)
-- SELECT crm_correct_email_domain('user@company.id');  -- → user@company.id (unchanged)
-- SELECT crm_correct_email_domain(NULL);               -- → NULL
