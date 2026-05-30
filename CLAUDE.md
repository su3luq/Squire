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
| UI primitives | shadcn/ui (in `src/components/ui/`) — base-nova style. Installed: alert, alert-dialog, badge, button, card, dropdown-menu, form, input, label, progress, sonner, tabs, textarea, tooltip |
| Toasts | `sonner` mounted at `src/app/layout.tsx` (no `richColors` — toasts inherit theme tokens; +XP toast in review-session uses inline bronze styling). Tooltip provider mounts there too. |
| Theme switching | Light / Dark / System tri-state. Pre-paint script in `src/app/layout.tsx` reads localStorage (`rl-theme`) + OS preference and sets `.dark` on `<html>` before React mounts so there's no FOUC. Toggle on `/settings` Appearance section uses `src/lib/use-theme.ts`. |
| Typography | Inter for text + **JetBrains Mono for all numbers** (both via `next/font/google`). The `tabular-nums` utility is routed through the mono face in `globals.css`, so every numeric/stat display app-wide gets the tabular HUD look. Display tracking tightened globally on `h1`/`h2`/`h3` (`-0.02em` / `-0.015em` / `-0.01em`). |
| Forms | react-hook-form + zod |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) — three client patterns: browser / server / middleware. Storage is NOT used; see "Known constraints" below. |
| Push notifications | Web Push API + Service Worker (shipped) |
| SRS algorithm | FSRS-4.5 via `ts-fsrs` package |
| Rich text editor | MDXEditor (Lexical-based, markdown round-trip) on all five authoring surfaces. Dynamic-imported via `src/components/mdx-editor.tsx` wrapper → `mdx-editor-impl.tsx` to keep the Lexical bundle off the initial payload. Wired to the theme: `--accent*` and `--base*` MDXEditor tokens point at our shadcn variables so the editor surfaces shift with light/dark. |
| Celebration effects | `canvas-confetti` for quest-pass bursts; `src/components/celebration-gate.tsx` polls unread `rank_up` + `submission_passed` notifications on student app load. |
| AI-likelihood detection | Deferred to v2 — `quest_submissions.ai_likelihood_score` stays NULL |

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
17. **The rank ladder is dynamic.** Tiers, XP thresholds, gradients, and optional names live in the `ranks` table (migration 049) and are edited by teachers at `/teacher/settings/ranks`. The `compute_rank_from_xp()` function reads the table; `src/lib/ranks-config.ts` mirrors it on the client via `getRanksMap()` + `getRankProgress()`. The legacy hardcoded ladder in `src/lib/ranks.ts` is kept for fallback only — prefer the dynamic helpers for new code.
18. **Streak bookkeeping is trigger-driven.** `profiles.streak_days` + `streak_last_day` are updated by the `trg_update_review_streak` trigger on `review_attempts` INSERT (migration 050). The trigger does the day-boundary math in Saigon time. Never write to these columns directly from app code. The display layer in `src/lib/streak.ts` reconciles the cached value against today/yesterday so a stale streak can't lie between visits.
19. **All colors go through theme tokens. Never hardcode `slate-*` / `blue-*` / `emerald-*` etc. for shell surfaces.** Use `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `border-border`, `text-primary` etc. — they shift correctly when `.dark` flips. Semantic chips (`StatusChip` tones, the streak amber flame, the destructive red, the `NEW` emerald badge) may use color literals **only when paired with a `dark:` variant** (e.g. `bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300`). When in doubt, use a theme token. The brand mark is the bronze accent (`--primary` = `oklch(0.68 0.13 45)`, ≈ `#cc7e51`) — anything that wants to convey "positive / brand / win" should use `bg-primary/15 text-primary`, not emerald.

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

### XP and Ranks (7 tiers default — dynamic via the `ranks` table, per migration 049)

Default seeded ladder (lower number = higher rank, per migration 040):

| Rank | XP threshold |
|---|---|
| 1 | 6,000+ (top) |
| 2 | 4,200 |
| 3 | 2,600 |
| 4 | 1,400 |
| 5 | 600 |
| 6 | 200 |
| 7 | 0 (start) |

Students start at Rank 7 and climb toward Rank 1. Ranks are shown by number; an optional `name` column on the `ranks` table can override the display. The teacher edits the ladder (tier count, XP thresholds, gradient colors, names) at `/teacher/settings/ranks`. Source of truth: the `ranks` table + `compute_rank_from_xp()` Postgres function + `src/lib/ranks-config.ts` (`getRanksMap()`, `getRankProgress()`).

XP awarded via `xp_ledger` inserts. A DB trigger auto-updates `profiles.xp_total` and `current_rank`. **Never write to `xp_total` or `current_rank` directly — always insert into `xp_ledger`.**

XP per source: review MCQ = 5 XP per correct answer (no perfect bonus, no XP for wrong), solo quest = 20–35, coop quest = 50–80 per member, special quest = 150–300.

### Learning Velocity (recomputed nightly by `pg_cron`)
For each student, look at review attempts in the trailing **14 days**. Weight each answer by card age:
- ≤7 days: weight 1.0
- 8–30 days: weight 1.5
- 31–90 days: weight 2.5
- 90+ days: weight 4.0

`velocity = Σ(weight × correct) / Σ(weight)`, clamped to [0, 1]. Stored on `profiles.learning_velocity`. Students with zero attempts in the window get velocity = 0. Implementation: SECURITY DEFINER function `recompute_learning_velocity()` (migration 017) scheduled by `pg_cron` at 03:00 Saigon (20:00 UTC). Pure SQL — no Edge Function wrapper.

### Co-op Quest Instancing
- Teacher creates a coop quest with `group_size` and `availability_mode` (open / timed / whole_class / limited_instances).
- Class shows an active instance at `n/group_size` filled.
- When `group_size`-th student joins → instance status flips `forming` → `active`. Acceptance rows move from `pending`-equivalent to `active`.
- **Simultaneously, a new instance is spawned** at `0/group_size` IF more eligible students remain (and the quest hasn't hit its `max_instances` cap or other limit).
- Students who completed an instance of this quest never see it again (enforced by `idx_no_repeat_coop_per_student`).
- Teacher can disband a non-full instance via UI → status becomes `disbanded`, members released back to acceptance pool.
- **The instance-spawn logic needs a Postgres advisory lock or row-level lock to avoid race conditions** when two students hit "accept" simultaneously on the last slot.

### Review (FSRS-driven)
Review is driven by FSRS scheduling. Cards become reviewable when their `card_reviews.due_at` is past. The student opens **`/student/cards`** and starts review from the hero; the MCQ session takes over the page in place and answers MCQs from due cards. There is **no fixed session length, no daily reset, and no 06:00 cron**. The system is event-driven by FSRS due dates.

**Review + Library are merged into one library-led "Cards" page** (`/student/cards`, 2026-05-31). It pairs the gamified review hero (animated daily-goal ring + Zap CTA, in-place session takeover) with the full card browser (lesson-folder grid + a "Continue" strip for the current lesson + search). Due cards are flagged in the grid; reading is always available, MCQs only when due ("Review now" / "Next review in N"). Single source of "due" is the `list_review_session` RPC (powers the hero count, the session, and the grid flags). The old `/student/review` and `/student/library` routes 308-redirect here. Code: `src/app/student/cards/*` + `src/components/cards/*` (the session component lives at `src/components/cards/review-session.tsx`). Design: `docs/superpowers/specs/2026-05-30-cards-review-merge-design.md`.

Per MCQ:
- Correct → +5 XP awarded immediately via `xp_ledger`; the answer counts toward the card's "all correct" tally
- Wrong → 0 XP; the answer counts toward the card's "wrong on any" tally

After all MCQs on a card are answered in one cycle: wrong-on-any → FSRS rating `Again`; correct-on-all → `Good`. The client runs `ts-fsrs` locally to compute the new state and writes back to `card_reviews` via the existing student-update RLS policy. The XP awards and the FSRS rating are independent — XP is per-MCQ; FSRS is per-card.

**Strict requirement:** every card must have ≥1 MCQ before it can be unlocked for a class. If you can't write an MCQ, the card is too vague — fix the card.

Missed reviews are tracked: 4 days in a row where the student has due cards and doesn't open any review session → teacher gets a notification.

### Daily Review Streak (migration 050)
`profiles.streak_days` + `streak_last_day` track consecutive Saigon-days with ≥1 review attempt. The `trg_update_review_streak` trigger fires on every `review_attempts` INSERT: same-day attempts are no-ops; a gap of exactly 1 day → +1; any larger gap → reset to 1. Display lives in:
- `src/components/streak-widget.tsx` — flame + day count, persistent in the student sidebar (full + icon variants) and mobile header
- `src/components/daily-review-goal.tsx` — replaces the static "Today's review" card with state-aware framing (alive / at-risk / broken / no-cards-due) and a 5-card daily goal

`src/lib/streak.ts::computeEffectiveStreak()` is the canonical read helper — it reconciles the cached column against today/yesterday so a stale streak doesn't lie between visits without writing to the DB.

### Failed Quests
- Teacher marks `quest_submissions.status = 'failed'` with required `teacher_feedback`.
- Student's `quest_acceptances` row stays `active` (NOT failed). They can resubmit.
- Only when teacher marks a submission `passed` does the acceptance transition to `passed` and XP gets awarded.
- Coop fails: whole instance fails; ALL members must resubmit (single re-submission by any member counts for the group, same as initial).

---

## Brand & Theme

**Brand mark:** bronze accent at `oklch(0.68 0.13 45)` (≈ `#cc7e51`). Constant across light + dark; only the shell shifts.

**Light mode** (Claude-website inspired): warm cream parchment shell at `oklch(0.985 0.008 75)`, warm dark foreground at `oklch(0.19 0.012 35)`. Sidebar a touch warmer than the main canvas.

**Dark mode**: neutral charcoal shell at `oklch(0.16 0.003 270)` — quiet Claude-style canvas where the bronze accent is the only saturated thing on screen. No warm tint on surfaces or borders (an earlier "warm-dark" / "dark-gold" experiment was rolled back). Sidebar matches canvas; separation comes from the border alone.

**Token source of truth:** `src/app/globals.css` — `:root` for light, `.dark` for dark. Tailwind classes (`bg-background`, `text-foreground`, `bg-card`, `border-border`, etc.) read these CSS variables; the `.dark` class on `<html>` flips them.

**Typography:** Inter for text (via `next/font/google`), with **JetBrains Mono for numbers** — the `tabular-nums` utility is routed through the mono face in `globals.css` so XP / ranks / counts / timers read as tabular stats everywhere. Display tracking on `h1`/`h2`/`h3` is tightened globally (`-0.02em` / `-0.015em` / `-0.01em`) for editorial confidence.

**Theme toggle:** `/settings` → Appearance. Tri-state (Light / Dark / System) backed by `useTheme` in `src/lib/use-theme.ts` (localStorage key `rl-theme`). A pre-paint inline script in `src/app/layout.tsx` sets `.dark` on `<html>` before React mounts so there's no FOUC on hard refresh.

**Brand sandbox** at `/teacher/settings/brand` renders six variants (3 accents × 2 modes) so you can A/B compare without touching globals. Kept as a reference for future palette experiments.

---

## Database Schema (already created)

21 tables in `public` schema. **Do not run migrations to alter the schema without asking the user first.** Schema reference: see `docs/SCHEMA.md`.

Key tables: `profiles` (incl. `streak_days` + `streak_last_day` from migration 050), `classes`, `lessons`, `lesson_unlocks`, `review_cards`, `card_quiz_questions`, `card_reviews`, `review_attempts`, `quests`, `coop_quest_instances`, `coop_member_drafts`, `coop_team_notes`, `quest_acceptances`, `quest_submissions`, `xp_ledger`, `notifications`, `push_tokens`, `teacher_notes`, `student_assessments`, `app_settings`, `ranks` (dynamic rank ladder, migration 049).

**RLS is enabled on all tables via migration 008** (`supabase/migrations/008_rls_policies_and_assessments_split.sql`). Helper functions (`is_teacher`, `user_class_id`, `users_share_class`, `lookup_class_by_invite`, `is_username_available`), the `public_profiles` security-barrier view, and the `student_assessments` split are documented in `docs/SCHEMA.md`.

---

## Current State

All major planned work is shipped. The app is in polish / maintenance mode.

| Phase | Status | Notes |
|---|---|---|
| 1 — Foundation | ✅ Shipped | Auth, RLS (migration 008), self-registration, role guard |
| 2 — Lessons & Cards | ✅ Shipped | Markdown content model; see `docs/PHASE-2-PLAN.md` |
| 3 — Review-Quiz & XP | ✅ Shipped | FSRS-driven review, leaderboard, nightly velocity cron |
| 4 — Quests Core | ✅ Shipped | Solo quest loop; see `docs/PHASE-4-PLAN.md` |
| 5 — Co-op + Analytics | ✅ Shipped except AI-likelihood (deferred to v2) |
| 6 — Web Push | ✅ Shipped | See `docs/PUSH_SETUP.md` |
| 7 — UI redesign + perf | ✅ Shipped | See `docs/PHASE_7_UI_AND_PERF.md` |
| 8 — MDXEditor + coop drafts | ✅ Shipped | See `docs/PHASE_8_EDITOR.md` |
| 9 — Gamification overhaul + perf hardening (2026-05-30) | ✅ Shipped | Six-pass arc; ranks dynamic (migration 049), streak system (050), DB perf hardening (051 + 052). Detail in commit log `cb92249..26163e4`. |
| 10 — Brand + theme (2026-05-31) | ✅ Shipped | Bronze accent identity, warm-cream light shell + neutral-charcoal dark shell, tri-state appearance toggle, pre-paint FOUC guard. Every chrome surface migrated from hardcoded slate/blue/emerald to theme tokens. See `## Brand & Theme` below. |
| 11 — Cards page (Review + Library merge, 2026-05-31) | ✅ Shipped | One library-led `/student/cards`: gamified review hero (animated goal ring + Zap CTA, in-place session takeover) + lesson-folder browser + read↔recall reader. JetBrains Mono numbers app-wide; `color-scheme` set for theme-correct autofill. Old `/student/review` + `/student/library` redirect in. See `### Review (FSRS-driven)` above + `docs/superpowers/specs/2026-05-30-cards-review-merge-design.md`. |
| 12 — Teacher Cards authoring (2026-05-31) | ✅ Shipped | Teacher **Lessons → Cards** rename + rebuild. `/teacher/cards` workspace (lessons-as-groups, actionable command zone, per-lesson **needs-a-question** + **Recall** signals); focused themed card editor (sectioned Content/Quiz, click-a-choice-to-mark-correct, sticky save bar) replacing the old slate/blue/amber forms; lesson management page keeps class-access/edit/delete (card list moved to the workspace). `/teacher/lessons*` redirects in. New read-only `card_recall_stats` view (migration 055, `security_invoker`) powers Recall = % of `review_attempts` correct (helper `src/lib/recall.ts`). Components in `src/components/teacher-cards/*`. Spec: `docs/superpowers/specs/2026-05-30-teacher-cards-authoring-design.md`. |

`docs/PLAN.md` and the per-phase docs are kept as historical reference; they describe what was built and why. Day-to-day work today is feature polish, bug fixes, and small UX improvements rather than phased shipping.

### Phase 9 — Gamification overhaul (six passes, 2026-05-29 → 2026-05-30)

The "ranked-game dopamine, calm-academic shell" hybrid pivot. Restructured the student-facing surface around ladder identity + competitive tension; cleared the Phase 7 Stage 5 backlog on the way out.

1. **Foundation primitives** — added shadcn `badge`, `sonner`, `tooltip`, `dropdown-menu`, `tabs`; built `StatusChip` / `SectionHeader` / `ConfirmButton` / `ToggleChipGroup`. Migrated 7 chip-span sites + 6 destructive confirm dialogs.
2. **Identity + rank prominence** — `RankEmblem`, `RankHero` (student home centerpiece), `ClosestRival` ("60 XP behind X — 1 quest away"), `LeaderboardPodium` (top-3 with crown/medals), global/class scope toggle on leaderboard. Server helper: `getRankProgress()`.
3. **The dopamine loop** — animated `+5 XP` Sonner toast on correct MCQ, theatrical rank-up modal driven by migration-048 notifications, confetti on quest pass via `canvas-confetti`, `RecentWins` feed on student home, opt-in sound preference (no audio assets yet, just the toggle infra).
4. **Streak + daily loop** — migration 050 + trigger; `StreakWidget` persistent in sidebar + mobile header; `DailyReviewGoal` with five state-aware framings + 5-card daily goal. Backfill function recomputes historical streaks.
5. **A11y + convenience polish** — mobile header sign-out as icon, toasts on every previously-silent mutation (sign-out / accept / enroll / submit / mark-read / settings saves), single empty state when both quest boards empty, skeleton loaders for `/student`, `/leaderboard`, `/teacher/analytics`, heatmap + sparkline `aria-label`s.
6. **Performance** — migrations 051 + 052: 28 RLS policies rewritten with `(select auth.uid())`, 4 FK indexes added, 2 duplicate indexes dropped; MDXEditor wrapped in `next/dynamic` so its Lexical bundle no longer loads on pages that might-but-don't render an editor.

## Known Constraints

- **Supabase Storage is broken on this project.** Every authenticated upload is rejected by storage-api with `{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}` regardless of how permissive RLS is — including a `bucket_id = 'avatars'`-only check with no auth gating, posted with no Authorization header. Direct Postgres INSERTs to `storage.objects` with the same row succeed in simulation as both `authenticated` and `anon`, so the rejection is inside storage-api itself, not at the DB layer. Migrations 041–047 are the trail. **Workaround:** avatars are stored as base64 `data:image/webp;base64,…` URLs directly in `profiles.avatar_url`. Do not propose moving avatars (or any new feature) back to a Supabase bucket without confirming storage has been fixed. The orphan `avatars` bucket row + one dashboard-uploaded test image remain in `storage.buckets` / `storage.objects` (the `storage.protect_delete()` trigger blocks direct DELETE; they're harmless).

- **`ai_likelihood_score`** stays NULL — AI-detection classifier is deferred to v2 unless cheating becomes a real problem.

---

## Conventions

- **File structure:** Next.js App Router under `src/app/`. Pages at `src/app/login/page.tsx`, `src/app/student/page.tsx`, etc. Role gating enforced server-side by `src/middleware.ts` — redirects happen before any render.
- **Components:** `src/components/`, with shadcn/ui primitives in `src/components/ui/`.
- **Chips & tiles (canonical — do not hand-roll):** every status/label pill uses `StatusChip` (`src/components/status-chip.tsx`, fixed `h-5` via shadcn `Badge`) with a semantic `tone` — **bronze (`good`) = positive/live/passing/unlocked/due**, `warn` = amber (pending/at-risk), `danger` = red (failed), `muted` = neutral/counts. `QuestStatusChip` maps quest/submission statuses. Card-grid tiles use `GridTile` (`src/components/ui/grid-tile.tsx`, shared `min-h` + dashed `add` variant) so empty and filled tiles always align. Hand-rolling `rounded-full px-… text-[10px]` chips or bespoke tile heights is what caused the alignment drift — don't. (Out of scope, kept distinct: nav badges, the inbox count bubble, `ToggleChipGroup` filters, the streak flame.)
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
- AI-likelihood classifier on text submissions — `quest_submissions.ai_likelihood_score` stays NULL for v1
