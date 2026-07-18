# DECISIONS.md — choices made during the Phase 1–4 build run

Decisions taken where PROJECT.md was ambiguous, plus any deviations from the
decided stack. Review and veto freely.

## Audit remediation (AUDIT.md) — decisions to confirm

### Chosen best actions for audit points S6–S10, and why

- **S6 community moderation — validate + report + auto-hide, not pre-review.**
  Images are magic-byte validated at upload (a string claiming to be a PNG
  must BE a PNG); any viewer can report a public workout (one per user); 3
  distinct reporters auto-hide it. Chose auto-hide over deletion (reversible
  — a brigade can't destroy content) and over human pre-moderation (no
  moderators exist; pre-review would kill sharing at this scale).
- **S7 CORS — env allowlist, deny-by-default.** Native apps send no Origin so
  they're unaffected; browsers get nothing unless CORS_ORIGINS lists them.
  One line of config beats future retrofitting.
- **S8 logging + limiter — pino with hard redaction; limiter stays in-memory
  but isolated.** All limiter state lives in one module (`rateLimit.ts` +
  chat's), so Redis is a drop-in when a second instance exists. Chose NOT to
  add Redis now: it's a new infra dependency for a single-instance deployment
  — pure cost, no benefit today.
- **S9 — native bcrypt over argon2.** Same API as bcryptjs (two-line diff),
  moves hashing off the event loop. Argon2id is marginally stronger but a
  migration (different hash format, rehash-on-login logic) for little gain at
  this threat level; bcrypt cost 12 remains OWASP-acceptable.
- **S10 prompt injection — prompt hardening + injury context, NOT output
  filtering.** A regex/classifier on coach replies has a high false-positive
  rate on legitimate fitness talk ("push through the last rep" vs. "push
  through pain") and gives false confidence. The real controls: the plan
  builder is schema-locked (invention is structurally impossible), the chat
  blast radius is the user's own data, and both system prompts now declare
  context/user text to be data-not-instructions with injury constraints
  standing. Revisit with a proper safety classifier if chat ever becomes
  multi-user-visible.

### Other remediation decisions

- **Email verification is advisory** (banner + code entry on Profile), not a
  login gate: gating would lock out every pre-existing account and punish
  mail-delivery hiccups. A password reset counts as verification (it proves
  mailbox control). Tighten to feature-gating (e.g. required before
  publishing community workouts) once a real mail provider is wired.
- **Mailer is a console transport behind one interface** — registration/reset
  never block on mail; a real SMTP/SES transport is a one-file change.
- **Logout revokes ALL of a user's tokens** (single tokenVersion), not just
  the current device's. For a single-device personal app this is the right
  simplicity; per-device sessions would need a session table for no present
  user benefit.
- **Account deletion is immediate hard-delete** (cascade), not a soft-delete
  grace window. Grace windows need scheduled purging + "recover" flows; for
  launch, immediate erasure is simpler and strictly more privacy-correct.

## Pieces 1–4 (ladders, onboarding, AI plan builder, difficulty) — decisions to confirm

### Piece 1 — movement patterns, ladders, starter templates

- **Ladder links are soft String refs** (`easierVariantId`/`harderVariantId`),
  matching the existing `homeAlternativeId` pattern; integrity is enforced by
  the seed data + a test asserting every link is same-pattern, adjacent-tier,
  and symmetric.
- **5 curated exercises added** where the free-exercise-db lacked a required
  ladder rung: Wall Push-Up, Partial Bodyweight Squat, Bird-Dog, Standing
  March, Seated Torso Rotation (demo images borrowed from the nearest
  sibling exercise). All other ladder rungs map to existing dataset entries —
  no unlisted exercises were invented beyond these required rungs.
- **`movementPattern`/`difficultyTier` are nullable**: only ladder-relevant
  exercises are tagged (76 of 78); isolation machines that fit no pattern
  stay untagged and never participate in tier resolution.
- **Templates live in code** (`backend/src/services/starterTemplates.ts`),
  not the DB — they are static curated content, versioned with the code, and
  reference library slugs only; resolution validates every slug against the
  DB and fails loudly (500 TEMPLATE_INTEGRITY) on drift.
- **Template rationale is a code comment** in starterTemplates.ts (CDC/WHO/
  ACSM/NHS/NSCA-derived programming), traceable but never user-facing; the
  user-facing `disclaimer` field carries the short non-alarming medical note.
- **`GET /plans/templates` returns all 6 templates** regardless of the
  requested context — a template that doesn't support the context (e.g.
  foundations-gym for home) resolves in its own supported context, so the
  onboarding/AI layers always see the full set. `POST /plans/from-template`
  does enforce context support (400 TEMPLATE_CONTEXT).
- **Experience resolution**: only `beginner` regresses exercises down the
  ladder (via per-exercise `beginner` overrides); intermediate/advanced get
  the standard form. Defaults to beginner — these are starter templates.
- **`PlanExercise.note`** added for short per-exercise cues ("stop if a
  joint hurts", RIR guidance) so template safety cues survive into real plans.
- **Fat Loss Focus composes** the matching Foundations strength days plus two
  walk/jog interval days rather than duplicating day definitions.

### Piece 2 — first-run onboarding

- **"Shown once" is server-tracked** (`User.onboardedAt`, set via
  `PATCH /me { onboarded }` on complete OR skip) so the wizard shows once per
  account, not per device/reinstall. Marking done is best-effort — offline
  completion never traps the user in the wizard (it may reappear next cold
  start; accepted).
- **The wizard renders instead of the tab navigator** (like the auth screens)
  rather than as a navigation route — it precedes normal app use. Profile's
  "Revisit starter setup" reopens it via a small OnboardingContext.
- **Age is asked as a band** (under 40 / 40–59 / 60+), not an exact number —
  it only tunes the gentle recommendation, and the UI says so explicitly.
- **Recommendation rules** (pure, unit-tested `recommendTemplate.ts`): the
  stated goal always wins (never inferred from demographics); a `general`
  goal recommends Gentle Start when 60+ or brand-new-with-injuries, otherwise
  Foundations by context; "training regularly" resolves templates at
  intermediate (no ladder regression), everyone else at beginner.
- **Injuries stay local** (SQLite meta `onboarding.injuries`) as future
  coaching context; they influence the gentle recommendation but are not yet
  sent to the server. Free-text note included.
- **Disclaimer requires an explicit checkbox acknowledgment** before the
  recommendation step; the same copy also arrives per-template from the API.
- **The plan write is the existing `/plans/from-template` path** and happens
  only on the explicit "Add this plan" tap; "Not now"/skip completes
  onboarding without writing anything.

### Piece 3 — conversational plan builder

- **Server-stateless conversation**: the client sends the builder transcript
  each turn to `POST /ai/plan-builder`; nothing is persisted into chat
  history and the server never writes a plan from this endpoint. The write
  happens only when the client, after the user's explicit "Add this plan"
  tap, calls the existing `/plans/from-template` or `/plans/custom` paths.
- **Schema is the knowledge boundary**: `aiJson()` with a per-request Zod
  schema whose exercise ids are refined against the live library and whose
  template ids are an enum of the Piece 1 set. Persistent invention (bad ids
  survive the retry-with-feedback) degrades to the same 503 AI_UNAVAILABLE
  as chat — invented content can never reach the client. No `note`/cue field
  exists in the proposal schema, so the model cannot invent coaching cues.
- **System prompt grounded in Piece 1**: template catalog + compact exercise
  catalog (id/pattern/tier/equipment) + ladder logic + the same disclaimer
  language are embedded; goal is never inferred, one question per turn.
- **Shares the chat rate-limit budget** (20/hr) rather than adding a second
  limiter — both are "coach" usage.
- **Builder UI lives inside the Coach tab** as a mode toggle ("Build a plan"
  / Exit), reusing the chat bubble list; the proposal renders as an in-chat
  card with Add / Not-this-one. Degrade states reuse the existing chat
  banners (unavailable / offline / rate-limited).
- **Custom proposals get default timers** (90s rest, no work interval,
  auto-advance) — the builder schema deliberately doesn't let the model set
  timer preferences.

### Piece 4 — difficulty slider

- **Ladder membership, not equipment, picks the branch**: the ladders
  deliberately include loaded rungs (band pull-apart → inverted row →
  dumbbell row → pull-ups), so "swap via ladder" applies to any
  pattern-tiered exercise with a sibling link; non-laddered, non-cardio
  exercises trade rest instead (±30s per step, floor 15s). Weight guidance
  stays with the existing AI next-session layer.
- **Shifts resolve from a recorded standard baseline**
  (`PlanExercise.baselineExerciseId`/`baselineRestSeconds`, null at
  standard): relative walks are lossy at ladder ends (a bottom rung that
  can't go lower would wrongly climb when returning to standard), so every
  difficulty always maps the baseline → target tier. Gentle → Challenging →
  Standard round-trips exactly (test-verified).
- **Equipment fixes**: chair-squat ('machine'), pelvic-tilt-into-bridge,
  decline-push-up, mountain-climbers ('other') were dataset-mistagged and are
  now 'bodyweight' — chair-squat and pelvic-tilt are in the Gentle Start home
  template and must pass home-equipment filters.
- **Per-session dial-back is client-side and pure** (`dialBackDay`): one tier
  down for laddered exercises via the synced local ladder fields, sets −1
  (min 1), numeric reps ×0.75; "hold"/"AMRAP"/interval prescriptions pass
  through. It transforms only the day object handed to the active-workout
  screen — server plan and local cache untouched; the session log already
  records planned-vs-actual for any swap.
- **UI**: difficulty ChipRow on Home under the plan header (persisted via
  `PATCH /plans/active/difficulty`, offline shows a clear error);
  "Not feeling it — start easier" ghost button inside each expanded day card.

## Extension run (Groups A–H) — decisions to confirm

- **Group A**: eye-toggle lives on the shared `TextField` (`secureToggle`
  prop) so every password field is consistent; confirm-password match is
  validated live and blocks submit before any network call; a shared
  `KeyboardForm` (KeyboardAvoidingView + ScrollView) wraps login/register/
  profile. Profile has no text field yet but is wrapped now for Groups C/G.
- **Group B**: macros are four nullable numbers (`protein_g`/`carbs_g`/
  `fat_g`/`calories`) plus `estimated_fields String[]` flagging which values
  are AI-estimated. Estimation is a **separate `POST /nutrition/estimate-
  macros`** endpoint, not folded into meal sync, so sync stays deterministic/
  idempotent. Flow: save locally (honest nulls) → sync → if online + any
  unknown, request estimates → merge only the previously-null fields → re-save
  (resets `synced`) → re-sync. **AI-off/failure returns no estimates** — the
  deterministic fallback is an honest empty object, never fabricated numbers.
  The service also filters estimates to unknown fields server-side so AI can
  never overwrite a user-entered value. Estimated values render in the blue
  info accent with `~` + "est".
- **Group C**: two independently-configurable reminders — training-day
  (weekdays + time) and meal-logging (daily + time) — each with a native
  time picker (`@react-native-community/datetimepicker`), replacing the fixed
  7/12/18 chips. Notifications keep stable identifiers (`training-<weekday>`,
  `meal-daily`) so Group H can manage the meal one independently. Pure model
  (`reminderModel.ts`) split from the RN/Expo scheduling code so it's
  unit-testable in node. Expo-Go lazy-load gate retained; time-picker UI
  works in Expo Go, actual firing needs a dev/release build (device check).
- **Group D**: custom plans reuse the existing Plan/PlanDay/PlanExercise
  tables — no new plan structure. Added `duration_seconds` to plan_exercises
  (time-based holds/intervals), `is_custom` + timer fields
  (`default_rest_seconds`, `work_interval_seconds`, `auto_advance_timers`) to
  plans. New `POST /plans/custom` persists the user's exact named-day +
  hand-picked-exercise structure (validates every exercise id) — separate
  from template `POST /plans`. **Active Workout needed no structural change**:
  it already builds per-set tick-off from `day.exercises` regardless of
  source, so custom plans flow through unchanged; time-based exercises just
  surface their `Ns` hold in the set label. Estimated session duration is a
  pure client helper (`estimateDayMinutes`, unit-tested). The custom builder
  reuses the Phase-2 library search for exercise picking.
- **Group E**: the mandatory daily routine is a `PlanDay` with `is_daily=true`
  rather than a separate table — it reuses everything (exercises, Active
  Workout, sessions). Home renders `isDaily` days in an always-visible "Every
  day" section above the "Weekly split". **Completion independence is
  automatic**: each day (routine or split) starts its own Active Workout →
  its own `WorkoutSession` row keyed by client UUID; there is no shared
  completion flag, so completing the routine can't affect the split's
  completion. Since Home shows the whole plan (no per-calendar-day rotation),
  the routine appears every day by construction. Set via the custom builder's
  per-day "Do every day" toggle.
- **Group F — flagged decisions to confirm/override:**
  1. **No moderation/reporting in this pass** — "public" means visible to
     every authenticated user, full stop. No report button, no review queue,
     no takedown flow. Stated explicitly so it isn't silently missing; build
     it before any real public launch.
  2. **Copy semantics, not live reference** — using someone's public workout
     `POST /workout-library/:id/copy` creates a brand-new custom Plan owned by
     the copier. The creator's later edits never touch it. (Confirmed with a
     two-account backend test.)
  3. **AI cover-image generation — PRODUCT FINDING.** Anthropic's API is
     text/JSON only; **Claude cannot generate images** and there is no
     Anthropic image endpoint. So the "AI suggests a cover image" path has no
     first-party source on ProFit's stack. `POST /workout-library/suggest-
     image` is a genuinely separate path (NOT routed through `aiJson()`),
     gated behind `AI_ENABLED`, and currently returns
     `{available:false, imageUrl:null, reason}` — the workout then saves with
     no cover, which is the required non-blocking behavior. **To actually
     generate images you must add a third-party image vendor** (e.g. an
     image-gen API): new API key, new cost, new data-sharing disclosure in
     the privacy policy. Left as your decision — not silently wired in.
  - Cover images / avatars are stored **inline as data-URI text** (backend
    `express.json` limit raised to 2mb; Zod caps the string ~900KB; client
    picks at quality 0.4). MVP shortcut — move to object storage (S3/R2)
    before scale; base64-in-Postgres is fine for a beta, wasteful at volume.
  - Community is a **7th bottom tab** ("earth" icon) for discoverability
    (the done-when needs a second account to *find* the workout). Tab bar is
    getting full — consider a "More" grouping later. Browsing is online-only
    (no offline SQLite cache — consistent with chat/plan-create).
- **Group G**: `avatar` (inline data URI) + `public_bio` on User, edited in a
  new Profile "Public profile" section (own save, image via the shared
  `pickImageAsDataUri`). **Discoverability by construction, not enforcement**:
  there is deliberately NO public `GET /users/:id` endpoint — a creator's
  avatar/bio are only ever returned as the `user` join on a *public* workout
  in `/workout-library/public`. A user who has shared nothing public is never
  a creator anywhere, so their profile is unreachable. Confirmed by a
  three-account backend test (sharer visible, hermit invisible, no user
  route). Same inline-image caveat as Group F (move to object storage before
  scale).
- **Group H**: (1) day-by-day timeline is a pure `dailyActivity()` — one
  point per calendar day (UTC-bucketed, like `weekStartOf`) with session +
  completed-set counts, rendered as a green line on Progress; N logged days →
  N points (unit-tested). (2) The meal-cadence reminder switches from Group
  C's repeating DAILY trigger to a **re-armable single DATE occurrence**:
  `nextMealReminderAt(time, loggedToday)` picks today (time still ahead,
  nothing logged) or tomorrow (logged / past). `refreshMealReminder()` re-arms
  it on **app open** (HomeScreen) and **after logging a meal** (Nutrition), so
  it never fires on an already-logged day. **Trade-off (documented):** a local
  repeating trigger can't cancel a single instance, so the skip is
  best-effort — it depends on the app being opened / a meal logged that day to
  re-arm; a truly closed-app skip would need a background task or server push,
  out of scope.

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

## Phase 9 — Polish & hardening

- **Deload rule**: average soreness ≥ 4 over the trailing 7 days of
  check-ins → −20% load and −1 set on every exercise, overriding
  progression, in both the deterministic rules and the AI prompt. Check-ins
  are one-per-day, prompted at workout start, skippable, offline-synced.
- **Export is device-side** (from local SQLite via the SDK 57 `File`/`Paths`
  API + share sheet) so it works offline and reflects exactly what the user
  sees: versioned JSON of everything + a one-row-per-set CSV. Builders are
  pure and unit-tested.
- **Reminders are local weekly notifications** on user-picked weekdays at
  7:00/12:00/18:00. Plans don't map days to weekdays, so reminder days are
  chosen independently in Profile — mapping plan day N to a weekday is a
  future refinement. Firing is inherently a physical-device verification.
- **Substitution engine reuses the equipment-tag + home-alternative model**:
  candidates share a primary muscle, fit the training context, curated
  alternative first. Swap reason recorded as 'equipment' (an
  injury-body-part flag was deferred — the delta shape already carries a
  reason enum including 'injury').
- **Sync-conflict hardening**: a permanent 4xx on workout push quarantines
  the batch (`synced = 2`) instead of retrying forever — one poisoned row
  can no longer block the queue; transient errors (network, 5xx, 429) keep
  the batch pending. Quarantined rows remain on device and in exports.
- **Warm-up/cool-down blocks are static per-category checklists** rendered
  around the session (not persisted per-plan) — content is a template, not
  data, until the AI layer wants to vary it.

## Phase 8 — AI chat companion

- **Free text is allowed here and nowhere else** (`aiText()` beside
  `aiJson()`); the model's system prompt grounds answers in a context JSON
  of the user's own profile, active plan (with equipment tags + curated
  home alternatives), and last 5 session deltas — nothing else is sent.
- **Chat is server-owned and online-only to send**; history is cached in
  device SQLite for offline reading. An unanswered user message is never
  persisted — history only contains exchanges that happened.
- **Degradation, not errors**: AI off or model failure → 503
  `AI_UNAVAILABLE`; rate limit → 429 `CHAT_RATE_LIMITED`; the device maps
  these plus offline to distinct blue-info banner states and rolls back the
  optimistic echo.
- **Rate limit is in-memory, 20 messages/hour/user** — right for the
  single-instance Oracle Free deployment; swap for a shared store if the
  backend ever scales out.
- **Verified with an injected model**: the test asserts the transport
  receives the user's home context + equipment tags for the swap question;
  a live-key conversation remains a manual check.

## Phase 7 — Nutrition

- **Meals are free text + portion + meal type** — no calorie fields, no
  macro tracking, matching PROJECT.md's "no arbitrary calorie targets".
  Calories can be layered on later without schema pain.
- **Profile items soft-delete** (`deleted_at`) so removals sync like every
  other change instead of needing a delete protocol.
- **The suggestion is server-computed on demand** (`GET
  /nutrition/suggestion`), not stored — it reflects today's logs at ask
  time. Offline, the card simply doesn't render; logging works fully.
- **Deterministic fallback** references the most recent logged meal and the
  goal (cutting → smaller portion / protein swap; bulking → add a protein
  snack; maintaining → affirmation, change nothing) — worded to be useful
  and non-preachy without the model.
- **Nutrition is a fifth tab** (apple icon). Phase 8's chat will make six —
  still within Android bottom-nav norms; revisit if a seventh appears.

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
