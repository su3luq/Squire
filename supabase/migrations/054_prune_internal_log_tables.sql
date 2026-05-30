-- 054_prune_internal_log_tables.sql
-- The two every-minute cron jobs (coop matchmaking + push trigger) write a
-- history row to cron.job_run_details each run (~3 MB/day) and pg_net stores
-- response receipts in net._http_response. Left alone, cron.job_run_details
-- grows unbounded (~1 GB/year of noise). This caps both with a rolling window.
--
-- Touches ONLY these two internal bookkeeping tables — no app tables, and the
-- cron SCHEDULES (cron.job) are untouched, so FSRS / velocity / matchmaking /
-- push all keep running unchanged.

-- One-time purge of accumulated history.
delete from cron.job_run_details where end_time < now() - interval '7 days';
delete from net._http_response    where created  < now() - interval '1 day';

-- Nightly self-prune at 03:30 UTC so the window stays bounded going forward.
-- Idempotent by job name (pg_cron upserts an existing job of the same name).
select cron.schedule('prune-internal-logs', '30 3 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  delete from net._http_response    where created  < now() - interval '1 day';
$$);
