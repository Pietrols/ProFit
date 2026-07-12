# DECISIONS.md — choices made during the Phase 1–4 build run

Decisions taken where PROJECT.md was ambiguous, plus any deviations from the
decided stack. Review and veto freely.

## Cross-cutting

- **Local DB port is 5434, not 5433.** The stack says Docker Postgres on 5433
  and the container does map 5433 — but Postgres.app on this machine also
  listens on 127.0.0.1:5433 and shadows the Docker mapping for loopback
  connections. The compose file maps a second, loopback-only port
  `127.0.0.1:5434` and `.env` uses it. Nothing changes on other machines:
  5433 works wherever Postgres.app isn't squatting on it.
- **Test runner: vitest + supertest (backend devDependencies).** The stack
  brief asks for tests but names no runner; vitest is fast, TS-native, and
  needs no babel config. Mobile sync logic is tested with the same runner in
  `backend/` — see the Phase 2/4 notes.
- **Prisma 7 with the `prisma-client` generator**, output checked into
  `backend/src/generated/` (gitignored), runtime `@prisma/client` added as a
  dependency (required by the generated code).
- **Error codes**: every error response is `{ error: { code, message } }` with
  stable UPPER_SNAKE codes (`VALIDATION_ERROR`, `EMAIL_TAKEN`,
  `BAD_CREDENTIALS`, `NO_TOKEN`, `BAD_TOKEN`, …) so the mobile client can
  branch on `code`, never on message text.

## Phase 2 — Exercise library

- **Seed source: [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
  (public domain).** 63 exercises curated by hand across the four categories,
  with names, muscle groups, equipment, instructions, and demo image URLs
  taken from the dataset (`prisma/seed-data.json`, generated + URL-verified).
  Demo media are static JPGs, not animations — good enough for Phase 2;
  swappable per-exercise later since it's just a URL column.
- **Exercise ids are stable slugs** (`goblet-squat`), not UUIDs, so device
  SQLite rows, seed re-runs, and plan references stay stable across resets.
- **One category per exercise** (primary discipline). Plans that need shared
  movements (a bodybuilding day using squats) may pull across categories in
  Phase 3; category is a browsing/filter bucket, not a hard fence.
- **Home alternatives are a self-relation** (`home_alternative_id`), curated
  in the seed, e.g. goblet squat → bodyweight squat.
- **Sync protocol: pull with `updatedSince` cursor.** Server returns
  `serverTime` with every page; the client stores it after applying rows, so
  clock skew can't skip updates. Device upserts are `INSERT OR REPLACE` on
  the slug id — idempotent by construction (unit-tested: sync twice → same
  row count).
- **Offline demo images: `expo-image` disk cache + prefetch after sync.**
  Images render offline once the device has synced online at least once;
  they are not bundled into the APK (63 images ≈ several MB and the set will
  grow/change server-side).
- **Arrays in SQLite are stored as JSON text** columns (`equipment`,
  muscles, instructions); Postgres keeps native `text[]`.
- **Mobile data-layer tests run against `node:sqlite`** through the same
  minimal `DbLike` interface expo-sqlite satisfies — real SQLite semantics
  in unit tests, no native Expo modules needed.

## Phase 3 — Plan Builder v1

- **Plans are generated and stored server-side** (`POST /plans`,
  `GET /plans/active`); building a plan therefore needs a connection. The
  active plan is cached on device (JSON document in SQLite) so viewing —
  and later starting a workout — works offline. Server-owned, device-cached,
  never edited locally, so a blob beats normalized device tables.
- **Templates select by muscle target, not by exercise id** (except
  powerlifting SBD lifts and crossfit WODs, where the movement is the
  prescription — those prefer exact ids and fall back to the curated home
  alternative when the context disallows them).
- **Split resolution in a custom mix**: each category's split is chosen by
  how many days of that category the week has — 3 BB days in a 4-day custom
  plan still resolve to PPL, the cardio day slots in as Steady State.
- **Muscle-balance guard**: after filling slots, any major group (chest,
  back, shoulders, quads, hams/glutes) left at zero for the week gets one
  exercise appended to the lightest strength day — the "PPL×5 leaves legs
  behind" driver from PROJECT.md, enforced by test.
- **One active plan per user**; creating a new one deactivates the previous
  (history kept in Postgres).
- **Rep prescriptions are strings** ("8-12", "AMRAP 60 s",
  "25-40 min zone 2") so all four modalities fit one shape; sets/rest are
  numeric. Rest defaults follow PROJECT.md: 60–90 s hypertrophy, 3–5 min
  powerlifting.
- **Exercise variation** ("random injection to fight staleness") is
  deferred to Phase 6 (AI layer) — v1 is deterministic on purpose so the
  same inputs give the same reviewable plan.

## Phase 6 — AI layer v1

- **Model: `claude-opus-4-8`** via the official `@anthropic-ai/sdk`,
  overridable with `AI_MODEL`. All calls go through one `aiJson()` gateway:
  Zod-validate → one retry carrying the validation errors → deterministic
  fallback. The transport is injectable, so tests simulate malformed and
  failed model responses without a key.
- **`AI_ENABLED=false` is the default** and requires both the flag and an
  `ANTHROPIC_API_KEY` to flip on. The deterministic rules (below) are not a
  degraded mode — they ARE the product behavior with AI off, and they're
  what the done-when test asserts.
- **Deterministic adjustment rules**: full completion last time → +2.5%
  load; skipped or <60% of sets → one set fewer and −10% load; last session
  cut short → one set trimmed everywhere. Ability heuristic: <6 sessions or
  <50% completion → beginner; <24 sessions or <85% → intermediate; else
  advanced.
- **AI output is sanitized beyond Zod**: adjustments referencing exercise
  ids not in the plan day are dropped; if nothing survives, the
  deterministic fallback is used wholesale.
- **Prompts contain only the user's own goal, ability, plan day, and recent
  session summaries** — never other users' data, never the exercise
  library at large.
- **Prescribed loads**: `planned_weight_kg` added to workout sets (nullable,
  defaulted for older clients), populated on-device from the adjustment and
  round-tripped through sync. The device fetches the adjustment when
  starting a workout and silently proceeds plan-as-written when offline.
- **No live-model test ran in this environment** (no ANTHROPIC_API_KEY
  present). The validate/retry/fallback path is fully covered with injected
  transports; first real-key smoke test is a manual step.

## Phase 5 — Progress tracking

- **All progress is computed on device from local SQLite** (pure functions in
  `computeProgress.ts`) — renders fully offline. Multi-device aggregation
  (pulling sessions logged on another phone) is deferred; the server has the
  data when that's wanted.
- **Volume metric = completed sets per primary muscle per week** (the
  hypertrophy-literature convention), not tonnage — robust to bodyweight
  exercises where weightKg is null. Weeks are Monday-anchored UTC.
- **Strength curve = heaviest completed set per session**, per exercise.
- **Adherence = sessions completed / (trainingDays × 4 trailing weeks)**,
  capped at 100%. Streak = consecutive weeks meeting trainingDays; the
  in-progress week counts once met and never breaks the streak early.
- **react-native-svg added** for line charts (Expo-blessed). Charts follow
  the dataviz method: single-series only, identity from the section title
  (no legends, no categorical palette), 2px green line (green = progress),
  neutral bars, direct label on the last point, text in text tokens.
- **Bodyweight entries sync like workouts** (client UUID upsert), stored
  canonical kg.

## Phase 4 — Active workout + sync

- **Idempotency via client-generated UUIDs.** The device mints the session,
  exercise, and set ids; the server upserts on the session id and
  delete-recreates nested rows in one transaction. Any replay (retry, dropped
  ack, double tap) converges to the same rows. Local writes are
  `INSERT OR REPLACE` on the same ids.
- **Sync queue = a `synced` flag** on the local session row, flipped only
  after the server acknowledges the id. Crash between POST and ack ⇒ harmless
  replay. Push runs at app entry and after every finish; failures are silent
  (offline is a normal state, not an error).
- **Sessions are normalized in Postgres** (session → exercises → sets) so
  Phase 5 strength curves/volume queries are plain SQL — **plus** a `delta`
  JSONB column holding the typed `SessionDelta` (counts, skips, swaps with
  reason, cutShort). The delta is the AI seam: computed on device by a pure,
  unit-tested `computeDelta()`, Zod-validated at the boundary, stored
  verbatim. On device the full payload is one JSON row — the device never
  queries inside it.
- **Weights stored in canonical kg** (`weight_kg`); the device converts
  to/from the user's kg/lb setting at the edges.
- **Swap targets the curated home alternative** (reason auto-set to
  'equipment'); free swaps to arbitrary exercises and injury flags come with
  the substitution engine (Phase 9 scope note in PROJECT.md §1.9).
- **Planned weight is null in Phase 4** — v1 template plans prescribe
  sets×reps only; load prescriptions arrive with the AI layer (Phase 6),
  and the set shape already carries `plannedReps`/`weightKg` for it.
- **In-progress sessions live in memory**, not SQLite; only finished
  sessions persist. A crash mid-workout loses the in-flight entries —
  accepted for v1, draft persistence is a small follow-up if it stings.
- **Done-when verification**: unit tests (sync twice → no dupes, delta
  shape), backend supertest (replay + corrected-resend convergence), and a
  live rehearsal script (`mobile/scripts/e2e-sync-rehearsal.ts`) that drives
  the real device data layer against the running backend through an
  airplane-mode → reconnect → replay sequence. The literal airplane-mode
  toggle on the S22 remains the manual check.

## Phase 1 — Auth + profile

- **JWT lifetime 30 days**, stateless, no refresh tokens. Right-sized for a
  personal fitness app; revocation can come later with a token version column.
- **Session storage: expo-secure-store** (Android Keystore) rather than
  AsyncStorage — it holds a bearer token.
- **Session restore is offline-first**: on cold start the stored session is
  trusted immediately; a background `/me` refresh updates the profile, and
  only a definitive 401 logs the user out. Network failure never logs out.
- **Navigation: React Navigation (bottom tabs)** rather than expo-router.
  The app is a small fixed set of screens; file-based routing buys little and
  React Navigation keeps navigation typed and explicit.
- **API base URL** via `EXPO_PUBLIC_API_URL` env (see `mobile/.env.example`),
  defaulting to `10.0.2.2:4000` (Android emulator loopback). Physical S22
  needs the dev machine's LAN IP.
- **Profile lives at `GET/PATCH /me`** (not under /auth) — auth is
  authentication, profile is a resource.
- **"Done when" verification**: backend half automated in
  `backend/src/routes/auth.test.ts` (register → login → profile PATCH →
  fresh app instance still accepts the token; Postgres row asserted). The
  literal force-quit-and-reopen check needs the physical device and remains
  a manual step.
