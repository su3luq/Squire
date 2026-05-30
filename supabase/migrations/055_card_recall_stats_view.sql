-- 055_card_recall_stats_view.sql
-- Per-card recall stats for the teacher Cards workspace difficulty signal.
-- security_invoker = true so review_attempts RLS still applies (teacher sees
-- all; nobody else can read others' attempts). Read-only aggregate.
create or replace view public.card_recall_stats
  with (security_invoker = true) as
  select card_id,
         count(*)::int                           as attempts,
         count(*) filter (where is_correct)::int as correct
  from public.review_attempts
  group by card_id;
