-- ============================================================================================
-- Migration 22 — pin search_path on the append-only trigger guard crm_audit_log_no_mutate
-- APPLIED 20260821041044 · consolidated to main 2026-08-21 (selective integration, this session)
-- ============================================================================================
-- Closes the one remaining CRM-scoped advisor WARN (function_search_path_mutable). The function
-- is the append-only GUARD on crm_audit_log: it raises on any UPDATE/DELETE/TRUNCATE. The ONLY
-- change here is `SET search_path TO 'public'` — the body is byte-identical to before. CREATE OR
-- REPLACE keeps both triggers attached (crm_audit_log_block_row_mutation BEFORE DELETE OR UPDATE,
-- crm_audit_log_block_truncate BEFORE TRUNCATE) and is atomic (no unguarded window). Grants are
-- unchanged: a trigger function does not need EXECUTE to fire, so the Supabase-default PUBLIC
-- grant is inert (the function is not usefully callable directly).
--
-- Verified after apply (2026-08-21): search_path=public pinned; secdef=false, volatility=v,
-- returns trigger, owner postgres — all preserved; both triggers still attached. Append-only
-- proven LIVE against throwaway row id=1 (UPDATE tested FIRST; DELETE run only AFTER UPDATE was
-- proven rejected — a DELETE that slipped through would erase its own evidence):
--   UPDATE  ->  ERROR  P0001: crm_audit_log bersifat append-only: UPDATE ditolak
--   DELETE  ->  ERROR  P0001: crm_audit_log bersifat append-only: DELETE ditolak
-- crm_audit_log row count unchanged (199), row id=1 intact.
--
-- Body below is VERBATIM from pg_get_functiondef (live catalog) + the terminating ';'.
-- ============================================================================================

CREATE OR REPLACE FUNCTION public.crm_audit_log_no_mutate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'crm_audit_log bersifat append-only: % ditolak', tg_op;
end;
$function$;
