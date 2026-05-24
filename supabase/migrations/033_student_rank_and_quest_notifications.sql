-- Migration 033: student-facing notifications for rank-up and new quests.
--
-- Two AFTER triggers, both SECURITY DEFINER:
--   1. profiles_notify_rank_up — fires when current_rank increases.
--   2. quests_notify_on_create — fires on quest INSERT, fans out to all
--      students. (Quests are class-agnostic in v1, so everyone gets it.)
--
-- We don't touch apply_xp_change(); it stays the single XP authority.

-- =============================================================================
-- Part 1: rank_up notifications
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_on_rank_up()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_rank_name text;
BEGIN
    IF NEW.current_rank IS NULL THEN
        RETURN NEW;
    END IF;
    IF OLD.current_rank IS NOT NULL AND NEW.current_rank <= OLD.current_rank THEN
        RETURN NEW;
    END IF;

    v_rank_name := CASE NEW.current_rank
        WHEN 1 THEN 'Novice'
        WHEN 2 THEN 'Apprentice'
        WHEN 3 THEN 'Adept'
        WHEN 4 THEN 'Expert'
        WHEN 5 THEN 'Master'
        WHEN 6 THEN 'Grandmaster'
        WHEN 7 THEN 'Luminary'
        ELSE 'Unknown'
    END;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
        NEW.id,
        'rank_up',
        'Rank up!',
        format('You''ve reached %s rank.', v_rank_name),
        jsonb_build_object(
            'old_rank', OLD.current_rank,
            'new_rank', NEW.current_rank,
            'rank_name', v_rank_name,
            'xp_total', NEW.xp_total
        )
    );

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_on_rank_up() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS profiles_notify_rank_up ON public.profiles;
CREATE TRIGGER profiles_notify_rank_up
    AFTER UPDATE OF current_rank ON public.profiles
    FOR EACH ROW
    WHEN (NEW.current_rank IS DISTINCT FROM OLD.current_rank)
    EXECUTE FUNCTION public.notify_on_rank_up();

-- =============================================================================
-- Part 2: quest_available notifications
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_on_quest_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_title text;
    v_body text;
    v_data jsonb;
BEGIN
    IF NEW.closed_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.quest_type = 'solo' THEN
        v_title := 'New solo quest';
        v_body := format('"%s" — %s XP', NEW.title, NEW.xp_reward::text);
    ELSE
        v_title := 'New co-op quest';
        v_body := format(
            '"%s" — %s XP per member, teams of %s',
            NEW.title,
            NEW.xp_reward::text,
            COALESCE(NEW.max_team_size::text, '?')
        );
    END IF;

    v_data := jsonb_build_object(
        'quest_id', NEW.id,
        'quest_title', NEW.title,
        'quest_type', NEW.quest_type,
        'xp_reward', NEW.xp_reward,
        'expires_at', NEW.expires_at
    );

    FOR v_student_id IN
        SELECT id FROM public.profiles WHERE role = 'student'
    LOOP
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (v_student_id, 'quest_available', v_title, v_body, v_data);
    END LOOP;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_on_quest_created() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS quests_notify_on_create ON public.quests;
CREATE TRIGGER quests_notify_on_create
    AFTER INSERT ON public.quests
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_quest_created();
