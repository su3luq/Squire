-- Migration 016: enable FSRS-driven review-quiz page.
-- (a) list_review_session() — student-facing RPC for the review page payload.
--     Returns due cards with their MCQs (question_text + choices, no correct_choice).
--     One SECURITY DEFINER read so the page works without student-side
--     SELECT access to card_quiz_questions (still teacher-only by RLS).
-- (b) unlock_lesson_cards() updated to skip cards with 0 MCQs and report them.
--     Architect's strict-MCQ rule: cards without MCQs cannot enter the review
--     system. The unlock proceeds for ready cards; skipped headlines come back
--     in the result so the teacher can fix them and re-sync.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- (a) list_review_session
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_review_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_user_id uuid;
    v_class_id uuid;
    v_result jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Not signed in.');
    END IF;

    SELECT class_id INTO v_class_id FROM public.profiles WHERE id = v_user_id;
    IF v_class_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No class enrollment.');
    END IF;

    SELECT jsonb_build_object(
        'ok', true,
        'cards', COALESCE(jsonb_agg(card_obj ORDER BY due_at ASC), '[]'::jsonb)
    )
    INTO v_result
    FROM (
        SELECT
            cr.due_at,
            jsonb_build_object(
                'card_review_id', cr.id,
                'card_id', rc.id,
                'headline', rc.headline,
                'body', rc.body,
                'lesson_title', l.title,
                'lesson_number', l.lesson_number,
                'fsrs', jsonb_build_object(
                    'state', cr.state,
                    'stability', cr.stability,
                    'difficulty', cr.difficulty,
                    'due_at', cr.due_at,
                    'last_reviewed_at', cr.last_reviewed_at,
                    'review_count', cr.review_count
                ),
                'mcqs', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', cqq.id,
                            'question_text', cqq.question_text,
                            'choice_a', cqq.choice_a,
                            'choice_b', cqq.choice_b,
                            'choice_c', cqq.choice_c,
                            'choice_d', cqq.choice_d
                        )
                        ORDER BY cqq.created_at
                    )
                    FROM public.card_quiz_questions cqq
                    WHERE cqq.card_id = rc.id
                )
            ) AS card_obj
        FROM public.card_reviews cr
        JOIN public.review_cards rc ON rc.id = cr.card_id
        JOIN public.lessons l ON l.id = rc.lesson_id
        WHERE cr.student_id = v_user_id
          AND cr.due_at <= now()
          AND EXISTS (
              SELECT 1 FROM public.lesson_unlocks lu
              WHERE lu.lesson_id = rc.lesson_id AND lu.class_id = v_class_id
          )
          AND EXISTS (
              SELECT 1 FROM public.card_quiz_questions cqq
              WHERE cqq.card_id = rc.id
          )
    ) sub;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_review_session() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_review_session() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.list_review_session() IS
'Student-facing: returns the full FSRS-driven review session payload as jsonb {ok, cards: [...]} for the calling student. Each card includes headline, body, lesson metadata, FSRS state, and its MCQs (question_text + choices, no correct_choice). Filters: due_at <= now(), lesson unlocked for student class, card has >=1 MCQ. Sorted by due_at ASC.';

-- ============================================================================
-- (b) unlock_lesson_cards — strict MCQ rule
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unlock_lesson_cards(
    p_lesson_id uuid,
    p_class_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_card_count int;
    v_student_count int;
    v_reviews_created int;
    v_cards_skipped int;
    v_skipped_headlines text[];
BEGIN
    IF NOT public.is_teacher() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Only teachers can unlock lessons.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Lesson not found.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id AND archived_at IS NULL) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Class not found.');
    END IF;

    INSERT INTO public.lesson_unlocks (lesson_id, class_id)
    VALUES (p_lesson_id, p_class_id)
    ON CONFLICT (lesson_id, class_id) DO NOTHING;

    -- Collect headlines of cards that have 0 MCQs (skipped from review system).
    SELECT
        COUNT(*) FILTER (WHERE NOT mcq_exists),
        COALESCE(array_agg(headline) FILTER (WHERE NOT mcq_exists), ARRAY[]::text[])
    INTO v_cards_skipped, v_skipped_headlines
    FROM (
        SELECT
            rc.headline,
            EXISTS (
                SELECT 1 FROM public.card_quiz_questions cqq WHERE cqq.card_id = rc.id
            ) AS mcq_exists
        FROM public.review_cards rc
        WHERE rc.lesson_id = p_lesson_id
    ) sub;

    -- Seed card_reviews only for cards that have at least one MCQ.
    WITH inserted AS (
        INSERT INTO public.card_reviews (student_id, card_id)
        SELECT p.id, rc.id
        FROM public.profiles p
        CROSS JOIN public.review_cards rc
        WHERE p.class_id = p_class_id
          AND p.role = 'student'
          AND rc.lesson_id = p_lesson_id
          AND EXISTS (
              SELECT 1 FROM public.card_quiz_questions cqq WHERE cqq.card_id = rc.id
          )
        ON CONFLICT (student_id, card_id) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_reviews_created FROM inserted;

    SELECT count(*) INTO v_card_count
    FROM public.review_cards
    WHERE lesson_id = p_lesson_id
      AND EXISTS (
          SELECT 1 FROM public.card_quiz_questions cqq WHERE cqq.card_id = review_cards.id
      );

    SELECT count(*) INTO v_student_count
    FROM public.profiles WHERE class_id = p_class_id AND role = 'student';

    RETURN jsonb_build_object(
        'ok', true,
        'cards_count', v_card_count,
        'students_count', v_student_count,
        'reviews_created', v_reviews_created,
        'cards_skipped_no_mcq', v_cards_skipped,
        'skipped_card_headlines', to_jsonb(v_skipped_headlines)
    );
END;
$$;

COMMENT ON FUNCTION public.unlock_lesson_cards(uuid, uuid) IS
'Teacher-only RPC. Unlocks a lesson for a specific class. Idempotent. Skips cards with 0 MCQs (they cannot enter the review system) and reports them in the result for the teacher to fix and re-sync. Returns {ok, cards_count, students_count, reviews_created, cards_skipped_no_mcq, skipped_card_headlines}. cards_count reflects only MCQ-having cards.';

COMMIT;
