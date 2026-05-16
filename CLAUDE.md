# Squire — Project Briefing for Claude Code

**This file is loaded automatically at the start of every Claude Code session. Read it fully before doing anything else.**

---

## What This App Is

Squire is a gamified learning platform for a single teacher (the developer/author of this repo) and up to 500 Vietnamese high school ESL/research students at an international school. Course runs 40 weeks. App is web + iOS + Android via a single Expo codebase. Teacher and students both use the same app; UI is role-gated.

**This is the teacher's own app for their own students. They are the only developer and the only teacher (for now).**

---

## The Stack (LOCKED — do not change without asking)

| Layer | Tool |
|---|---|
| Frontend | Expo SDK (React Native) with Expo Router |
| Web build | Expo for Web → deployed to Vercel |
| Mobile build | Expo EAS → TestFlight + Play Internal Testing |
| Language | TypeScript everywhere |
| Styling | NativeWind (Tailwind for React Native) |
| Backend | Supabase (Postgres + Auth + Realtime + Storage + Edge Functions) |
| Push notifications | Expo Notifications (free, works iOS + Android) |
| SRS algorithm | FSRS-4.5 via `ts-fsrs` package |
| AI-likelihood detection | Small open-source classifier (decide at Phase 5) |

**Supabase project ID:** `dicufymnejhrkrakgluu` (region: ap-northeast-2 / Seoul)
**Supabase project name:** SQUIRE

---

## Hard Rules

1. **All sensitive teacher-only data is protected by RLS at the DB layer**, not by hiding fields in app code. Never write app-level filtering as the primary defense.
2. **The student bundle must not contain code paths that fetch teacher-only columns.** Use separate queries scoped by role.
3. **One quest accepted at a time per slot (1 solo + 1 coop).** Enforced by Postgres partial unique indexes (already in place). Do not bypass.
4. **A student cannot abandon an accepted quest.** They submit, and the teacher passes or fails. On fail, the acceptance stays active with feedback shown; resubmit until pass.
5. **A student cannot do the same coop quest twice** (no helping classmates). Enforced by unique index.
6. **All times are Saigon time (Asia/Ho_Chi_Minh).** Store as `timestamptz` (UTC), convert for display.
7. **English-only UI.** This is an English-learning app. No localization.
8. **Free tier first.** Don't introduce paid services without flagging. Current paid items: Apple Developer ($99/yr), Google Play one-time ($25). Everything else free.
9. **Never commit secrets.** `.env` is gitignored. Supabase anon key goes in `.env` for local; production uses Vercel/EAS environment variables.

---

## The Privacy Model (CRITICAL)

| Field | Teacher | Student (self) | Other students |
|---|---|---|---|
| `teacher_notes.*` | ✅ | ❌ | ❌ |
| `profiles.english_proficiency_pearson` | ✅ | ❌ | ❌ |
| `profiles.english_proficiency_cefr` | ✅ | ❌ | ❌ |
| `profiles.full_name` | ✅ | ✅ | ❌ |
| `profiles.email` | ✅ | ✅ | ❌ |
| `profiles.age` | ✅ | ✅ | ✅ (within class) |
| `profiles.learning_velocity` | ✅ | ✅ | ✅ (within class) |
| `profiles.xp_total`, `current_rank` | ✅ | ✅ | ✅ (global leaderboard) |
| `profiles.username`, `display_name`, `avatar_url` | ✅ | ✅ | ✅ (global) |
| `profiles.interest_tags` | ✅ | ✅ | ✅ (within class) |
| `card_quiz_questions.correct_choice` | ✅ | ❌ | ❌ |

RLS policies will enforce all of these. Never expose teacher-only columns in any select query a student can run.

---

## Core Mechanics Reference

### XP and Ranks (7 tiers)
| # | Name | XP threshold |
|---|---|---|
| 1 | Novice | 0 |
| 2 | Apprentice | 200 |
| 3 | Adept | 600 |
| 4 | Expert | 1,400 |
| 5 | Master | 2,600 |
| 6 | Grandmaster | 4,200 |
| 7 | Luminary | 6,000 |

XP awarded via `xp_ledger` inserts. A DB trigger auto-updates `profiles.xp_total` and `current_rank`. **Never write to `xp_total` or `current_rank` directly — always insert into `xp_ledger`.**

XP per source: daily quiz attempt = 5 XP (+3 perfect bonus), solo quest = 20–35, coop quest = 50–80 per member, special quest = 150–300.

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

### Daily Quiz
- One per student per calendar day, Saigon TZ. Resets at 06:00 local.
- Pulls 3–10 questions from `card_quiz_questions` of unlocked cards in student's class. Number is dynamic based on available cards.
- Edge Function cron generates the question set at 06:00 daily for each student.
- Doesn't exist if the student's class has no unlocked cards yet.
- Missed days are tracked: 4 misses in a row → teacher gets notification.

### Daily Quiz XP Award
- 5 XP for any completion, +3 bonus for 100% correct. No XP if missed.

### Failed Quests
- Teacher marks `quest_submissions.status = 'failed'` with required `teacher_feedback`.
- Student's `quest_acceptances` row stays `active` (NOT failed). They can resubmit.
- Only when teacher marks a submission `passed` does the acceptance transition to `passed` and XP gets awarded.
- Coop fails: whole instance fails; ALL members must resubmit (single re-submission by any member counts for the group, same as initial).

---

## Database Schema (already created)

15 tables in `public` schema. **Do not run migrations to alter the schema without asking the user first.** Schema reference: see `docs/SCHEMA.md`.

Key tables: `profiles`, `classes`, `lessons`, `review_cards`, `card_quiz_questions`, `card_reviews`, `quests`, `coop_quest_instances`, `quest_acceptances`, `quest_submissions`, `daily_quiz_attempts`, `xp_ledger`, `notifications`, `push_tokens`, `teacher_notes`.

**RLS is currently DISABLED on all tables** until Phase 1 RLS migration runs. Treat this as a critical pre-Phase-1 task.

---

## Phased Build Plan

See `docs/PLAN.md` for full detail. Quick reference:

1. **Phase 1 — Foundation**: Expo init, Supabase client, RLS policies, auth (username/password w/ email shim), QR-code class join, role-gated routing, placeholder home screens
2. **Phase 2 — Lessons & Cards**: Lesson CRUD, card creator (headline + body + MCQs), card library, FSRS review session with 4-button rating
3. **Phase 3 — Daily Quiz & XP Engine**: Daily quiz generation Edge Function, quiz UI, XP awards via ledger, leaderboard, velocity nightly cron
4. **Phase 4 — Quests Core**: Solo quest creator + acceptance + submission, teacher review queue, audio submissions
5. **Phase 5 — Co-op Quests & Polish**: Coop quest spawning, teacher analytics dashboard, AI-likelihood classifier
6. **Phase 6 — Notifications & Mobile Push**: Expo push tokens, all notification triggers, quiet hours, mobile builds for TestFlight/Play

---

## Conventions

- **File structure:** Expo Router file-based, `app/(teacher)/...` and `app/(student)/...` for role-gated routes
- **Components:** Co-located, `app/_components/` for shared
- **Types:** Generated from Supabase via `supabase gen types typescript --project-id dicufymnejhrkrakgluu` into `lib/database.types.ts`. Regenerate after every schema change.
- **Supabase client:** Single instance, `lib/supabase.ts`, exports typed client
- **Env vars:** Expo CLI auto-loads `.env` and exports `EXPO_PUBLIC_*` vars. No dotenv package needed.
- **Naming:** snake_case in DB and SQL, camelCase in TypeScript (Supabase JS client auto-converts via `db.schema.ts` config)
- **Commits:** Small and frequent. Conventional commits style preferred (`feat:`, `fix:`, `db:`, `docs:`).
- **Branches:** `main` is deployable. Phase work in `phase-N-description` branches.

---

## When in Doubt

1. Check `docs/PLAN.md` for the agreed design.
2. If the plan is silent or ambiguous, **ask the user before coding**. Don't invent features.
3. If asked to do something that contradicts this file, surface the contradiction and ask.

---

## Things NOT in v1 (v2 backlog — do not build)

- Secret quests (visibility conditions)
- Student-created cards
- Multi-teacher / multi-class-per-teacher
- Web push notifications (mobile push only in v1; web users use in-app inbox)
- Automatic AI grading of text quality
- Localization
