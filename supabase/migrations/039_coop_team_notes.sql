-- Migration 039: Team notes sidebar (Phase 8 Day 4)
--
-- Per-team-member shared scratchpad. All teammates can read each
-- other's notes, only the owner can edit, locked when the instance
-- is finalized (status != 'active'), teacher sees notes only after
-- a submission row exists.

create table public.coop_team_notes (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references public.coop_quest_instances(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  body         text not null default '',
  updated_at   timestamptz not null default now(),
  unique (instance_id, student_id)
);

create index idx_coop_team_notes_instance on public.coop_team_notes (instance_id);
create index idx_coop_team_notes_student  on public.coop_team_notes (student_id);

alter table public.coop_team_notes enable row level security;

create policy notes_select_teacher on public.coop_team_notes
  for select to authenticated
  using (
    (select public.is_teacher(auth.uid()))
    and exists (
      select 1 from public.quest_submissions s
      where s.instance_id = coop_team_notes.instance_id
    )
  );

create policy notes_select_teammates on public.coop_team_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.quest_acceptances qa
      where qa.instance_id = coop_team_notes.instance_id
        and qa.student_id = auth.uid()
    )
  );

create policy notes_update_own on public.coop_team_notes
  for update to authenticated
  using (
    student_id = auth.uid()
    and exists (
      select 1 from public.coop_quest_instances ci
      where ci.id = coop_team_notes.instance_id
        and ci.status = 'active'
    )
  )
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.coop_quest_instances ci
      where ci.id = coop_team_notes.instance_id
        and ci.status = 'active'
    )
  );

create or replace function public.coop_team_notes_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger coop_team_notes_touch
  before update on public.coop_team_notes
  for each row execute function public.coop_team_notes_touch();

create or replace function public.coop_team_notes_seed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.instance_id is not null
     and (old.instance_id is null or old.instance_id is distinct from new.instance_id)
  then
    insert into public.coop_team_notes (instance_id, student_id, body)
    values (new.instance_id, new.student_id, '')
    on conflict (instance_id, student_id) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.coop_team_notes_seed() from anon, authenticated, public;

create trigger coop_team_notes_seed
  after update of instance_id on public.quest_acceptances
  for each row execute function public.coop_team_notes_seed();

insert into public.coop_team_notes (instance_id, student_id, body)
select qa.instance_id, qa.student_id, ''
from public.quest_acceptances qa
join public.coop_quest_instances ci on ci.id = qa.instance_id
where ci.status = 'active'
on conflict (instance_id, student_id) do nothing;

alter publication supabase_realtime add table public.coop_team_notes;
