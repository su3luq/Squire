# Squire — Implementation Plan

Full project plan as agreed between teacher and architect (Claude). This is the source of truth for what gets built. Diverging from this document requires a conversation, not a unilateral decision.

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
- **Push:** Web Push API + Service Worker (Phase 6)
- **SRS:** `ts-fsrs` (FSRS-4.5)
- **AI-likelihood detection:** TBD at Phase 5 (open-source classifier)

**Costs (paid items, all optional):**
- Vercel hosting — free tier sufficient for 501 users
- Optional: Supabase Pro ($25/month) if free-tier limits are hit later
- Optional: Resend ($0–20/month) for email notifications later

No mandatory paid services. No native-app dev fees.

---

## 3. Data Model

16 tables. See `docs/SCHEMA.md` for full column-by-column reference. Logical groupings:

**Users & Classes:** `classes`, `profiles`, `teacher_notes`, `student_assessments`
**Curriculum:** `lessons`, `review_cards`, `card_quiz_questions`, `card_reviews`
**Quests:** `quests`, `coop_quest_instances`, `quest_acceptances`, `quest_submissions`
**Engagement:** `daily_quiz_attempts`, `xp_ledger`
**Comms:** `notifications`, `push_tokens`

Already created in Supabase. RLS to be added in Phase 1.

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
| `daily_quiz_attempts` | self | self | all | — |
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
1. Quest Board — solo quests, coop instances (`n/m`), daily quiz badge
2. My Quest — current solo + coop with submission UI, feedback after grading
3. Review — card library by lesson, "Due" badge, FSRS review session
4. Leaderboard — global rank list, sticky "you" row, rank icons
5. Profile — own stats, classmate list

**Modals**
- Quest detail
- Quest submission (text editor / audio recorder / image picker / YouTube field)
- Card detail (full body)
- Card review session (FSRS 4-button)
- Daily quiz session (one question at a time)
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
| Daily quiz available (06:00) | Students w/ unlocked cards | N/A |
| Cards due for review | Student | Suppressed |
| Quest approved | Student / coop members | Suppressed |
| Quest rejected | Student / coop members | Suppressed |
| Coop quest filled & started | All members | Suppressed |
| Rank up | Student | Suppressed |
| Top-10 leaderboard movement | Student | In-app only (no push) |
| Quest expiring in 1hr | Active acceptor | **Override quiet hours** |
| Teacher custom push | Selected students | **Override quiet hours** |
| 4-day quiz miss streak | Teacher | Suppressed |
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
| Daily quiz (any score) | 5 |
| Daily quiz perfect bonus | +3 |
| Solo quest (standard) | 20–35 (teacher sets) |
| Coop quest | 50–80 per member |
| Special quest | 150–300 |

### Learning velocity
Recomputed nightly. Quiz answers in last 30 days, weighted by card age (1.0/1.5/2.5/4.0 for ≤7/8-30/31-90/90+ days). `velocity = Σ(weight × correct) / Σ(weight)`, clamped [0,1].

---

## 8. Phased Build Order

### Phase 1 — Foundation (~week 1)
**Goal:** runnable app, real auth, role-gated routing, students can self-register.

- Next.js 16 scaffold (App Router, TypeScript, Tailwind v4, `src/` directory)
- Install: `@supabase/ssr`, shadcn/ui primitives (`button`, `input`, `label`, `card`, `alert`, `form`), `react-hook-form`, `zod`
- Three Supabase client modules at `src/lib/supabase/{client,server,middleware}.ts` with typed `Database` generic
- Generate types via Supabase MCP into `src/lib/database.types.ts`
- RLS migration (all 16 tables, all policies, `public_profiles` view, `student_assessments` split) — applied as migration 008
- Auth flow:
  - Username → internal `{username}@squire.local` email shim for Supabase Auth
  - Self-registration: class dropdown gated by a global `registration_open` toggle (migration 009) → Server Action creates auth user + profile row
  - Login screen (client component)
- Server-enforced role guard in `src/middleware.ts`: not-signed-in → `/login`; signed-in students can only reach `/student/*`; signed-in teachers can only reach `/teacher/*`. Redirects happen before any render.
- Placeholder home screens for both roles
- Vercel deploy
- **Milestone:** a real student can self-register at the public URL and land in the student app.

### Phase 2 — Lessons & Cards (~week 2)
**Goal:** teacher can create lesson content; students can study cards.

- Teacher: lesson list, "Create Lesson", "Add Cards" workflow
- Card editor: headline input, rich body editor (text blocks + image upload + audio upload to Supabase Storage), MCQ builder (3-10 questions, 4 choices, correct flag)
- Storage bucket setup (`cards-media`) with RLS
- Card library screen (student view): grid of cards grouped by lesson, click → modal with body
- FSRS integration via `ts-fsrs`
  - Initialize `card_reviews` rows when card unlocks
  - Review session screen: headline → tap reveal body → Again/Hard/Good/Easy
  - Update FSRS state on each rating
- Teacher "Unlock cards for lesson" button → creates `card_reviews` rows for all class students
- **Milestone:** teacher teaches a lesson and students study the cards.

### Phase 3 — Daily Quiz & XP Engine (~week 3)
**Goal:** daily learning loop and gamification spine.

- Edge Function `generate-daily-quizzes` (cron 06:00 Asia/Ho_Chi_Minh):
  - For each student with unlocked cards, pick 3-10 random questions from `card_quiz_questions`
  - Insert into `daily_quiz_attempts` with snapshot
- Daily quiz UI: question at a time, 4 choices, immediate feedback or batch results (TBD with user)
- Award XP via `xp_ledger` insert on completion
- Trigger updates `profiles.xp_total`, recomputes `current_rank` (already in place)
- Leaderboard screen: global ranked list, sticky "you" row, top 10 always visible, scrollable below
- Edge Function `recompute-velocity` (cron daily): formula in §7
- **Milestone:** the daily loop works end-to-end. XP, ranks, leaderboard visible.

### Phase 4 — Quests Core (~week 4)
**Goal:** solo quest loop fully working.

- Quest creator UI (multi-step modal):
  - Step 1: type (solo / coop / quiz)
  - Step 2: title, description (rich text + image / video link)
  - Step 3: deliverables checklist (text / audio / image)
  - Step 4: XP, word limit, conditions (timed expiry)
  - Step 5: preview & publish
- Quest board screen (student view): list of available quests, badge for daily quiz
- Quest detail modal + Accept button (validates one-active-solo constraint)
- Submission UI: text editor (with word counter), audio recorder, image picker, YouTube link field — fields shown based on `deliverable_types`
- Teacher review queue: list of `quest_submissions` with `status = 'pending_review'`
- Review modal: view submission, write feedback, pass/fail buttons
- Pass → insert `xp_ledger` row → student notification
- Fail → update submission status + feedback → student keeps acceptance, can resubmit
- **Milestone:** full solo quest loop works for at least one quest end-to-end.

### Phase 5 — Co-op Quests & Polish (~week 5)
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

### Phase 6 — Web Push Notifications (~week 6)
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
| Expo Push | Unlimited free | None |

---

## 10. Open Decisions / Future Discussions

- Exact open-source AI classifier choice (decide Phase 5)
- Daily quiz UI: one-by-one with immediate feedback, or batch all then results (ask at Phase 3 start)
- Rank icons: source / commission / generate? (ask before Phase 1 polish)
- Card body editor: which rich-text component? (ask at Phase 2 start)
- Co-op group formation: pure first-come-first-served (current plan), or some matchmaking? (current plan stays for v1)
- **Rejected for v1:** QR-code class join, multi-step registration with invite-code lookup, and per-class access codes. Replaced by open self-registration with a global `registration_open` toggle and a hardcoded class dropdown. Reasoning: web-only deployment removed the camera-on-mobile use case for QR; the simpler flow is enough for one teacher / 500 students.

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
