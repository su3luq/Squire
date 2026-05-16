# Squire — Database Schema Reference

Authoritative reference for all 15 tables in the `public` schema of the SQUIRE Supabase project (`dicufymnejhrkrakgluu`). Match this exactly when writing queries.

**Project region:** `ap-northeast-2` (Seoul)
**Postgres version:** 17

---

## Enums

```sql
user_role           : 'teacher' | 'student'
quest_type          : 'solo' | 'coop' | 'quiz' | 'daily_quiz'
quest_availability_mode : 'open' | 'timed' | 'whole_class' | 'limited_instances'
coop_instance_status: 'forming' | 'active' | 'submitted' | 'passed' | 'failed' | 'disbanded'
quest_acceptance_status : 'active' | 'submitted' | 'passed' | 'failed'
quest_submission_status : 'pending_review' | 'passed' | 'failed'
card_review_state   : 'new' | 'learning' | 'review' | 'relearning'
push_platform       : 'ios' | 'android' | 'web'
```

---

## Tables

### `classes`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| invite_code | text UNIQUE NOT NULL | short; used for QR + manual entry |
| created_at | timestamptz | |
| archived_at | timestamptz | nullable |

### `profiles`
Extends `auth.users` (id matches `auth.users.id`).

| Column | Type | Privacy | Notes |
|---|---|---|---|
| id | uuid PK = auth.users.id | | |
| role | user_role NOT NULL | public | |
| username | text UNIQUE NOT NULL | public | 3-30 chars |
| display_name | text NOT NULL | public | |
| full_name | text | self + teacher | |
| email | text | self + teacher | nullable |
| avatar_url | text | public | |
| age | int | class | |
| class_id | uuid FK classes | self + teacher | nullable on creation |
| interest_tags | text[] | class | |
| english_proficiency_pearson | int | **teacher only** | 10-90 range |
| english_proficiency_cefr | text | **teacher only** | |
| xp_total | int DEFAULT 0 | public | **do not write directly** — use `xp_ledger` |
| current_rank | int DEFAULT 1 | public | 1-7, **auto-updated by trigger** |
| learning_velocity | numeric(4,3) DEFAULT 0 | class | 0.000-1.000, updated by cron |
| created_at | timestamptz | self + teacher | |
| last_active_at | timestamptz | teacher | |

### `teacher_notes`
**Teacher-only at all times.**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| note | text NOT NULL | |
| created_at | timestamptz | |
| updated_at | timestamptz | auto via trigger |

### `lessons`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| class_id | uuid FK classes | |
| title | text NOT NULL | |
| lesson_number | int NOT NULL | unique per class |
| taught_at | timestamptz | nullable |
| cards_unlocked_at | timestamptz | when teacher pushed cards to students; nullable |
| created_at | timestamptz | |

### `review_cards`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lesson_id | uuid FK lessons | |
| headline | text NOT NULL | shown in library + used as recall prompt |
| body | jsonb DEFAULT '{}' | rich content blocks: `{ blocks: [{type, content, url?}] }` |
| position | int DEFAULT 0 | display order |
| created_at | timestamptz | |

### `card_quiz_questions`
**Never shown on cards. Only surface in daily quizzes.**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| card_id | uuid FK review_cards | |
| question_text | text NOT NULL | |
| choice_a / choice_b / choice_c / choice_d | text NOT NULL | |
| correct_choice | char(1) NOT NULL | 'a'/'b'/'c'/'d'; **students must not read this column** |
| created_at | timestamptz | |

### `card_reviews`
FSRS state per (student, card). Unique on (student_id, card_id).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| card_id | uuid FK review_cards | |
| stability | numeric DEFAULT 0 | FSRS internal |
| difficulty | numeric DEFAULT 0 | FSRS internal |
| due_at | timestamptz DEFAULT now() | next review due |
| last_reviewed_at | timestamptz | nullable |
| review_count | int DEFAULT 0 | |
| state | card_review_state DEFAULT 'new' | |
| fsrs_params_version | int DEFAULT 1 | bump if FSRS weights change |
| created_at | timestamptz | |

### `quests`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| class_id | uuid FK classes | |
| title | text NOT NULL | |
| description | jsonb DEFAULT '{}' | rich text + media link refs |
| quest_type | quest_type NOT NULL | |
| deliverable_types | text[] DEFAULT '{}' | e.g. `['text','audio']` |
| word_limit_min | int | nullable |
| xp_reward | int NOT NULL > 0 | |
| group_size | int | required if `quest_type='coop'`, ≥2 |
| max_instances | int | nullable; null = unlimited |
| availability_mode | quest_availability_mode DEFAULT 'open' | |
| expires_at | timestamptz | for timed quests |
| quiz_questions | jsonb | for standalone quiz quests (not card-derived) |
| created_at | timestamptz | |
| closed_at | timestamptz | nullable; null = active |

### `coop_quest_instances`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| quest_id | uuid FK quests | |
| status | coop_instance_status DEFAULT 'forming' | |
| started_at | timestamptz | set when status flips to 'active' |
| submitted_at | timestamptz | |
| reviewed_at | timestamptz | |
| created_at | timestamptz | |

### `quest_acceptances`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| quest_id | uuid FK quests | |
| instance_id | uuid FK coop_quest_instances | NULL for solo |
| status | quest_acceptance_status DEFAULT 'active' | |
| accepted_at | timestamptz DEFAULT now() | |
| completed_at | timestamptz | |

**Constraints via partial unique indexes:**
- One active solo per student
- One active coop per student
- A student cannot accept the same coop quest twice (incl. completed)

### `quest_submissions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| acceptance_id | uuid FK quest_acceptances | for solo submissions |
| instance_id | uuid FK coop_quest_instances | for coop submissions |
| submitted_by | uuid FK profiles | which student submitted |
| text_content | text | |
| audio_url | text | |
| image_urls | text[] | |
| youtube_link | text | |
| word_count | int | |
| ai_likelihood_score | numeric(4,3) | 0.000-1.000 |
| status | quest_submission_status DEFAULT 'pending_review' | |
| teacher_feedback | text | required on fail |
| reviewed_at | timestamptz | |
| submitted_at | timestamptz DEFAULT now() | |

**Constraint:** exactly one of `acceptance_id` or `instance_id` must be non-null.

### `daily_quiz_attempts`
Unique on (student_id, quiz_date).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| quiz_date | date NOT NULL | Saigon-local date |
| questions | jsonb NOT NULL | array of question IDs (snapshot) |
| answers | jsonb | array of selected choices |
| correct_count | int DEFAULT 0 | |
| total_count | int NOT NULL | |
| xp_awarded | int DEFAULT 0 | |
| completed_at | timestamptz | NULL = missed/pending |
| created_at | timestamptz | |

### `xp_ledger`
Append-only audit trail. **Insert here to award XP; trigger auto-updates `profiles.xp_total` and `current_rank`.**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| amount | int NOT NULL | can be negative for adjustments |
| reason | text NOT NULL | e.g. `'daily_quiz'`, `'quest_passed'` |
| source_table | text | e.g. `'quest_submissions'` |
| source_id | uuid | row id in source_table |
| created_at | timestamptz | |

### `notifications`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| type | text NOT NULL | e.g. `'rank_up'`, `'quest_approved'` |
| title | text NOT NULL | |
| body | text NOT NULL | |
| data | jsonb DEFAULT '{}' | deep-link payload |
| read_at | timestamptz | |
| pushed_at | timestamptz | NULL = pending push |
| override_quiet_hours | bool DEFAULT false | |
| created_at | timestamptz | |

### `push_tokens`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| expo_push_token | text UNIQUE NOT NULL | |
| platform | push_platform NOT NULL | |
| created_at | timestamptz | |
| last_used_at | timestamptz | |

---

## Triggers in place

- `xp_ledger AFTER INSERT` → updates `profiles.xp_total`, recomputes `current_rank` via `compute_rank_from_xp(xp)` function
- `teacher_notes BEFORE UPDATE` → sets `updated_at = now()`

---

## Notes for Implementation

- **All UUID primary keys** — use `gen_random_uuid()` default.
- **All timestamps are `timestamptz` (UTC)** — convert in app for display.
- **`profiles.id` = `auth.users.id`** — link via FK with `ON DELETE CASCADE`. Always create the profile row immediately after `auth.signUp`.
- **The XP trigger uses `SECURITY DEFINER`** so RLS doesn't block the internal update. Be aware of this when auditing.
- **Username-to-email shim:** `auth.signUp` is called with `{username}@squire.local` to satisfy Supabase Auth's email requirement. The real email (if any) lives in `profiles.email`.
- **Storage buckets** (created later in Phase 2): `card-media` (cards), `submissions` (audio/image deliverables). Both private; signed URLs only.
