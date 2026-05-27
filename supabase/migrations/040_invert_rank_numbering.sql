-- Migration 040: Invert rank numbering so Rank 1 = highest XP.
-- Old: 1 = Novice (lowest) ... 7 = Luminary (highest)
-- New: 1 = highest (>= 6000 XP) ... 7 = lowest (< 200 XP)
-- Rank names are dropped at the UI layer; the DB stores the integer only.

create or replace function public.compute_rank_from_xp(xp int)
returns int language plpgsql immutable set search_path = public as $$
begin
    if xp >= 6000 then return 1;
    elsif xp >= 4200 then return 2;
    elsif xp >= 2600 then return 3;
    elsif xp >= 1400 then return 4;
    elsif xp >= 600 then return 5;
    elsif xp >= 200 then return 6;
    else return 7;
    end if;
end;
$$;

-- Flip existing current_rank values: old 1 ↔ new 7, old 4 ↔ new 4, etc.
-- (8 - old_rank works because the range is symmetric around 4.)
update public.profiles set current_rank = 8 - current_rank;
