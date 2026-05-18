-- Migration 012: unlock_lesson_cards RPC and lesson_card_counts view.
--
-- Phase 2 commit #1 — pure DB scaffolding for the teacher unlock action.
-- No schema changes; only adds one function and one view.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- PART 1: unlock_lesson_cards(p_lesson_id) RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unlock_lesson_cards(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id uuid;
    v_card_count int;
    v_student_count int;
    v_reviews_created int;
BEGIN
    -- Gate 1: caller must be a teacher
    IF NOT public.is_teacher() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Only teachers can unlock lessons.');
    END IF;

    -- Gate 2: lesson must exist; capture its class_id
    SELECT class_id INTO v_class_id
    FROM public.lessons
    WHERE id = p_lesson_id;

    IF v_class_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Lesson not found.');
    END IF;

    -- Set cards_unlocked_at — idempotent first-set; re-runs don't move the timestamp
    UPDATE public.lessons
    SET cards_unlocked_at = COALESCE(cards_unlocked_at, now())
    WHERE id = p_lesson_id;

    -- Insert card_reviews for every (student-in-class) x (card-in-lesson) pair.
    -- Idempotent: ON CONFLICT (student_id, card_id) DO NOTHING handles re-runs
    -- after adding new cards to the lesson, or after enrolling new students.
    -- Initial FSRS state comes from column defaults:
    --   state='new', stability=0, difficulty=0, due_at=now(),
    --   review_count=0, fsrs_params_version=1.
    WITH inserted AS (
        INSERT INTO public.card_reviews (student_id, card_id)
        SELECT p.id, rc.id
        FROM public.profiles p
        CROSS JOIN public.review_cards rc
        WHERE p.class_id = v_class_id
          AND p.role = 'student'
          AND rc.lesson_id = p_lesson_id
        ON CONFLICT (student_id, card_id) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_reviews_created FROM inserted;

    -- Counts for the return value
    SELECT count(*) INTO v_card_count
    FROM public.review_cards
    WHERE lesson_id = p_lesson_id;

    SELECT count(*) INTO v_student_count
    FROM public.profiles
    WHERE class_id = v_class_id AND role = 'student';

    RETURN jsonb_build_object(
        'ok', true,
        'cards_count', v_card_count,
        'students_count', v_student_count,
        'reviews_created', v_reviews_created
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_lesson_cards(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.unlock_lesson_cards(uuid) FROM anon, PUBLIC;

COMMENT ON FUNCTION public.unlock_lesson_cards(uuid) IS
'Teacher-only RPC. Sets lessons.cards_unlocked_at and inserts card_reviews rows for every (student-in-class x card-in-lesson) pair. Idempotent — safe to re-run after adding more cards to the lesson, or after enrolling new students. Returns {ok, cards_count, students_count, reviews_created}.';

-- ============================================================================
-- PART 2: lesson_card_counts view (avoids N+1 on teacher lessons page)
-- ============================================================================

CREATE OR REPLACE VIEW public.lesson_card_counts
WITH (security_invoker = true)
AS
SELECT
    l.id AS lesson_id,
    count(DISTINCT rc.id) AS card_count,
    count(cqq.id) AS question_count
FROM public.lessons l
LEFT JOIN public.review_cards rc ON rc.lesson_id = l.id
LEFT JOIN public.card_quiz_questions cqq ON cqq.card_id = rc.id
GROUP BY l.id;

GRANT SELECT ON public.lesson_card_counts TO authenticated;

COMMENT ON VIEW public.lesson_card_counts IS
'Per-lesson counts of cards and quiz questions. Used by the teacher lessons page to avoid N+1 queries. security_invoker=true so RLS on underlying tables applies normally.';

COMMIT;
