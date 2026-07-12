# ProFit — Project Tracker

AI-driven workout + nutrition companion. Plan it, do it, log what actually
happened, and let the AI close the gap between the two.

**Last updated:** 26 June 2026
**Stack:** Express + Node.js backend · Expo React Native mobile · PostgreSQL
(Docker, port 5433) · offline-first SQLite on device with idempotent sync ·
Anthropic API via `aiJson()` (validate → retry → fallback)
**Hosting:** Oracle Cloud Always Free ARM instance
**Repo layout:** `backend/` and `mobile/` as plain sibling folders — no monorepo.
Plus a `design/` folder for the visual reference (see below).
**Test device:** Samsung S22 Ultra (physical Android) + emulator.

---

## 1. Product Scope

### 1.1 Training contexts
- **Home workout** — bodyweight / minimal equipment variants of every plan.
- **Gym workout** — full equipment assumed.
- Every exercise carries an `equipment` tag so plans can be generated or
  swapped per context.

### 1.2 Training categories (separate, first-class)
| Category | Core mechanic |
|---|---|
| Bodybuilding | Hypertrophy splits (PPL, upper/lower, bro split), progressive overload on volume |
| Powerlifting | SBD focus, percentage-of-1RM programming, strength progression |
| CrossFit | WOD-style mixed modal, AMRAP/EMOM/RFT timers |
| Cardio | Steady-state + intervals, duration/distance/HR targets |
| **Custom** | User mixes any of the above into one weekly plan |

### 1.3 Plan Builder
- User sets **days per week** (2–7) and available time per session.
- Ability level detected automatically from first few logged workouts
  (not self-declared).
- Splits offered per category; custom plans can blend categories
  (e.g. 3 bodybuilding + 1 powerlifting + 1 cardio day).
- Plans auto-balance undertrained muscle groups (the "PPL×5 leaves legs
  behind" problem is a design driver).
- Goal setting: bulking / cutting / maintaining — feeds both training
  and nutrition modules.

### 1.4 Active Workout
- Session timer from gym entry; per-exercise and per-set internal timers.
- Manual rep/weight entry (voice/camera counting deferred).
- Random exercise variation injection to fight staleness.
- **Demo images/animations** for every exercise (beginner-critical).
- Rest timers with category-appropriate defaults (e.g. 3–5 min powerlifting,
  60–90 s hypertrophy).

### 1.5 Planned vs Actual (the honesty loop)
- After each session the user fills in **what was actually done** —
  skipped sets, changed weights, cut short, swapped exercises.
- The delta between plan and reality is the primary AI input:
  - adjust next session's load/volume,
  - flag consistency patterns ("you skip legs when sessions run past 60 min"),
  - tips to improve and stay consistent, delivered as short actionable
    nudges, not lectures.

### 1.6 Progress Tracking
- Per-exercise strength curves, volume per muscle group per week,
  bodyweight log, optional photos.
- Streaks / adherence % (sessions completed vs planned).
- Milestones (first bodyweight bench, 100 kg squat, etc.).

### 1.7 Nutrition
- Profile built from **what the user already eats** — no prescribed meal
  plans, no arbitrary calorie targets.
- Daily meal logging; AI suggests swaps and portion cuts against the
  bulking/cutting/maintaining goal.

### 1.8 AI Chat Companion
- In-app chat for questions ("is my squat depth okay?", "what can I swap
  for lat pulldown at home?").
- Context-aware: it can see the user's plan, recent logs, and goal.
- Powered by the same `aiJson()`/Anthropic layer; free-text answers here,
  structured JSON everywhere else.

### 1.9 Added items (you asked what you missed)
- **Rest-day and recovery guidance** — sleep/soreness check-ins feeding the
  AI's load adjustments. A plan that never deloads breaks people.
- **Warm-up/cool-down blocks** auto-attached per category.
- **Exercise substitution engine** — injury or equipment-based swaps
  (dodgy shoulder → no overhead press, offer landmine press).
- **Unit setting** kg/lb from day one (cheap now, painful later).
- **Notifications** — session reminders on chosen training days.
- **Data export** — user owns their logs (CSV/JSON).

---

## 2. Architecture Snapshot

```
mobile/  (Expo React Native)
  SQLite (offline-first) ──sync──▶ backend/ (Express + Node)
                                      ├─ PostgreSQL (Docker :5433)
                                      ├─ Zod schemas (colocated)
                                      └─ aiJson() ▶ Anthropic API
```

- Offline-first: every workout log writes locally first, syncs when online.
  Sync is idempotent (safe to retry).
- Zod validates everything crossing the API boundary, including AI output.
- `aiJson()` wraps Anthropic calls: validate against schema → retry on
  failure → deterministic fallback so the app never blocks on the AI.

---

## 3. Build Phases (Feature-Complete Progressive)

Each phase ends with something you can run, tap, and verify on the S22 Ultra.
No phase starts until the previous one demonstrably works.

### ✅ Phase 0 — Decisions & scaffold (DONE / verify)
Stack chosen, repo layout set, Docker Postgres on 5433, Zod + aiJson
patterns established, offline-first sync design agreed.
**Verify:** backend boots, health endpoint responds, mobile app opens on
device, SQLite initialises.

### Phase 1 — Auth + user profile (end to end)
Register/login (JWT), profile: goal, days/week, context (home/gym), units.
**Done when:** create account on the phone → kill app → reopen → still
logged in, profile persisted in Postgres.

### Phase 2 — Exercise library + demo images
Seed DB with exercises (name, muscle groups, category, equipment tags,
demo media URL). Browse/search in app, filter by category/equipment.
**Done when:** you can find "goblet squat", see its demo image, and its
home-equipment alternative, offline.

### Phase 3 — Plan Builder v1 (static)
Pick category → pick split → set days/week → get a concrete weekly plan.
Custom mix supported. No AI yet — template-driven.
**Done when:** a 4-day custom plan (3 BB + 1 cardio) renders correctly
with real exercises for the user's context.

### Phase 4 — Active Workout + logging
Start session → timers run → enter actual reps/weights → finish →
planned-vs-actual stored and synced.
**Done when:** a full logged session on the S22 survives airplane mode
and syncs when back online.

### Phase 5 — Progress Tracking
Strength curves, weekly volume per muscle group, adherence %, streaks.
**Done when:** after 3 logged sessions, charts render from real data.

### Phase 6 — AI layer v1
Ability-level detection from first sessions, plan adjustment from
planned-vs-actual deltas, consistency tips. All through aiJson() with
fallbacks.
**Done when:** skipping half a session produces a sensible adjusted next
session, and the app still works with the AI toggled off.

### Phase 7 — Nutrition module
Meal profile onboarding → daily logging → AI swap suggestions vs goal.
**Done when:** log a normal day of your own meals and get one useful,
non-preachy swap suggestion.

### Phase 8 — AI Chat Companion
Context-aware chat over the user's plan/logs/goal.
**Done when:** "what can I swap for lat pulldown at home?" gives a correct
answer that respects the user's equipment tags.

### Phase 9 — Polish & hardening
Notifications, data export, deload/recovery logic, empty states, error
states, sync conflict edge cases.

---

## 4. Current Position

- Phase 0 complete-ish (stack + patterns decided; verify checklist above).
- S22 Ultra physical device now in hand — real-device testing unblocked.
- Design system done: Claude Design produced `design/ProFit.html` (bundled
  preview, ~1.1MB — reference only, not imported). Tokens extracted to
  `design/DESIGN_NOTES.md` and `mobile/theme.ts` (dark + full light mode,
  three neon accents green/red/blue with glow tokens, Saira / Saira Condensed).
- **Phases 1–4 built and committed (12 Jul 2026)** — one commit per phase,
  decisions logged in `DECISIONS.md` at the repo root.
  Note: connect on **localhost:5434** — Postgres.app shadows 5433 on loopback.
- Backend: JWT auth + profile, 63-exercise seeded library with sync cursor,
  template plan builder with muscle-balance guard, idempotent workout sync
  with typed planned-vs-actual delta. 16 supertest tests green.
- Mobile: Expo app (com.mundala.profit), theme-token UI, offline-first
  SQLite (library, active plan, workout queue), plan builder, active workout
  with timers + summary. 8 data-layer tests green; Android bundle compiles.
- Next action: **run it on the S22** (set `EXPO_PUBLIC_API_URL` to the dev
  machine's LAN IP, `npx expo start` in mobile/) and do the two manual
  checks: force-quit → still logged in; airplane-mode workout → reconnect
  sync. Then Phase 5 (progress tracking).

## 5. Open Questions

1. Exact state of existing code vs decisions (what runs today?).
2. AI behind a feature toggle from day one? (Recommended: yes.)
3. Demo media source — license a library, generate, or curate free sets?
