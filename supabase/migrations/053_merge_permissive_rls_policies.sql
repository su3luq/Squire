-- 053_merge_permissive_rls_policies.sql
-- Collapse duplicate permissive RLS policies into one policy per (table, action)
-- to satisfy the multiple_permissive_policies advisor and cut RLS eval overhead
-- on the hot read tables. Each merged policy is the EXACT OR of the policies it
-- replaces, so row visibility is unchanged. Also drops push_tokens per-action
-- policies fully covered by its FOR ALL owner policy.
--
-- Deliberately NOT touched (invasive split of FOR ALL teacher policies for a
-- negligible gain — is_teacher() is STABLE, evaluated once per query):
--   classes, lessons, lesson_unlocks, coop_quest_instances, quests,
--   review_cards, quest_acceptances, profiles INSERT/UPDATE, push_tokens SELECT.

-- card_reviews (SELECT)
drop policy if exists card_reviews_student_select_own on public.card_reviews;
drop policy if exists card_reviews_teacher_read       on public.card_reviews;
create policy card_reviews_select on public.card_reviews
  for select to authenticated
  using ((student_id = (select auth.uid())) or is_teacher());

-- review_attempts (SELECT)
drop policy if exists review_attempts_student_read_own on public.review_attempts;
drop policy if exists review_attempts_teacher_read     on public.review_attempts;
create policy review_attempts_select on public.review_attempts
  for select to authenticated
  using ((student_id = (select auth.uid())) or is_teacher());

-- xp_ledger (SELECT)
drop policy if exists xp_ledger_student_read_own on public.xp_ledger;
drop policy if exists xp_ledger_teacher_read     on public.xp_ledger;
create policy xp_ledger_select on public.xp_ledger
  for select to authenticated
  using ((student_id = (select auth.uid())) or is_teacher());

-- quest_submissions (SELECT)
drop policy if exists submissions_student_read_own on public.quest_submissions;
drop policy if exists submissions_teacher_select   on public.quest_submissions;
create policy quest_submissions_select on public.quest_submissions
  for select to authenticated
  using (
    (((acceptance_id is not null) and is_my_acceptance(acceptance_id))
      or ((instance_id is not null) and is_my_coop_instance(instance_id)))
    or is_teacher()
  );

-- profiles (SELECT only — INSERT/UPDATE left untouched; sensitive table)
drop policy if exists profiles_student_read_self on public.profiles;
drop policy if exists profiles_teacher_read_all  on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using ((id = (select auth.uid())) or is_teacher());

-- coop_member_drafts (SELECT)
drop policy if exists drafts_select_teacher   on public.coop_member_drafts;
drop policy if exists drafts_select_teammates on public.coop_member_drafts;
create policy drafts_select on public.coop_member_drafts
  for select to authenticated
  using (
    is_teacher()
    or exists (
      select 1 from public.quest_acceptances qa
      where qa.instance_id = coop_member_drafts.instance_id
        and qa.student_id = (select auth.uid())
    )
  );

-- coop_team_notes (SELECT)
drop policy if exists notes_select_teacher   on public.coop_team_notes;
drop policy if exists notes_select_teammates on public.coop_team_notes;
create policy notes_select on public.coop_team_notes
  for select to authenticated
  using (
    (is_teacher() and exists (
      select 1 from public.quest_submissions s
      where s.instance_id = coop_team_notes.instance_id
    ))
    or exists (
      select 1 from public.quest_acceptances qa
      where qa.instance_id = coop_team_notes.instance_id
        and qa.student_id = (select auth.uid())
    )
  );

-- push_tokens: drop per-action policies already covered by the FOR ALL owner
-- policy (push_tokens_owner_all USING user_id = auth.uid()).
drop policy if exists push_tokens_user_select_own on public.push_tokens;
drop policy if exists push_tokens_user_insert_own on public.push_tokens;
drop policy if exists push_tokens_user_update_own on public.push_tokens;
drop policy if exists push_tokens_user_delete_own on public.push_tokens;
