-- Migration 011: Unify content model as markdown.
--
-- Changes:
--   1. review_cards.body: jsonb → text (markdown)
--   2. quests.description: jsonb → text (markdown)
--   3. Drop quests.quiz_questions (was for standalone quiz quests, removed)
--   4. Drop quests.deliverable_types (all non-daily-quiz submissions are markdown text)
--   5. Drop 'quiz' from quest_type enum (kept: solo, coop, daily_quiz)
--   6. Recreate coop_has_group_size constraint after enum rebuild
--   7. Add explanatory column comments
--
-- Pre-flight verified (via execute_sql before applying):
--   - Zero rows in quests have quest_type='quiz' (safe to drop from enum)
--   - lessons.UNIQUE(class_id, lesson_number) exists — no change needed
--   - card_reviews.UNIQUE(student_id, card_id) exists — no change needed
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- PART 1: Defensive guard — fail loudly if any quest still uses 'quiz'
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.quests WHERE quest_type::text = 'quiz') THEN
    RAISE EXCEPTION 'Cannot drop quiz from quest_type enum: % rows still reference it',
      (SELECT count(*) FROM public.quests WHERE quest_type::text = 'quiz');
  END IF;
END $$;

-- ============================================================================
-- PART 2: review_cards.body — jsonb → text (markdown)
-- ============================================================================

ALTER TABLE public.review_cards
  ALTER COLUMN body DROP DEFAULT,
  ALTER COLUMN body TYPE text USING body::text,
  ALTER COLUMN body SET DEFAULT '',
  ALTER COLUMN body SET NOT NULL;

COMMENT ON COLUMN public.review_cards.body IS
'Markdown text. Rendered with react-markdown + remark-gfm. Raw HTML disabled. Custom component map embeds YouTube and direct video URLs.';

-- ============================================================================
-- PART 3: quests.description — jsonb → text (markdown)
-- ============================================================================

ALTER TABLE public.quests
  ALTER COLUMN description DROP DEFAULT,
  ALTER COLUMN description TYPE text USING description::text,
  ALTER COLUMN description SET DEFAULT '',
  ALTER COLUMN description SET NOT NULL;

COMMENT ON COLUMN public.quests.description IS
'Markdown text. Rendered with react-markdown + remark-gfm. Raw HTML disabled. Custom component map embeds YouTube and direct video URLs.';

-- ============================================================================
-- PART 4: Drop columns no longer used
-- ============================================================================

ALTER TABLE public.quests DROP COLUMN IF EXISTS quiz_questions;
ALTER TABLE public.quests DROP COLUMN IF EXISTS deliverable_types;

-- ============================================================================
-- PART 5: Rebuild quest_type enum without 'quiz'
-- ============================================================================

ALTER TABLE public.quests DROP CONSTRAINT IF EXISTS coop_has_group_size;

CREATE TYPE public.quest_type_new AS ENUM ('solo', 'coop', 'daily_quiz');

ALTER TABLE public.quests
  ALTER COLUMN quest_type TYPE public.quest_type_new
  USING quest_type::text::public.quest_type_new;

DROP TYPE public.quest_type;
ALTER TYPE public.quest_type_new RENAME TO quest_type;

ALTER TABLE public.quests ADD CONSTRAINT coop_has_group_size
  CHECK (
    (quest_type = 'coop' AND group_size IS NOT NULL AND group_size >= 2)
    OR quest_type <> 'coop'
  );

COMMIT;
