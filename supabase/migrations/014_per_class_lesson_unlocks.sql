-- Migration 014: Decouple lessons from classes; per-class unlock model.
--
-- Mental model: lessons are pure content groupings. Unlocking is a per-class
-- action — the teacher unlocks a lesson for a specific class when they teach
-- it. Each (lesson, class) pair has its own unlocked_at timestamp.
--
-- Example: teach 11A1 on Sunday → unlock for 11A1; teach 11A4 on Monday →
-- unlock for 11A4. Same lesson, two independent unlock events.
--
-- Schema changes:
--   - lessons: drop class_id, cards_unlocked_at, taught_at
--   - lessons.lesson_number is now globally unique
--   - NEW: lesson_unlocks(lesson_id, class_id, unlocked_at) join table
--   - RLS on lessons/review_cards: gated on lesson_unlocks row for student's class
--   - unlock_lesson_cards RPC takes (lesson_id, class_id)
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- PART 1: Drop dependents that reference the columns/policies we're changing
-- ============================================================================

DROP VIEW IF EXISTS public.lesson_card_counts;
DROP POLICY IF EXISTS lessons_student_read_own_class ON public.lessons;
DROP POLICY IF EXISTS review_cards_student_read_unlocked ON public.review_cards;
DROP FUNCTION IF EXISTS public.unlock_lesson_cards(uuid);

-- ============================================================================
-- PART 2: lesson_unlocks table
-- ============================================================================

CREATE TABLE public.lesson_unlocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (lesson_id, class_id)
);
CREATE INDEX idx_lesson_unlocks_lesson ON public.lesson_unlocks(lesson_id);
CREATE INDEX idx_lesson_unlocks_class ON public.lesson_unlocks(class_id);

ALTER TABLE public.lesson_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_unlocks_teacher_all ON public.lesson_unlocks
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY lesson_unlocks_student_read_own_class ON public.lesson_unlocks
    FOR SELECT TO authenticated
    USING (class_id = public.user_class_id());

COMMENT ON TABLE public.lesson_unlocks IS
'Per-(lesson, class) unlock state. Created when a teacher unlocks a lesson for a specific class. RLS: teacher full access; students see rows for their own class.';

-- ============================================================================
-- PART 3: Backfill from old lessons columns
-- ============================================================================

INSERT INTO public.lesson_unlocks (lesson_id, class_id, unlocked_at)
SELECT id, class_id, cards_unlocked_at
FROM public.lessons
WHERE cards_unlocked_at IS NOT NULL;

-- ============================================================================
-- PART 4: Drop class-related columns from lessons
-- ============================================================================

ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_class_id_lesson_number_key;
ALTER TABLE public.lessons DROP COLUMN IF EXISTS class_id;
ALTER TABLE public.lessons DROP COLUMN IF EXISTS cards_unlocked_at;
ALTER TABLE public.lessons DROP COLUMN IF EXISTS taught_at;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_lesson_number_key UNIQUE (lesson_number);

-- ============================================================================
-- PART 5: Recreate RLS — gated on lesson_unlocks
-- ============================================================================

CREATE POLICY lessons_student_read_unlocked ON public.lessons
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lesson_unlocks lu
            WHERE lu.lesson_id = lessons.id
                AND lu.class_id = public.user_class_id()
        )
    );

CREATE POLICY review_cards_student_read_unlocked ON public.review_cards
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lesson_unlocks lu
            WHERE lu.lesson_id = review_cards.lesson_id
                AND lu.class_id = public.user_class_id()
        )
    );

-- ============================================================================
-- PART 6: Recreate lesson_card_counts view
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

-- ============================================================================
-- PART 7: unlock_lesson_cards(lesson_id, class_id) — per-class RPC
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

    WITH inserted AS (
        INSERT INTO public.card_reviews (student_id, card_id)
        SELECT p.id, rc.id
        FROM public.profiles p
        CROSS JOIN public.review_cards rc
        WHERE p.class_id = p_class_id
          AND p.role = 'student'
          AND rc.lesson_id = p_lesson_id
        ON CONFLICT (student_id, card_id) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_reviews_created FROM inserted;

    SELECT count(*) INTO v_card_count
    FROM public.review_cards WHERE lesson_id = p_lesson_id;

    SELECT count(*) INTO v_student_count
    FROM public.profiles WHERE class_id = p_class_id AND role = 'student';

    RETURN jsonb_build_object(
        'ok', true,
        'cards_count', v_card_count,
        'students_count', v_student_count,
        'reviews_created', v_reviews_created
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_lesson_cards(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.unlock_lesson_cards(uuid, uuid) FROM anon, PUBLIC;

COMMENT ON FUNCTION public.unlock_lesson_cards(uuid, uuid) IS
'Teacher-only RPC. Unlocks a lesson for a specific class. Idempotent. Returns {ok, cards_count, students_count, reviews_created}.';

COMMIT;
