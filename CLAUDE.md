# RankedLearning — Project Briefing for Claude Code

**This file is loaded automatically at the start of every Claude Code session. Read it fully before doing anything else.**

---

## What This App Is

RankedLearning is a gamified learning platform for a single teacher (the developer/author of this repo) and up to 500 Vietnamese high school ESL/research students at an international school. Course runs 40 weeks. Web-only deployment via Next.js (no native apps). Teacher and students both use the same app; UI is role-gated.

**This is the teacher's own app for their own students. They are the only developer and the only teacher (for now).**

---

## The Stack (LOCKED — do not change without asking)

| Layer | Tool |
|---|---|
| Frontend | Next.js 16 (App Router, React 19 Server Components) |
| Web build | Next.js on Vercel |
| Language | TypeScript everywhere |
| Styling | Tailwind CSS v4 (CSS-first config via `@theme` in `src/app/globals.css`, no `tailwind.config.ts`) |
| UI primitives | shadcn/ui (in `src/components/ui/`) |
| Forms | react-hook-form + zod |
| Backend | Supabase (Postgres + Auth + Realtime + Storage + Edge Functions) — three client patterns: browser / server / middleware |
| Push notifications | Web Push API + Service Worker (Phase 6) |
| SRS algorithm | FSRS-4.5 via `ts-fsrs` package |
| AI-likelihood detection | Small open-source classifier (decide at Phase 5) |

**Supabase project ID:** `dicufymnejhrkrakgluu` (region: ap-northeast-2 / Seoul)
**Supabase project name:** RankedLearning

---

## Hard Rules

1. **All sensitive teacher-only data is protected by RLS at the DB layer**, not by hiding fields in app code. Never write app-level filtering as the primary defense.
2. **The student bundle must not contain code paths that fetch teacher-only columns.** Use separate queries scoped by role.
3. **Teacher-only sensitive metadata lives in `student_assessments` table (NOT on `profiles`).** Add new teacher-only fields there, not as new columns on `profiles`. Postgres RLS is row-level, not column-level — keeping these on a separately-policied table is the only clean enforcement path.
4. **One quest accepted at a time per slot (1 solo + 1 coop).** Enforced by Postgres partial unique indexes (already in place). Do not bypass.
5. **A student cannot abandon an accepted quest.** They submit, and the teacher passes or fails. On fail, the acceptance stays active with feedback shown; resubmit until pass.
6. **A student cannot do the same coop quest twice** (no helping classmates). Enforced by unique index.
7. **All times are Saigon time (Asia/Ho_Chi_Minh).** Store as `timestamptz` (UTC), convert for display.
8. **English-only UI.** This is an English-learning app. No localization.
9. **Free tier first.** Don't introduce paid services without flagging. Web-only deployment means no native-app dev fees. Optional: Supabase Pro ($25/mo) if free-tier limits are hit later. Everything else free.
10. **Never commit secrets.** `.env` is gitignored. Supabase anon key goes in `.env` for local; production uses Vercel environment variables.
11. **Web-only deployment.** No native apps. No iOS/Android dev fees. iOS users who want push notifications use Add-to-Home-Screen (Phase 6).
12. **Three Supabase client patterns:** `src/lib/supabase/client.ts` (browser, in client components), `src/lib/supabase/server.ts` (server components and actions), `src/lib/supabase/middleware.ts` (middleware session refresh). Never import the wrong one — TypeScript will catch most mistakes.
13. **All long-form content is authored and stored as markdown text.** Rendered with `react-markdown` + `remark-gfm`. Raw HTML disabled. Custom component map embeds YouTube URLs as iframes and direct video file URLs as `<video>`; images via standard `![](url)` syntax render as `<img>`. There is no structured block editor, no rich-text WYSIWYG, no file upload UI for content authoring. Images and media are referenced via external URLs in markdown.
14. **Create teacher accounts only via `SELECT public.admin_create_teacher(email, password, full_name)`.** Never INSERT directly into `auth.users` — GoTrue's row-scan crashes on NULL token columns. The function handles this and other GoTrue quirks; see migration 013.
15. **Lessons are class-agnostic content; unlocking is per-class.** A lesson is a bundle of cards with no class affiliation. The `lesson_unlocks(lesson_id, class_id, unlocked_at)` join table records when each lesson is unlocked for each class. Teaching workflow: prep lesson once, unlock for class A when you teach class A, unlock for class B (separately, later) when you teach class B. RLS gates student card access on `lesson_unlocks` rows for the student's class. See migration 014.
16. **Review-XP must always be awarded via the `submit_mcq_answer` SECURITY DEFINER function.** Never insert into `review_attempts` or `xp_ledger` directly from client code. The function is the audit + validation chokepoint: it verifies card visibility, computes correctness against the teacher-only `correct_choice`, inserts the attempt row, and writes the +5 XP ledger atomically. See migration 015.

---

## The Privacy Model (CRITICAL)

| Field | Teacher | Student (self) | Other students |
|---|---|---|---|
| `teacher_notes.*` | ✅ | ❌ | ❌ |
| `student_assessments.english_proficiency_pearson` | ✅ | ❌ | ❌ |
| `student_assessments.english_proficiency_cefr` | ✅ | ❌ | ❌ |
| `profiles.email` | ✅ | ✅ | ❌ |
| `profiles.full_name` | ✅ | ✅ | ✅ (public display name) |
| `profiles.age` | ✅ | ✅ | ✅ (within class) |
| `profiles.learning_velocity` | ✅ | ✅ | ✅ (within class) |
| `profiles.xp_total`, `current_rank` | ✅ | ✅ | ✅ (global leaderboard) |
| `profiles.avatar_url` | ✅ | ✅ | ✅ (global) |
| `profiles.interest_tags` | ✅ | ✅ | ✅ (within class) |
| `card_quiz_questions.correct_choice` | ✅ | ❌ | ❌ |

RLS policies will enforce all of these. Never expose teacher-only columns in any select query a student can run.

---

## Core Mechanics Reference

### XP and Ranks (7 tiers — lower number = higher rank, per migration 040)
| Rank | XP threshold |
|---|---|
| 1 | 6,000+ (top) |
| 2 | 4,200 |
| 3 | 2,600 |
| 4 | 1,400 |
| 5 | 600 |
| 6 | 200 |
| 7 | 0 (start) |

Students start at Rank 7 and climb toward Rank 1. Ranks are shown by number only — no English names. Source of truth: `compute_rank_from_xp()` Postgres function + `src/lib/ranks.ts`.

XP awarded via `xp_ledger` inserts. A DB trigger auto-updates `profiles.xp_total` and `current_rank`. **Never write to `xp_total` or `current_rank` directly — always insert into `xp_ledger`.**

XP per source: review MCQ = 5 XP per correct answer (no perfect bonus, no XP for wrong), solo quest = 20–35, coop quest = 50–80 per member, special quest = 150–300.

### Learning Velocity (recomputed nightly by Edge Function cron)
For each student, look at quiz answers in trailing 30 days. Weight each answer by card age:
- ≤7 days: weight 1.0
- 8–30 days: weight 1.5
- 31–90 days: weight 2.5
- 90+ days: weight 4.0

`velocity = sum(weight * correct) / sum(weight)`, clamped to [0, 1]. Stored on `profiles.learning_velocity`.

### Co-op Quest Instancing
- Teacher creates a coop quest with `group_size` and `availability_mode` (open / timed / whole_class / limited_instances).
- Class shows an active instance at `n/group_size` filled.
- When `group_size`-th student joins → instance status flips `forming` → `active`. Acceptance rows move from `pending`-equivalent to `active`.
- **Simultaneously, a new instance is spawned** at `0/group_size` IF more eligible students remain (and the quest hasn't hit its `max_instances` cap or other limit).
- Students who completed an instance of this quest never see it again (enforced by `idx_no_repeat_coop_per_student`).
- Teacher can disband a non-full instance via UI → status becomes `disbanded`, members released back to acceptance pool.
- **The instance-spawn logic needs a Postgres advisory lock or row-level lock to avoid race conditions** when two students hit "accept" simultaneously on the last slot.

### Review (FSRS-driven)
Review is driven by FSRS scheduling. Cards become reviewable when their `card_reviews.due_at` is past. The student opens `/student/review` and answers MCQs from due cards. There is **no fixed session length, no daily reset, and no 06:00 cron**. The system is event-driven by FSRS due dates.

Per MCQ:
- Correct → +5 XP awarded immediately via `xp_ledger`; the answer counts toward the card's "all correct" tally
- Wrong → 0 XP; the answer counts toward the card's "wrong on any" tally

After all MCQs on a card are answered in one cycle: wrong-on-any → FSRS rating `Again`; correct-on-all → `Good`. The client runs `ts-fsrs` locally to compute the new state and writes back to `card_reviews` via the existing student-update RLS policy. The XP awards and the FSRS rating are independent — XP is per-MCQ; FSRS is per-card.

**Strict requirement:** every card must have ≥1 MCQ before it can be unlocked for a class. If you can't write an MCQ, the card is too vague — fix the card.

Missed reviews are tracked: 4 days in a row where the student has due cards and doesn't open any review session → teacher gets a notification.

### Failed Quests
- Teacher marks `quest_submissions.status = 'failed'` with required `teacher_feedback`.
- Student's `quest_acceptances` row stays `active` (NOT failed). They can resubmit.
- Only when teacher marks a submission `passed` does the acceptance transition to `passed` and XP gets awarded.
- Coop fails: whole instance fails; ALL members must resubmit (single re-submission by any member counts for the group, same as initial).

---

## Database Schema (already created)

16 tables in `public` schema. **Do not run migrations to alter the schema without asking the user first.** Schema reference: see `docs/SCHEMA.md`.

Key tables: `profiles`, `classes`, `lessons`, `lesson_unlocks`, `review_cards`, `card_quiz_questions`, `card_reviews`, `review_attempts`, `quests`, `coop_quest_instances`, `quest_acceptances`, `quest_submissions`, `xp_ledger`, `notifications`, `push_tokens`, `teacher_notes`, `student_assessments`.

**RLS is enabled on all tables via migration 008** (`supabase/migrations/008_rls_policies_and_assessments_split.sql`). Helper functions (`is_teacher`, `user_class_id`, `users_share_class`, `lookup_class_by_invite`, `is_username_available`), the `public_profiles` security-barrier view, and the `student_assessments` split are documented in `docs/SCHEMA.md`.

---

## Phased Build Plan

See `docs/PLAN.md` for full detail. Quick reference:

1. **Phase 1 — Foundation**: Next.js scaffold, Supabase SSR client (browser/server/middleware split), RLS policies (migration 008), auth (username/password w/ email shim), self-registration with class dropdown gated by a global registration toggle, middleware-enforced role guard, placeholder home screens
2. **Phase 2 — Lessons & Cards**: Lesson CRUD, card creator (headline + body + MCQs), card library, FSRS review session with 4-button rating
3. **Phase 3 — Review-Quiz & XP Engine**: FSRS-driven MCQ review (no daily cron), XP awards via ledger, leaderboard, velocity nightly cron
4. **Phase 4 — Quests Core**: Solo quest creator + acceptance + submission, teacher review queue, audio submissions
5. **Phase 5 — Co-op Quests & Polish**: Coop quest spawning, teacher analytics dashboard, AI-likelihood classifier
6. **Phase 6 — Web Push Notifications**: Web Push API subscriptions + Service Worker, all notification triggers, quiet hours, in-app notifications inbox, encourage iOS users to Add-to-Home-Screen for native-feeling push support

---

## Conventions

- **File structure:** Next.js App Router under `src/app/`. Pages at `src/app/login/page.tsx`, `src/app/student/page.tsx`, etc. Role gating enforced server-side by `src/middleware.ts` — redirects happen before any render.
- **Components:** `src/components/`, with shadcn/ui primitives in `src/components/ui/`.
- **Types:** Generated from Supabase MCP into `src/lib/database.types.ts`. Regenerate after every schema change.
- **Supabase client:** Three patterns — `src/lib/supabase/client.ts` (browser, client components), `src/lib/supabase/server.ts` (server components + server actions + route handlers), `src/lib/supabase/middleware.ts` (middleware session refresh).
- **Profile reads:** Student-facing queries on user profiles should use `public_profiles` view, not the `profiles` table directly. Teacher queries can use `profiles` for full column access plus `student_assessments` for sensitive metadata.
- **Env vars:** Next.js auto-loads `.env`. Public vars use `NEXT_PUBLIC_*` prefix (exposed to the browser bundle). Server-only secrets stay unprefixed.
- **Naming:** snake_case in DB and SQL, camelCase in TypeScript
- **Commits:** Small and frequent. Conventional commits style preferred (`feat:`, `fix:`, `db:`, `docs:`).
- **Branches:** `main` is deployable. Phase work in `phase-N-description` branches.

---

## When in Doubt

1. Check `docs/PLAN.md` for the agreed design.
2. If the plan is silent or ambiguous, **ask the user before coding**. Don't invent features.
3. If asked to do something that contradicts this file, surface the contradiction and ask.

---

## Operating Protocol

This project runs with one Claude Code session as primary builder. An architect (chat-based Claude session at https://claude.ai) is on call but not in the day-to-day loop. The protocol below defines when each operates.

### Default mode: autonomous execution

You operate autonomously for the vast majority of work. This includes:
- Building new screens that follow established patterns
- Wiring forms, hooking realtime, adding UI
- Bug fixes and refactors within an established pattern
- Routine feature additions per the PLAN.md
- Writing tests
- Dependency installs that are unambiguous (e.g., needed for a feature already approved)
- Database schema work via Supabase MCP (subject to the rules below)

For autonomous work: build, validate (typecheck + lint + relevant smoke tests), commit, push, report.

### Summon the architect (chat-based Claude session) when:

1. A genuinely new architectural decision arises — a library choice with 3+ defensible answers, a schema pattern that'll repeat across many features, a framework-level pivot.
2. You're stuck for more than ~10 minutes on a problem and don't have a clear next step.
3. Phase boundaries — before starting Phase 2, 3, 4, etc., the user typically wants a brief check-in with the architect.
4. Security-sensitive new work — auth flow changes, new RLS policies on new tables, anything touching `xp_ledger` or `student_assessments`.
5. The user explicitly says "ask the architect."

### Supabase MCP rules

The `mcp__claude_ai_Supabase__*` tools are available. Use them for all database work — no more relaying SQL through the architect.

**HARD RULES on MCP usage:**

a) **Never always-approve `mcp__claude_ai_Supabase__execute_sql`, `mcp__claude_ai_Supabase__apply_migration`, or any other MCP write tool.** The user must see and approve every SQL statement before it runs. This is the security backbone — silent schema changes are unacceptable.

b) **Migration workflow:**
   i. Draft the SQL in a code block inside your response. State what it does and why.
   ii. Wait for explicit user approval ("yes apply" or "approved").
   iii. Apply via `mcp__claude_ai_Supabase__apply_migration` with a descriptive name like `NNN_short_description`.
   iv. Commit the SQL file to `supabase/migrations/NNN_short_description.sql` in the repo.
   v. After ANY schema change, regenerate types via `mcp__claude_ai_Supabase__generate_typescript_types` and write the result to `src/lib/database.types.ts`. Commit the types update separately or as part of the same migration commit.
   vi. Run `mcp__claude_ai_Supabase__get_advisors` with `type="security"` after the migration and flag any new lints in your report.

c) **Read-only MCP tools** (`list_tables`, `execute_sql` with SELECT-only, `get_advisors`, `generate_typescript_types`) can be called freely — these don't mutate state.

d) **Never run `DELETE` / `DROP` / `TRUNCATE` / `ALTER` without explicit user approval**, even if the user asked for a refactor. State what you'll drop, wait for "approved".

### Escalation discipline (unchanged from prior calibration)

- Dep additions, config changes, and structural moves bubble up to user attention even if the fix is "obvious."
- A user "continue" is NOT a substitute for architect review on architectural decisions — it covers resuming authorized work and operational recovery only.
- When in doubt, flag rather than improvise.
- Bias toward escalation; loops are cheap, bad foundations are expensive.

### Validation discipline (unchanged)

Every commit-blocking smoke test goes through:
1. `npm run typecheck` → must exit 0
2. `npm run lint` → must pass or only warn on accepted items
3. `npm run dev` → curl smoke + bundle-grep validation as appropriate

---

## Things NOT in v1 (v2 backlog — do not build)

- Secret quests (visibility conditions)
- Student-created cards
- Multi-teacher / multi-class-per-teacher
- Automatic AI grading of text quality
- Localization
- Standalone quiz quests (teacher-authored MCQ quests beyond the review-quiz flow) — MCQs only exist as card-attached questions surfaced via FSRS-driven review in v1
- Per-card-question difficulty rating (Hard / Easy buttons). MCQ correctness drives FSRS as Good/Again binary; no nuanced self-rating in v1
- In-browser audio recording for any purpose
- Image/audio file uploads for content authoring or submissions (use markdown image syntax + external hosting instead)
- Per-card prev/next navigation inside the card detail modal
