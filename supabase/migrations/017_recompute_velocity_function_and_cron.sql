-- Migration 017: nightly velocity recomputation.
-- Pure SQL approach (no Edge Function indirection) — pg_cron calls the
-- SECURITY DEFINER function once daily at 03:00 Saigon (20:00 UTC).
-- Lookback window: 14 days (per teacher decision; updated from architect's
-- original 30 days). Card-age weights unchanged.
--
-- Why no Edge Function: the velocity computation is intrinsically a single
-- SQL UPDATE. Wrapping it in a TS Edge Function adds an HTTP hop + Vault
-- secret management for the auth header without buying observability or
-- extensibility we actually need. If those needs emerge later, an Edge
-- Function wrapper can be added that calls this same RPC; the SQL stays.
--
-- Why 14-day window: 30 days (architect's original) was too slow to catch
-- deterioration. 7 days was too noisy. 14 days catches sustained drops
-- within a week, surfaces inactivity at 2 weeks, and smooths over weekend
-- gaps and short holidays. Empty days contribute zero to both numerator
-- and denominator, so weekends/holidays don't distort the ratio.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.recompute_learning_velocity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated int;
BEGIN
    WITH weighted AS (
        SELECT
            ra.student_id,
            CASE
                WHEN now() - rc.created_at <= interval '7 days'  THEN 1.0
                WHEN now() - rc.created_at <= interval '30 days' THEN 1.5
                WHEN now() - rc.created_at <= interval '90 days' THEN 2.5
                ELSE 4.0
            END AS w,
            CASE WHEN ra.is_correct THEN 1 ELSE 0 END AS c
        FROM public.review_attempts ra
        JOIN public.review_cards rc ON rc.id = ra.card_id
        WHERE ra.answered_at >= now() - interval '14 days'
    ),
    per_student AS (
        SELECT
            student_id,
            GREATEST(0::numeric, LEAST(1::numeric, sum(w * c) / NULLIF(sum(w), 0))) AS velocity
        FROM weighted
        GROUP BY student_id
    )
    UPDATE public.profiles p
    SET learning_velocity = COALESCE(
        (SELECT velocity FROM per_student ps WHERE ps.student_id = p.id),
        0
    )
    WHERE p.role = 'student';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN jsonb_build_object('ok', true, 'students_updated', v_updated);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_learning_velocity() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.recompute_learning_velocity() IS
'Nightly velocity recomputation (migration 017). Weighted by card age over trailing 14 days of review_attempts. Updates profiles.learning_velocity for all students. Velocity = 0 for students with no attempts in the window (which is correct — no learning signal). Not callable by client roles; runs via pg_cron at 03:00 Saigon (20:00 UTC).';

-- Schedule the cron job. Idempotent — unschedule first if a prior version exists.
DO $do$
BEGIN
    PERFORM cron.unschedule('recompute-velocity-nightly');
EXCEPTION WHEN OTHERS THEN
    -- Job didn't exist; that's fine.
    NULL;
END;
$do$;

SELECT cron.schedule(
    'recompute-velocity-nightly',
    '0 20 * * *',
    $$SELECT public.recompute_learning_velocity();$$
);

COMMIT;
