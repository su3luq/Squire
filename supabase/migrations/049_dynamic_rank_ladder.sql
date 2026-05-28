-- Migration 049: dynamic rank ladder.
-- Replaces the hardcoded compute_rank_from_xp() body with a query
-- against a new `ranks` table so the teacher can edit tiers,
-- thresholds, names, and gradient picks at runtime. Seeded with the
-- current 7-tier configuration so behavior is unchanged at install.

create table public.ranks (
  tier int primary key check (tier >= 1),
  min_xp int not null check (min_xp >= 0),
  gradient_id text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ranks_min_xp_key on public.ranks (min_xp);

alter table public.ranks enable row level security;

-- Everyone signed in can read the ladder (students see thresholds).
create policy ranks_read_all on public.ranks
  for select to anon, authenticated using (true);

-- Only teachers write.
create policy ranks_teacher_insert on public.ranks
  for insert to authenticated
  with check (public.is_teacher(auth.uid()));
create policy ranks_teacher_update on public.ranks
  for update to authenticated
  using (public.is_teacher(auth.uid()))
  with check (public.is_teacher(auth.uid()));
create policy ranks_teacher_delete on public.ranks
  for delete to authenticated
  using (public.is_teacher(auth.uid()));

grant select on public.ranks to anon, authenticated;
grant insert, update, delete on public.ranks to authenticated;

-- Seed with the current ladder (gradient_id values resolve to
-- preset gradients defined in src/lib/rank-gradients.ts).
insert into public.ranks (tier, min_xp, gradient_id) values
  (1, 6000, 'mythic'),
  (2, 4200, 'sapphire'),
  (3, 2600, 'emerald'),
  (4, 1400, 'gold'),
  (5,  600, 'silver'),
  (6,  200, 'bronze'),
  (7,    0, 'stone');

-- compute_rank_from_xp() now queries the table. The function is
-- STABLE not IMMUTABLE because the result depends on table contents.
create or replace function public.compute_rank_from_xp(xp int)
returns int language sql stable security definer set search_path = public
as $$
  select tier from public.ranks where min_xp <= xp order by min_xp desc limit 1;
$$;
