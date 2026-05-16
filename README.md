# Squire

A gamified learning platform for a single teacher and their students. Built with Expo (React Native + Web) and Supabase.

**Status:** Pre-Phase 1 (foundation work).

## Stack

- **App:** Expo SDK · Expo Router · TypeScript · NativeWind
- **Backend:** Supabase (Postgres · Auth · Realtime · Storage · Edge Functions)
- **Push:** Expo Notifications
- **SRS:** ts-fsrs (FSRS-4.5)

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — briefing auto-loaded by Claude Code each session
- [`docs/PLAN.md`](./docs/PLAN.md) — full implementation plan and phased build order
- [`docs/SCHEMA.md`](./docs/SCHEMA.md) — database schema reference

## Build Phases

1. **Foundation** — auth, RLS, role-gated routing
2. **Lessons & Cards** — content authoring + FSRS review
3. **Daily Quiz & XP Engine** — daily loop + leaderboard
4. **Quests Core** — solo quest workflow
5. **Co-op Quests & Polish** — coop spawning + analytics + AI-detection
6. **Notifications & Mobile Push** — Expo push, mobile builds

## Development

Currently empty. Phase 1 will scaffold the Expo project in this repo.
