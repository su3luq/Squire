# Phase 7 — UI Redesign + Performance Pass

Status: planning. Sequencing approved: UI first (with quick perf baseline before), then optimization deep-pass after.

This file is the plan. It is not a contract — adjust as we go.

---

## Goal

Bring Squire from a functional-but-basic UI to a **production-grade, responsive, on-brand interface** suitable for both teachers (admin-feel) and high-school students (modern app-feel), then squeeze observable performance.

## Non-goals

- New features. UI work is rebuilding what's there to look better, not adding capability.
- Native apps. Web-only stays.
- Localization. English-only stays.
- A separate design system package. Stay in this repo with Tailwind v4 + shadcn/ui.

---

## Stage 0 — Performance baseline (≈30 min, before any UI work)

A sanity check, not a deep optimization. Goal: surface anything that's already broken so it doesn't get carried into the redesign.

- [ ] `npm run build` → record output bundle sizes per route. Flag any First Load JS > 200 KB.
- [ ] Lighthouse run (mobile + desktop) on the five hottest pages: `/student`, `/teacher`, `/student/review`, `/teacher/quests`, `/teacher/analytics`. Record LCP, CLS, TBT, accessibility score.
- [ ] `mcp__claude_ai_Supabase__get_advisors` with `type='performance'` — fix anything that looks load-bearing, defer the rest.
- [ ] DevTools Network tab on the same five pages — look for >1s queries or waterfalls.
- [ ] Output: a short paragraph in this file under "Stage 0 results" with the numbers + the 0–3 things worth fixing immediately.

**Exit criterion:** baseline numbers captured. No critical regressions. Anything non-critical gets parked in Stage 5.

---

## Open design decisions (need your input before Stage 1)

These are blockers for the UI design system. Once you answer, I'll lock them and start building.

1. **Design direction / vibe**
   - Option A: clean Apple-like / Linear (minimal, lots of whitespace, monochrome with single accent color)
   - Option B: modern education-product (Khan Academy / Duolingo — playful, more color, illustrations, slightly rounded)
   - Option C: serious-academic (Notion-like, dense, neutral, content-first)
   - Inspiration links / screenshots welcome.

2. **Color palette**
   - Brand primary color (one strong accent we'll use throughout): suggest navy, deep indigo, or forest green to feel "knightly" given the Squire name. Open to anything.
   - Dark mode in v1, or light-only first? (Recommend light-only first; dark mode is a tail of work that's never essential.)

3. **Typography**
   - Body font: default Inter (clean, free, broad support).
   - Headings: same as body, or a display font? (Suggest the same family for tightness, or a contrast pairing like Fraunces / Space Grotesk if you want personality.)

4. **Icon library**
   - `lucide-react` (default with shadcn). Comprehensive, clean line icons.

5. **Layout shell**
   - Recommend a left sidebar on desktop/tablet (≥768 px) and bottom-tab navigation on mobile (<768 px). Faster than hamburger menus and feels native.

---

## Stage 1 — UI foundation (1–2 sessions)

After your answers above:

- [ ] Tailwind v4 `@theme` overhaul in `src/app/globals.css`: semantic color tokens (`--color-brand`, `--color-bg`, `--color-fg`, `--color-muted-fg`, `--color-border`, `--color-success`, `--color-danger`), spacing scale, radius scale, shadow scale, animation easings.
- [ ] Add fonts via `next/font/google`. Define `--font-sans` (and `--font-display` if chosen).
- [ ] Install `lucide-react`.
- [ ] Build global layout shell with responsive sidebar/bottom-tabs.
- [ ] Build reusable building blocks not already in shadcn:
  - `<EmptyState>` — friendly nothing-here panels
  - `<StatCard>` — number + delta + icon
  - `<PageHeader>` — title + subtitle + actions area
  - `<DataList>` / `<ResponsiveTable>` — table on desktop, card list on mobile
  - Skeleton loaders for each list-y page
- [ ] Toast / snackbar (shadcn `sonner`).
- [ ] Confirm-dialog wrapper.

**Exit criterion:** a styleguide route (or a notes file) shows every primitive with all variants.

---

## Stage 2 — Page-by-page redesign (priority order)

Done in this order so each session ships something visible. Each page has its own checklist when we get to it.

1. Login — first impression, also the simplest.
2. Student home dashboard — most-viewed student screen.
3. Student review session — the actual learning loop; needs to feel calm and focused.
4. Student quests + my-quests — second-most-used.
5. Student leaderboard — gamification core.
6. Student library — pure content view.
7. Teacher home dashboard — daily landing for teacher.
8. Teacher analytics — already has substance; needs charts that aren't bare.
9. Teacher quests / queue / detail — high information density.
10. Teacher lessons / cards / quiz creator.
11. Teacher classes / students / student profile.
12. Notifications inbox.
13. Error / 404 / loading states across the app.

**Per-page checklist (every page gets these):**
- Responsive at 375 / 768 / 1024 / 1440.
- Empty state, loading state, error state.
- All interactive elements ≥44 px touch target on mobile.
- Color contrast WCAG AA.
- Keyboard navigable.

---

## Stage 3 — Cross-cutting polish

After page-by-page is done.

- [ ] Page transitions (CSS or framer-motion if needed).
- [ ] Optimistic UI on common actions (mark read, accept quest, submit MCQ).
- [ ] PWA manifest + iOS Add-to-Home-Screen meta (icons at 180/192/512).
- [ ] favicon + opengraph image.
- [ ] 404 / 500 / unauthorized pages styled.

---

## Stage 4 — QA before optimization

- [ ] Walkthrough on a real Android phone, a real iPhone (or Safari mobile simulator), a tablet width, and 1080p / 1440p desktop. Each role.
- [ ] Light/dark check (if dark mode shipped).
- [ ] Lighthouse re-run — should be **better** than Stage 0 despite added visual complexity, because we'll have written things more carefully.

---

## Stage 5 — Optimization deep pass

Now that the UI is fixed, real optimization. Two tracks in parallel.

### Database / backend

- [ ] `get_advisors` (security + performance) clean sweep.
- [ ] Index audit — add indexes for any slow query > 200 ms.
- [ ] N+1 hunts: teacher quest detail (team members), analytics page, leaderboard.
- [ ] Combine adjacent queries into single SQL/RPC where it pays.
- [ ] Verify `public_profiles` view is used everywhere student-facing (no direct `profiles` reads from the student bundle).
- [ ] Vacuum / analyze if needed.

### Frontend

- [ ] `@next/bundle-analyzer` — find heavy imports and dynamic-import them.
- [ ] Verify every list page uses RSC for data fetching (no `useEffect` waterfalls).
- [ ] Image audit — `next/image` everywhere, explicit dimensions, modern formats.
- [ ] Cache Components review (the `use cache` directive, post Next 16) — likely valuable for leaderboard and lesson library.
- [ ] Eliminate unnecessary client components (mark `'use client'` only where actual hooks/events live).
- [ ] Service worker cache strategy for static assets (already partially there).

### Edge

- [ ] `send-pushes` profile — batch sends per push service if possible; skip the per-notification profile lookup by joining once.
- [ ] Cron timing — drop to every 2 min if backlog stays consistently empty.

---

## Stage 6 — Launch readiness

- [ ] Final advisor sweep (security + performance).
- [ ] Vercel production deploy + smoke test with two real student accounts.
- [ ] Bundle the app icon, manifest, splash screens for iOS A2HS.
- [ ] Document the design system briefly so future tweaks don't drift.

---

## Sequencing summary

```
Stage 0 (perf baseline, 30 min)
  ↓
Open design decisions answered by user
  ↓
Stage 1 (foundation: tokens, fonts, shell, primitives)
  ↓
Stage 2 (page-by-page rebuilds, in priority order)
  ↓
Stage 3 (cross-cutting polish, PWA)
  ↓
Stage 4 (QA across breakpoints)
  ↓
Stage 5 (optimization deep pass: DB + frontend + edge)
  ↓
Stage 6 (launch readiness)
```

Each stage is committed in small PR-sized pushes, not one mega-commit. Plan can shift when reality lands.
