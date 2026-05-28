-- Migration 048: rewrite notify_on_rank_up() to align with the
-- post-040 rank convention (1 = highest) and the number-only UI.
--
-- Bugs fixed:
--   1. Migration 033 hard-coded English rank names (Novice ... Luminary)
--      in pre-040 ordering. We dropped names at the UI layer and
--      inverted the integer mapping in migration 040, so the trigger
--      was emitting wrong names for the wrong tiers.
--   2. The direction check `NEW.current_rank <= OLD.current_rank` was
--      right when "rank up" meant a higher number; post-040 a rank up
--      is a LOWER number, so the old check fired on rank-DOWNS and
--      skipped real promotions.
--
-- The notification body now references the rank integer directly so
-- no name table is needed and the message stays in sync with the
-- canonical ranks defined by compute_rank_from_xp() / src/lib/ranks.ts.
-- Companion data cleanup deletes the historical broken rank_up rows.

create or replace function public.notify_on_rank_up()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
    if new.current_rank is null then
        return new;
    end if;
    -- Rank UP means NEW < OLD (rank 1 = highest). Skip rank-downs and
    -- the initial NULL→value transition.
    if old.current_rank is null or new.current_rank >= old.current_rank then
        return new;
    end if;

    insert into public.notifications (user_id, type, title, body, data)
    values (
        new.id,
        'rank_up',
        'Rank up!',
        format('You''ve climbed to Rank %s.', new.current_rank),
        jsonb_build_object(
            'old_rank', old.current_rank,
            'new_rank', new.current_rank,
            'xp_total', new.xp_total
        )
    );

    return new;
end;
$$;

revoke execute on function public.notify_on_rank_up() from anon, authenticated, public;
