-- Migration 035: Co-op per-member drafts (Phase 8 Day 2)
--
-- One draft row per team member per instance. Drafts are seeded
-- automatically when the matchmaking RPC assigns a member to an
-- instance. Captain-only submit_quest stays in place for now;
-- Day 3 will replace it with the per-member submit + finalize flow.

create table public.coop_member_drafts (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references public.coop_quest_instances(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  body_md      text not null default '',
  submitted_at timestamptz null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (instance_id, student_id)
);

create index idx_coop_member_drafts_instance on public.coop_member_drafts (instance_id);
create index idx_coop_member_drafts_student  on public.coop_member_drafts (student_id);

alter table public.coop_member_drafts enable row level security;

-- Teachers see all drafts (for review + post-submit visibility).
create policy drafts_select_teacher on public.coop_member_drafts
  for select to authenticated
  using ((select public.is_teacher(auth.uid())));

-- Students see drafts for instances they belong to (teammates' drafts).
create policy drafts_select_teammates on public.coop_member_drafts
  for select to authenticated
  using (
    exists (
      select 1 from public.quest_acceptances qa
      where qa.instance_id = coop_member_drafts.instance_id
        and qa.student_id = auth.uid()
    )
  );

-- Students update only their own row, only while the instance is active.
-- When the team finalizes or the teacher passes, instance.status changes
-- and this policy locks the row.
create policy drafts_update_own on public.coop_member_drafts
  for update to authenticated
  using (
    student_id = auth.uid()
    and exists (
      select 1 from public.coop_quest_instances ci
      where ci.id = coop_member_drafts.instance_id
        and ci.status = 'active'
    )
  )
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.coop_quest_instances ci
      where ci.id = coop_member_drafts.instance_id
        and ci.status = 'active'
    )
  );

-- No INSERT policy: only the seeding trigger (SECURITY DEFINER) writes rows.

create or replace function public.coop_member_drafts_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger coop_member_drafts_touch
  before update on public.coop_member_drafts
  for each row execute function public.coop_member_drafts_touch();

-- Seed a draft whenever a member is assigned to an instance.
-- Fires for the matchmaking RPC (which sets instance_id on each
-- quest_acceptance row) and would also catch any future flow that
-- moves an acceptance into an instance.
create or replace function public.coop_member_drafts_seed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.instance_id is not null
     and (old.instance_id is null or old.instance_id is distinct from new.instance_id)
  then
    insert into public.coop_member_drafts (instance_id, student_id, body_md)
    values (new.instance_id, new.student_id, '')
    on conflict (instance_id, student_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger coop_member_drafts_seed
  after update of instance_id on public.quest_acceptances
  for each row execute function public.coop_member_drafts_seed();

-- Backfill: seed drafts for currently-active instances. Safe to re-run
-- (ON CONFLICT DO NOTHING) — Day 3 wiring will rely on this row existing.
insert into public.coop_member_drafts (instance_id, student_id, body_md)
select qa.instance_id, qa.student_id, ''
from public.quest_acceptances qa
join public.coop_quest_instances ci on ci.id = qa.instance_id
where ci.status = 'active'
on conflict (instance_id, student_id) do nothing;
