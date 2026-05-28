# RankedLearning — Implementation Plan

Full project plan as agreed between teacher and architect (Claude). This is the source of truth for what gets built. Diverging from this document requires a conversation, not a unilateral decision.

---

## Current Status (2026-05-28)

All phases in §8 below are **shipped**. The app is in polish / maintenance mode. The phase write-ups remain as historical reference — they describe what was built and why. Per-phase deep dives:

- `docs/PHASE-2-PLAN.md` — markdown content model (Lessons & Cards)
- `docs/PHASE-4-PLAN.md` — solo quest loop
- `docs/PHASE_7_UI_AND_PERF.md` — UI redesign + performance pass
- `docs/PHASE_8_EDITOR.md` — MDXEditor migration + co-op per-member drafts

Two notable deviations from the original plan:
1. **AI-likelihood classifier (Phase 5)** — deferred to v2. `quest_submissions.ai_likelihood_score` stays NULL.
2. **Supabase Storage** — unusable on this project. Avatars are stored as base64 data URLs in `profiles.avatar_url`. See "Known Constraints" in `CLAUDE.md`. Migrations 041–047 trail the debugging.

---

## 1. Scope

**Users:** 1 teacher (the author), up to 500 high school students at an international school in Saigon, Vietnam. Course is 40 weeks.

**Platforms:** Web only (laptop, tablet, mobile browser). No native apps.

**Languages:** UI in English only (ESL learning context).

**Timezone:** All times stored as UTC, displayed in Asia/Ho_Chi_Minh.

---

## 2. Tech Stack

- **Frontend:** Next.js 16 (App Router, React 19 Server Components) + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Forms:** react-hook-form + zod
- **Hosting:** Vercel (free tier)
- **Backend / DB / Auth / Storage / Realtime:** Supabase (project `dicufymnejhrkrakgluu`) — `@supabase/ssr` with three client patterns (browser, server, middleware)
- **Push:** Web Push API + Service Worker (shipped)
- **SRS:** `ts-fsrs` (FSRS-4.5)
- **Rich text editor:** MDXEditor (Lexical-based, markdown round-trip) on all five authoring surfaces
- **AI-likelihood detection:** deferred to v2 (`ai_likelihood_score` stays NULL)
- **Storage:** Supabase Storage is unusable on this project (see Current Status). Avatars stored as data URLs in `profiles.avatar_url`.

**Costs (paid items, all optional):**
- Vercel hosting — free tier sufficient for 501 users
- Optional: Supabase Pro ($25/month) if free-tier limits are hit later
- Optional: Resend ($0–20/month) for email notifications later

No mandatory paid services. No native-app dev fees.

---

## 3. Data Model

20 tables. See `docs/SCHEMA.md` for full column-by-column reference. Logical groupings:

**Users & Classes:** `classes`, `profiles`, `teacher_notes`, `student_assessments`
**Curriculum:** `lessons`, `lesson_unlocks`, `review_cards`, `card_quiz_questions`, `card_reviews`
**Quests:** `quests`, `coop_quest_instances`, `coop_member_drafts`, `coop_team_notes`, `quest_acceptances`, `quest_submissions`
**Engagement:** `review_attempts`, `xp_ledger`
**Comms:** `notifications`, `push_tokens`
**Config:** `app_settings`

All tables have RLS enabled (foundation: migration 008).

---

## 4. RLS Policy Summary

| Table | Student read | Student write | Teacher read | Teacher write |
|---|---|---|---|---|
| `classes` | own class | — | all | all |
| `profiles` | self full; classmates excl. teacher-only cols | self (limited) | all full | all |
| `teacher_notes` | ❌ | ❌ | all | all |
| `lessons` | own class | — | all | all |
| `review_cards` | unlocked lessons in own class | — | all | all |
| `card_quiz_questions` | ❌ (never directly) | ❌ | all | all |
| `card_reviews` | self | self | all | — |
| `quests` | own class, not closed | — | all | all |
| `coop_quest_instances` | own class | — | all | all |
| `quest_acceptances` | self + classmates in same instance | self insert | all | all |
| `quest_submissions` | self + own coop members | self insert | all | grade only |
| `review_attempts` | self | ❌ (only via `submit_mcq_answer` RPC) | all | — |
| `notifications` | self | self mark-read | self only | — |
| `push_tokens` | self | self | — | — |
| `xp_ledger` | self | ❌ | all | ❌ (system only) |

Column-level rule: students cannot select `english_proficiency_pearson` or `english_proficiency_cefr` from `profiles`. Implemented via a security barrier view (`public_profiles`) that students query instead of `profiles` directly.

---

## 5. Screen Inventory

### Student app (mobile-first, also works on web)

**Auth flow**
- Splash / login
- Join class via QR scan or manual code
- Register (username, password, display name, full name, age, avatar, interest tags)
- Login (username + password)

**Main tabs (bottom nav)**
1. Quest Board — solo quests, coop instances (`n/m`)
2. My Quest — current solo + coop with submission UI, feedback after grading
3. Review — FSRS-driven MCQ session for due cards; "Due: N" badge
4. Library — card library by lesson, full bodies viewable any time
5. Leaderboard — global rank list, sticky "you" row, rank icons
6. Profile — own stats, classmate list

**Modals**
- Quest detail
- Quest submission (markdown editor)
- Card detail (full body, library view)
- Classmate public profile
- Notifications inbox
- Settings

### Teacher app (web-first, also works on mobile)

**Main tabs**
1. Dashboard — submission queue, activity feed, class stats
2. Students — list → detail (private fields, notes editor, XP history)
3. Quests — list + Create Quest
4. Lessons & Cards — lesson tree → card editor → MCQ builder
5. Analytics — 5 panels (weekly XP, completion rates, activity heatmap, card retention, live feed)
6. Notifications — custom push composer

**Modals**
- Quest creator (multi-step)
- Card creator (headline, body, MCQs)
- Submission review (text, audio, AI-likelihood score, pass/fail w/ feedback)
- Student detail
- Class management

---

## 6. Notification Triggers

| Trigger | Recipient | Quiet hours (22-06)? |
|---|---|---|
| New quest posted | Class students | Suppressed |
| Cards due for review | Student | Suppressed |
| Quest approved | Student / coop members | Suppressed |
| Quest rejected | Student / coop members | Suppressed |
| Coop quest filled & started | All members | Suppressed |
| Rank up | Student | Suppressed |
| Top-10 leaderboard movement | Student | In-app only (no push) |
| Quest expiring in 1hr | Active acceptor | **Override quiet hours** |
| Teacher custom push | Selected students | **Override quiet hours** |
| 4-day review miss streak (student has due cards, didn't open review) | Teacher | Suppressed |
| New submission to review | Teacher | Suppressed |

**Implementation:** DB triggers + Edge Function workers. Notifications go into `notifications` table immediately; a cron'd worker reads `pushed_at IS NULL` rows, applies quiet-hour logic, sends via Expo Push API, sets `pushed_at`.

---

## 7. XP & Rank Economy

### Ranks
| # | Name | XP |
|---|---|---|
| 1 | Novice | 0 |
| 2 | Apprentice | 200 |
| 3 | Adept | 600 |
| 4 | Expert | 1,400 |
| 5 | Master | 2,600 |
| 6 | Grandmaster | 4,200 |
| 7 | Luminary | 6,000 |

### XP awards (tunable)
| Source | XP |
|---|---|
| Review MCQ correct answer | 5 (per correct, no perfect bonus, no daily reset) |
| Solo quest (standard) | 20–35 (teacher sets) |
| Coop quest | 50–80 per member |
| Special quest | 150–300 |

FSRS schedule determines when MCQs reappear. Strong students earn less from review (fewer cards due) but have time freed for solo/coop quests; weak students earn more from review volume — the gamification serves the pedagogy.

### Learning velocity
Recomputed nightly at 03:00 Saigon via `pg_cron` calling the `recompute_learning_velocity()` SECURITY DEFINER function (migration 017). Review-attempts in the trailing **14 days** are weighted by card age: 1.0 for cards ≤7 days old, 1.5 for 8-30d, 2.5 for 31-90d, 4.0 for 90+d. `velocity = Σ(weight × correct) / Σ(weight)`, clamped [0,1]. Students with zero attempts in the window get velocity = 0 (no learning signal). Empty days (weekends, short holidays) naturally contribute nothing to both numerator and denominator, so the ratio is robust without holiday-aware logic; the future analytics dashboard will show attempt count alongside velocity so the teacher can distinguish "struggling" (low velocity, many attempts) from "absent" (zero velocity, zero attempts).

Window decision (14 vs 30 vs 7 days): 30 days was the architect's original spec but too slow to catch deterioration during a 40-week course; 7 days too noisy (one bad day craters the score). 14 days catches sustained drops within a week, surfaces inactivity at 2 weeks, smooths weekend gaps and short holidays.

Edge Function vs pure SQL: the architect's plan literally said "Edge Function recompute-velocity (cron daily)" but we went pure SQL because the computation is one UPDATE and wrapping it in TS would only add an HTTP hop + Vault secret management. An Edge Function wrapper can be added later if needed; the SQL function stays the canonical implementation.

---

## 8. Phased Build Order

### Phase 1 — Foundation (~week 1) ✅ Shipped
**Goal:** runnable app, real auth, role-gated routing, students can self-register.

- Next.js 16 scaffold (App Router, TypeScript, Tailwind v4, `src/` directory)
- Install: `@supabase/ssr`, shadcn/ui primitives (`button`, `input`, `label`, `card`, `alert`, `form`), `react-hook-form`, `zod`
- Three Supabase client modules at `src/lib/supabase/{client,server,middleware}.ts` with typed `Database` generic
- Generate types via Supabase MCP into `src/lib/database.types.ts`
- RLS migration (all 16 tables, all policies, `public_profiles` view, `student_assessments` split) — applied as migration 008
- Auth flow:
  - Email + password (no username shim — migration 010 dropped the shim and the username/display_name columns; `full_name` is the public display)
  - Self-registration: class dropdown gated by a global `registration_open` toggle (migration 009) → Server Action calls `auth.signUp()` then the gated `register_student` RPC to insert the profile row
  - Login screen (client component, email + password)
- Server-enforced role guard in `src/middleware.ts`: not-signed-in → `/login`; signed-in students can only reach `/student/*`; signed-in teachers can only reach `/teacher/*`. Redirects happen before any render.
- Placeholder home screens for both roles
- Vercel deploy
- **Milestone:** a real student can self-register at the public URL and land in the student app.

### Phase 2 — Lessons & Cards (~week 2) ✅ Shipped
**Goal:** teacher can create lesson content; students can study cards.

Content model is **unified markdown** (migration 011) — `review_cards.body` and `quests.description` are markdown text rendered with `react-markdown` + `remark-gfm`. No structured block editor, no image/audio uploads, no Supabase Storage bucket. External media is referenced via standard markdown image/link syntax with custom embed for YouTube and direct video URLs. See `docs/PHASE-2-PLAN.md` for the detailed reference document.

Commits land in this order:

1. `feat(db): migration 012 — unlock_lesson_cards RPC and lesson_card_counts view` (no bucket setup)
2. `feat(phase-2): teacher lesson CRUD`
3. `feat(phase-2): markdown editor component + card editor (headline + markdown body + MCQ form)`
4. `feat(phase-2): markdown renderer component + YouTube/video embed support`
5. `feat(phase-2): teacher unlock action (wires unlock_lesson_cards RPC)`
6. `feat(phase-2): student card library + intercepting-route card detail modal + copy-markdown button`
7. `feat(phase-2): student FSRS review session with ts-fsrs and rating tests`

- **Milestone:** teacher teaches a lesson and students study the cards.

### Phase 3 — Review-Quiz & XP Engine (~week 3) ✅ Shipped
**Goal:** FSRS-driven review-quiz loop + gamification spine + leaderboard + nightly velocity.

Post-Plan-B pivot (migration 015 applied). The daily-quiz cron is gone; the system is event-driven by `card_reviews.due_at`.

Commits in this order:

1. `feat(db): migration 015 — unify review and quiz via FSRS-driven model` *(already shipped — see `supabase/migrations/015_*.sql`)*
2. `feat(phase-3): rebuild /student/review with FSRS-driven MCQ flow` — replaces the broken self-rating UI from Phase 2 commit #7. Fetches due cards (`card_reviews.due_at <= now()`), shows headline-only + sequential MCQs (body hidden until all answered), calls `submit_mcq_answer` per MCQ for live feedback + immediate XP, runs `ts-fsrs` client-side after all MCQs on a card are answered to update `card_reviews` state.
3. `feat(phase-3): leaderboard page` — global ranked list by `xp_total`, sticky "you" row, top 10 always visible.
4. `feat(db): migration 017 — recompute_learning_velocity() function + pg_cron schedule` — formula in §7, runs once daily at 03:00 Saigon (20:00 UTC) over `review_attempts` from the trailing 14 days. Pure SQL — no Edge Function indirection.

No 06:00 cron, no `generate-daily-quizzes` Edge Function. Phase 3 is genuinely smaller under Plan B.

**Milestone:** review loop works end-to-end. XP awards per correct MCQ. Rank changes visible. Leaderboard renders. Velocity updates nightly.

### Phase 4 — Quests Core (~week 4) ✅ Shipped
**Goal:** solo quest loop fully working.

- Quest creator UI (multi-step modal):
  - Step 1: type (solo / coop) — `quiz` quest type was removed in migration 011; quizzes only exist as the auto-generated daily quiz
  - Step 2: title, description (markdown — same editor component as Phase 2's card body)
  - Step 3: XP, word limit, conditions (timed expiry)
  - Step 4: preview & publish
- Quest board screen (student view): list of available quests, badge for daily quiz
- Quest detail modal + Accept button (validates one-active-solo constraint)
- Submission UI: a single markdown editor (reused from Phase 2). All submissions are markdown text — no file uploads. Students embed YouTube or external image links via markdown syntax. Word counter on the textarea.
- Teacher review queue: list of `quest_submissions` with `status = 'pending_review'`
- Review modal: view submission (rendered markdown), write teacher feedback (markdown), pass/fail buttons
- Pass → insert `xp_ledger` row → student notification
- Fail → update submission status + feedback → student keeps acceptance, can resubmit
- **Milestone:** full solo quest loop works for at least one quest end-to-end.

### Phase 5 — Co-op Quests & Polish (~week 5) ✅ Shipped (AI-likelihood deferred to v2)
**Goal:** coop mechanic + teacher analytics + AI detection.

- Coop quest creator (extends Phase 4 UI): group_size, availability_mode, max_instances
- Coop instance lifecycle:
  - Initial instance created on quest publish (status `forming`)
  - Student accept → insert acceptance row with `instance_id`
  - When acceptance count = group_size → instance status `active`, spawn new instance (if eligible students remain)
  - Use Postgres advisory lock keyed on `quest_id` to prevent race conditions
- Coop UI: quest board shows current instances with `n/m`, "Your Group" view for accepted coop members
- Submission: any group member can submit; teacher grades for the group
- Pass → XP to every member; fail → all members locked, must resubmit
- Teacher disband UI for stuck `forming` instances
- Analytics dashboard:
  - Weekly XP per student (bar chart)
  - Quest completion rate
  - Activity heatmap (GitHub-style 365-day grid)
  - Card retention rate (avg accuracy per card)
  - Live activity feed (latest 50 events: submissions, completions, etc.)
  - Submission queue widget (already in Phase 4, surface in dashboard)
- AI-likelihood classifier: lightweight model or API on text submissions, score stored in `quest_submissions.ai_likelihood_score`, shown in review modal
- **Milestone:** all v1 features functional.

### Phase 6 — Web Push Notifications (~week 6) ✅ Shipped
**Goal:** real push notifications delivered to the browser, including PWA / Add-to-Home-Screen for mobile users.

- Service Worker registration + Web Push API subscription (VAPID keys, stored client-side per browser)
- `push_tokens` table reused to store browser push subscriptions (endpoint + keys)
- Edge Function `send-pending-pushes` (cron every 5 min):
  - Query `notifications` where `pushed_at IS NULL`
  - Apply quiet-hour rule unless `override_quiet_hours = true`
  - Send via Web Push protocol (e.g. `web-push` library)
  - Update `pushed_at`
- DB triggers / functions to insert `notifications` rows on relevant events:
  - `AFTER INSERT ON quests` (for class members)
  - `AFTER UPDATE ON quest_submissions` when status changes
  - `AFTER UPDATE ON coop_quest_instances` when status becomes 'active'
  - `AFTER INSERT ON xp_ledger` when computed rank changes
  - Edge Function checks for 4-day-quiz-miss → insert notification to teacher
  - Edge Function checks for expiring quests (1hr window) → insert notification
- Teacher custom push composer UI
- Settings screen: per-category notification toggles
- PWA manifest + service worker so iOS users can Add-to-Home-Screen for native-feeling push support (Safari requires installation before web push works on iOS)
- **Milestone:** subscribed browser users (and iOS Add-to-Home-Screen users) receive push notifications end-to-end.

---

## 9. Free-Tier Watch-Items

| Resource | Limit | Risk |
|---|---|---|
| Supabase DB | 500 MB | Low — estimate ~50 MB at year-end for 501 users |
| Supabase Storage | 1 GB | **Medium** — card images + audio. Compress aggressively client-side. Pivot to Cloudinary 25GB free if needed. |
| Supabase Egress | 5 GB/month | Low |
| Supabase MAU | 50K | Far above ceiling |
| Vercel bandwidth | 100 GB/month | Far above ceiling |
| Web Push API | Unlimited free | None |

---

## 10. Open Decisions / Future Discussions

- ~~Exact open-source AI classifier choice (decide Phase 5)~~ — **deferred to v2.** Revisit only if cheating becomes a real problem.
- ~~Rank icons: source / commission / generate?~~ — **resolved:** ranks are shown by number only, no English names (migration 040).
- ~~Co-op group formation: pure first-come-first-served vs matchmaking?~~ — **resolved:** first-come-first-served stays for v1.
- **Rejected for v1:** QR-code class join, multi-step registration with invite-code lookup, and per-class access codes. Replaced by open self-registration with a global `registration_open` toggle and a hardcoded class dropdown. Reasoning: web-only deployment removed the camera-on-mobile use case for QR; the simpler flow is enough for one teacher / 500 students.
- **Rejected for v1 (migration 011):** structured block editor, in-browser audio recording, image/audio file uploads for content authoring or submissions, standalone quiz quests, drag-and-drop card reorder. Card bodies and quest descriptions/submissions are markdown text with external URL embeds.

---

## 11. Out of v1 Scope (v2 backlog)

- Secret quests (visibility conditions: locked behind quest/rank/tag)
- Student-created review cards
- Multi-teacher / multi-class-per-teacher
- Web push notifications
- Automatic AI grading of text quality (only AI-detection in v1)
- Localization
- Cross-class quests
- Parent/guardian view
- Standalone quiz quests (teacher-authored MCQ quests beyond the review-quiz flow)
- Self-rated FSRS difficulty (Hard / Easy buttons) for power users who want finer scheduling control beyond the binary Good/Again that MCQ correctness produces
- In-browser audio recording
- Image/audio file uploads for content authoring or submissions (use markdown image syntax + external hosting instead)
- Per-card prev/next navigation inside the card detail modal
- HaveIBeenPwned leaked-password check during registration (`auth_leaked_password_protection` in Supabase Auth) — defer until either user scale or threat profile changes warrant it
