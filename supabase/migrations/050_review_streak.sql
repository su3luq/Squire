-- Migration 050: daily review streak tracking
--
-- Adds two columns to profiles:
--   streak_days       — current consecutive Saigon-days with ≥1 review attempt
--   streak_last_day   — Saigon-local date of the most recent review attempt
--
-- A trigger on review_attempts bumps the streak on first attempt of a new
-- Saigon-day. If the gap from streak_last_day is exactly 1 day → +1; any
-- larger gap → reset to 1. Same-day attempts are no-ops.
--
-- The display layer (src/lib/streak.ts) decides whether the cached value
-- is "live" by comparing streak_last_day to today/yesterday — that way
-- the column doesn't lie between visits if the student goes silent.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_last_day date;

COMMENT ON COLUMN public.profiles.streak_days IS
  'Current consecutive Saigon-days streak of review activity. Reset by the trg_update_review_streak trigger when a gap >1 day is detected.';
COMMENT ON COLUMN public.profiles.streak_last_day IS
  'Saigon-local date of the most recent review_attempts row for this student. Used by the trigger and the app to detect broken streaks.';

CREATE OR REPLACE FUNCTION public.update_review_streak()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_last  date;
BEGIN
  v_today := (NEW.answered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  SELECT streak_last_day INTO v_last
  FROM public.profiles
  WHERE id = NEW.student_id
  FOR UPDATE;

  -- Already counted today — nothing to do.
  IF v_last = v_today THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET
    streak_days = CASE
      WHEN v_last = v_today - 1 THEN streak_days + 1
      ELSE 1
    END,
    streak_last_day = v_today
  WHERE id = NEW.student_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_review_streak() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_update_review_streak ON public.review_attempts;
CREATE TRIGGER trg_update_review_streak
  AFTER INSERT ON public.review_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_streak();

-- One-shot backfill from existing review_attempts history. Idempotent —
-- safe to re-run if needed.
CREATE OR REPLACE FUNCTION public.recompute_all_streaks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student record;
  v_day      date;
  v_prev_day date;
  v_streak   integer;
BEGIN
  FOR v_student IN
    SELECT id FROM public.profiles WHERE role = 'student'
  LOOP
    v_streak := 0;
    v_prev_day := NULL;

    FOR v_day IN
      SELECT DISTINCT
        ((answered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS day
      FROM public.review_attempts
      WHERE student_id = v_student.id
      ORDER BY day ASC
    LOOP
      IF v_prev_day IS NOT NULL AND v_day = v_prev_day + 1 THEN
        v_streak := v_streak + 1;
      ELSE
        v_streak := 1;
      END IF;
      v_prev_day := v_day;
    END LOOP;

    UPDATE public.profiles
    SET
      streak_days = COALESCE(v_streak, 0),
      streak_last_day = v_prev_day
    WHERE id = v_student.id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_all_streaks() FROM anon, authenticated, public;

SELECT public.recompute_all_streaks();
