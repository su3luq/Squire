-- Migration 015: Unify review and quiz via FSRS-driven model.
-- Plan B per architect. The daily quiz collapses into the review flow.
-- Students answer MCQs from cards whose card_reviews.due_at <= now().
-- Correct → +5 XP + FSRS rating later mapped to Good for the card.
-- Wrong → 0 XP + FSRS rating later mapped to Again.
-- See CLAUDE.md "Review (FSRS-driven)" section for the full model.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- PART 1: Drop the old daily_quiz_attempts table (0 rows, never queried).
-- CASCADE drops its RLS policies.
-- ============================================================================

DROP TABLE IF EXISTS public.daily_quiz_attempts CASCADE;

-- ============================================================================
-- PART 2: New review_attempts table — one row per MCQ answer.
-- ============================================================================

CREATE TABLE public.review_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    card_id uuid NOT NULL REFERENCES public.review_cards(id) ON DELETE CASCADE,
    quiz_question_id uuid NOT NULL REFERENCES public.card_quiz_questions(id) ON DELETE CASCADE,
    selected_choice char(1) NOT NULL CHECK (lower(selected_choice) IN ('a','b','c','d')),
    is_correct boolean NOT NULL,
    answered_at timestamptz NOT NULL DEFAULT now(),
    xp_awarded int NOT NULL DEFAULT 0,
    card_review_state_at_answer public.card_review_state NOT NULL
);

CREATE INDEX idx_review_attempts_student ON public.review_attempts(student_id, answered_at DESC);
CREATE INDEX idx_review_attempts_student_card ON public.review_attempts(student_id, card_id, answered_at DESC);
CREATE INDEX idx_review_attempts_card ON public.review_attempts(card_id, answered_at DESC);

-- ============================================================================
-- PART 3: RLS — student reads own; teacher reads all; NO insert/update policies.
-- All writes happen via submit_mcq_answer SECURITY DEFINER function below.
-- ============================================================================

ALTER TABLE public.review_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_attempts_teacher_read ON public.review_attempts
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY review_attempts_student_read_own ON public.review_attempts
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

COMMENT ON TABLE public.review_attempts IS
'One row per MCQ answer. Inserts only via submit_mcq_answer SECURITY DEFINER function — never directly from client code. This is the audit chokepoint. RLS: teacher read all; student read own.';

-- ============================================================================
-- PART 4: submit_mcq_answer SECURITY DEFINER function.
-- Verifies access, computes correctness, inserts attempt + xp_ledger atomically.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_mcq_answer(
    p_quiz_question_id uuid,
    p_selected_choice char(1)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_class_id uuid;
    v_card_id uuid;
    v_correct_choice char(1);
    v_is_correct boolean;
    v_card_review_id uuid;
    v_state public.card_review_state;
    v_xp int := 0;
    v_attempt_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Not signed in.');
    END IF;

    IF lower(p_selected_choice) NOT IN ('a','b','c','d') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Invalid choice.');
    END IF;

    SELECT class_id INTO v_class_id FROM public.profiles WHERE id = v_user_id;
    IF v_class_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No class enrollment.');
    END IF;

    -- Visibility check + fetch the answer key.
    -- Joins through lesson_unlocks for the student's class.
    SELECT cqq.card_id, cqq.correct_choice
    INTO v_card_id, v_correct_choice
    FROM public.card_quiz_questions cqq
    JOIN public.review_cards rc ON rc.id = cqq.card_id
    JOIN public.lesson_unlocks lu ON lu.lesson_id = rc.lesson_id
    WHERE cqq.id = p_quiz_question_id
      AND lu.class_id = v_class_id;

    IF v_card_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'MCQ not accessible.');
    END IF;

    v_is_correct := (lower(p_selected_choice) = lower(v_correct_choice));

    -- Snapshot the card_reviews state. Create on-demand if missing
    -- (defensive: student may have joined the class after the unlock without a re-sync).
    SELECT id, state INTO v_card_review_id, v_state
    FROM public.card_reviews
    WHERE student_id = v_user_id AND card_id = v_card_id;

    IF v_card_review_id IS NULL THEN
        INSERT INTO public.card_reviews (student_id, card_id)
        VALUES (v_user_id, v_card_id)
        RETURNING id, state INTO v_card_review_id, v_state;
    END IF;

    IF v_is_correct THEN
        v_xp := 5;
    END IF;

    -- Insert the attempt row.
    INSERT INTO public.review_attempts (
        student_id, card_id, quiz_question_id,
        selected_choice, is_correct, xp_awarded,
        card_review_state_at_answer
    ) VALUES (
        v_user_id, v_card_id, p_quiz_question_id,
        lower(p_selected_choice), v_is_correct, v_xp,
        v_state
    )
    RETURNING id INTO v_attempt_id;

    -- Award XP via xp_ledger if correct. Trigger updates profiles.xp_total + rank.
    IF v_is_correct THEN
        INSERT INTO public.xp_ledger (student_id, amount, reason, source_table, source_id)
        VALUES (
            v_user_id,
            5,
            'review_mcq_correct',
            'review_attempts',
            v_attempt_id
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'is_correct', v_is_correct,
        'correct_choice', lower(v_correct_choice),
        'xp_awarded', v_xp,
        'attempt_id', v_attempt_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_mcq_answer(uuid, char) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_mcq_answer(uuid, char) FROM anon, PUBLIC;

COMMENT ON FUNCTION public.submit_mcq_answer(uuid, char) IS
'Student-facing: submit an answer to an MCQ. Computes is_correct against card_quiz_questions.correct_choice (teacher-only readable). Inserts a review_attempts row; awards +5 XP via xp_ledger if correct. Creates a card_reviews row on-demand if missing. Returns {ok, is_correct, correct_choice, xp_awarded, attempt_id}. The FSRS state update for the parent card happens in a separate client-side call after all MCQs for the card are answered.';

COMMIT;
