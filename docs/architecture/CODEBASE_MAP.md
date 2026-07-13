# ProFit — Codebase Map

A reference for hand-reviewing and editing individual files with full context.
Every description reflects what the code actually does as of the walk on
2026-07-14 (commit `36c3a73`, extension groups A–H complete). Where real
behavior diverges from PROJECT.md/DECISIONS.md, it is flagged in
[§6 Known Issues](#6-known-issues).

Sections:
1. [Overview](#1-overview)
2. [Full annotated directory tree](#2-full-annotated-directory-tree)
3. [Database schema reference](#3-database-schema-reference)
4. [Full API surface](#4-full-api-surface)
5. [File-by-file reference, grouped by domain](#5-file-by-file-reference-grouped-by-domain)
6. [Known issues](#6-known-issues)

---

## 1. Overview

ProFit is a workout + nutrition tracker split into two sibling folders (no
monorepo tooling): an **Express + TypeScript backend** (`backend/`) and an
**Expo React Native app** (`mobile/`, currently pinned to Expo SDK 54). The
backend owns a **PostgreSQL** database via Prisma (Docker, connect on
`localhost:5434` locally — Postgres.app shadows 5433). The mobile app is
**offline-first**: every user-generated record is written to an on-device
**SQLite** database first, then pushed to Postgres through an idempotent,
UUID-keyed sync layer (re-sending a batch upserts, never duplicates). Some
data is server-owned instead of synced (the exercise library is pulled down
to SQLite read-only; the active plan and chat history are cached locally for
offline reading; community workouts are online-only). All AI features
(ability inference, next-session adjustment, meal-macro estimation, meal
suggestions, coach chat) run **server-side only** through a single `aiJson()`
gateway (validate → retry once → deterministic fallback) or its free-text
sibling `aiText()`, both gated behind the `AI_ENABLED` flag; the Anthropic API
key never reaches the device, and with AI disabled every feature degrades to a
deterministic non-AI path. The mobile app resolves the backend URL at runtime
from the Metro connection host (`src/api/baseUrl.ts`) so no LAN IP is
hand-edited.

---

## 2. Full annotated directory tree

```
ProFit/
├── docker-compose.yml            # Postgres 16 container; maps 5433 + loopback 5434, named volume
├── PROJECT.md                    # Product scope, phases, current-position notes (source of intent)
├── DECISIONS.md                  # Every non-obvious decision, phases 1–4 + extension groups A–H
├── RUNBOOK.md                    # Local startup commands (db / backend / mobile), env, tests
│
├── backend/
│   ├── package.json              # Deps + scripts: dev (ts-node-dev), build, db:migrate/seed/studio, test (vitest)
│   ├── tsconfig.json             # CommonJS, strict, rootDir src, includes src/**
│   ├── prisma.config.ts          # Prisma config: schema path, migrations path, DATABASE_URL from env
│   ├── .env / .env.example       # DATABASE_URL (5434), JWT_SECRET, PORT, AI_ENABLED, ANTHROPIC_API_KEY, AI_MODEL
│   ├── prisma/
│   │   ├── schema.prisma         # All 14 models + 6 enums (see §3). generator outputs to src/generated/prisma
│   │   ├── seed.ts               # Idempotent upsert of seed-data.json (2 passes for home-alternative FKs)
│   │   ├── seed-data.json        # 63 curated exercises (free-exercise-db) w/ demo URLs + home alternatives
│   │   └── migrations/           # 14 migrations, init_user → profile_avatar_bio (chronological)
│   └── src/
│       ├── index.ts              # Entrypoint: dotenv + createApp().listen(PORT)
│       ├── app.ts                # createApp(): cors, express.json({limit:2mb}), /health, mounts all 11 routers, errorHandler
│       ├── db.ts                 # Single PrismaClient w/ PrismaPg adapter from DATABASE_URL
│       ├── lib/
│       │   ├── errors.ts         # ApiError class + static helpers + parseOrThrow(schema, data)
│       │   └── aiJson.ts         # aiEnabled(), aiJson() (validated), aiText() (free-text), extractJson(), liveTransport
│       ├── middleware/
│       │   ├── auth.ts           # requireAuth: verify Bearer JWT, set req.userId (augments Express Request)
│       │   └── error.ts          # errorHandler: ApiError→{error:{code,message}}, bad-JSON→400, else 500
│       ├── routes/               # One <domain>.routes.ts + <domain>.schemas.ts + <domain>.test.ts per domain
│       │   ├── auth.routes.ts / auth.schemas.ts / auth.test.ts
│       │   ├── profile.routes.ts / profile.schemas.ts / profileG.test.ts
│       │   ├── exercises.routes.ts / exercises.schemas.ts / exercises.test.ts
│       │   ├── plans.routes.ts / plans.schemas.ts / plans.test.ts / customPlan.test.ts / dailyRoutine.test.ts
│       │   ├── workouts.routes.ts / workouts.schemas.ts / workouts.test.ts
│       │   ├── bodyweight.routes.ts / bodyweight.schemas.ts / bodyweight.test.ts
│       │   ├── ai.routes.ts / ai.test.ts
│       │   ├── nutrition.routes.ts / nutrition.schemas.ts / nutrition.test.ts / nutritionMacros.test.ts
│       │   ├── chat.routes.ts / chat.schemas.ts / chat.test.ts
│       │   ├── recovery.routes.ts / recovery.schemas.ts / recovery.test.ts
│       │   └── userWorkouts.routes.ts / userWorkouts.schemas.ts / userWorkouts.test.ts
│       ├── controllers/          # Thin req→service adapters, one per domain (11 files, listed §5)
│       ├── services/             # Business logic + Prisma access, one+ per domain
│       │   ├── auth.service.ts, profile.service.ts, exercises.service.ts
│       │   ├── plans.service.ts, planTemplates.ts (static split templates)
│       │   ├── workouts.service.ts, bodyweight.service.ts, recovery.service.ts
│       │   ├── ai.service.ts, nutrition.service.ts, chat.service.ts, userWorkouts.service.ts
│       └── generated/prisma/     # GENERATED Prisma client (gitignored); do not hand-edit (see §5)
│
├── mobile/
│   ├── App.tsx                   # Root: loads Saira fonts, SafeAreaProvider > ThemeProvider > AuthProvider > RootNav
│   ├── index.ts                  # registerRootComponent(App)
│   ├── app.json                  # Expo config: name/slug profit, pkg com.mundala.profit, plugins, EAS projectId
│   ├── eas.json                  # EAS build profiles (development/preview/production) + submit
│   ├── package.json              # SDK 54 deps; scripts start/android/ios/web/test/typecheck
│   ├── tsconfig.json             # extends expo/tsconfig.base, strict, types:[node]
│   ├── theme.ts                  # Design tokens: palette (dark+light), typography, radius, spacing, glow(), theme()
│   ├── .env / .env.example       # EXPO_PUBLIC_API_URL (usually unset — auto-detected; see baseUrl.ts)
│   └── src/
│       ├── api/
│       │   ├── baseUrl.ts        # Resolve backend URL: env override → Metro host:4000 → emulator loopback
│       │   ├── client.ts         # request() helper + api.* methods for every endpoint; ApiError/NetworkError
│       │   └── types.ts          # User, AuthResponse, ProfileUpdate, Goal/TrainingContext/Units
│       ├── theme/
│       │   └── ThemeContext.tsx  # ThemeProvider + useAppTheme(); light/dark via system + AsyncStorage
│       ├── ui/
│       │   ├── index.tsx         # Shared components: Screen, KeyboardForm, Title, Heading, Body, Button, TextField, ChipRow, etc.
│       │   └── charts.tsx        # LineChart, BarRow, StatTile (react-native-svg, single-series)
│       ├── navigation/
│       │   └── RootNav.tsx       # Auth gate + 7-tab bottom navigator (Home/Library/Community/Progress/Nutrition/Coach/Profile)
│       ├── data/                 # Offline-first SQLite layer (schema, repos, sync, types) — see §5 Sync
│       │   ├── db.ts             # getDb(): opens profit.db, WAL, runs migrations once
│       │   ├── schema.ts         # Versioned migrations array (v1–v7) + migrate(db) via PRAGMA user_version
│       │   ├── types.ts          # DbLike interface, Exercise, ExerciseCategory, HOME_EQUIPMENT
│       │   ├── exercisesRepo.ts  # Exercise CRUD/search + meta kv + findSubstitutes
│       │   ├── exercisesSync.ts  # Pull-sync exercises with server-clock cursor
│       │   ├── workoutRepo.ts    # Local workout session queue (save/list/unsynced/markSynced)
│       │   ├── workoutSync.ts    # pushWorkouts(): idempotent push + 4xx quarantine
│       │   ├── workoutTypes.ts   # WorkoutSet, SessionExercise, SessionDelta, WorkoutSessionPayload
│       │   ├── planRepo.ts       # Active-plan JSON cache + Plan/PlanDay/PlanExercise types + estimateDayMinutes
│       │   ├── bodyweightRepo.ts # Bodyweight queue + pushBodyweight
│       │   ├── nutritionRepo.ts  # Meal profile + meal log queues (macros), pushMealProfile/pushMeals
│       │   ├── recoveryRepo.ts   # Recovery check-in queue + pushCheckins + hasCheckinToday
│       │   ├── chatRepo.ts       # Local cache of server chat history
│       │   ├── communityTypes.ts # UserWorkout/UserWorkoutExercise/WorkoutCreator/CreateWorkoutInput types
│       │   └── __tests__/        # testDb.ts (node:sqlite DbLike) + 6 sync/compute test files
│       └── features/             # Feature folders (screens + hooks + pure logic) — see §5
│           ├── auth/             # AuthContext, authStorage, Login/Register screens, validate
│           ├── home/             # HomeScreen, HomeStack
│           ├── library/          # LibraryScreen, ExerciseDetailScreen, LibraryStack, useExerciseLibrary
│           ├── plan/             # PlanBuilderScreen, CustomPlanBuilderScreen, usePlan
│           ├── workout/          # ActiveWorkoutScreen, WorkoutSummaryScreen, computeDelta, useWorkoutSync, warmups
│           ├── progress/         # ProgressScreen, computeProgress
│           ├── nutrition/        # NutritionScreen
│           ├── chat/             # ChatScreen
│           ├── community/        # CommunityScreen, CreateWorkoutScreen, WorkoutDetailScreen, ExercisePickerModal, CommunityStack, pickImage
│           ├── profile/          # ProfileScreen, PublicProfileSection
│           └── settings/         # RemindersSection, reminders, reminderModel, exportData
│
├── design/
│   ├── DESIGN_NOTES.md           # Color/type/shape tokens (source of truth for theme.ts)
│   └── ProFit.html               # ~1.1MB Claude Design visual reference (NOT imported by the app)
│
└── docs/
    ├── DATA_INVENTORY.md         # Per-datum inventory (what/where/why/leaves-device/shared-with)
    ├── PRIVACY_POLICY.md         # Draft privacy policy (placeholders)
    ├── TERMS_OF_SERVICE.md       # Draft ToS (placeholders)
    ├── PLAY_DATA_SAFETY.md       # Play Console Data-safety answer sheet
    ├── STORE_LISTING.md          # Store copy + asset specs + content rating
    ├── DEPLOYMENT_CHECKLIST.md   # Ordered pre-launch checklist
    └── architecture/
        └── CODEBASE_MAP.md       # (this file)
```

---

## 3. Database schema reference

Postgres via Prisma. Table names are the `@@map` value; column names are the
`@map` value (snake_case) or the field name. All `id` columns are the primary
key. FK columns use `ON DELETE CASCADE` unless noted.

### Enums

| Enum | Values |
|---|---|
| `Goal` | bulking, cutting, maintaining |
| `TrainingContext` | home, gym |
| `Units` | kg, lb |
| `AbilityLevel` | beginner, intermediate, advanced |
| `ExerciseCategory` | bodybuilding, powerlifting, crossfit, cardio |
| `ChatRole` | user, assistant |
| `MealType` | breakfast, lunch, dinner, snack |

### `users`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | String (uuid) | PK, default uuid |
| email | String | unique |
| password_hash | String | bcrypt(12) |
| display_name | String | |
| goal | Goal | default maintaining |
| training_days | Int | default 3 |
| default_context | TrainingContext | default gym |
| units | Units | default kg |
| ability_level | AbilityLevel? | AI-derived (Phase 6) |
| avatar | String? | inline data URI or URL (Group G) |
| public_bio | String? | ≤280 chars (Group G) |
| created_at / updated_at | DateTime | |
| *relations* | | plans, sessions, bodyweights, mealProfile, mealLogs, chatMessages, checkins, userWorkouts |

### `exercises`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | String | PK — **stable slug** (e.g. `goblet-squat`), referenced by device SQLite |
| name | String | |
| category | ExerciseCategory | |
| primary_muscles / secondary_muscles / equipment / instructions | String[] | Postgres text[] |
| demo_url | String | image URL (GitHub CDN) |
| home_alternative_id | String? | FK → exercises.id (self-relation "HomeAlternative", **no cascade**) |
| updated_at | DateTime | sync cursor source |
| *relations* | | planExercises, sessionExercises, userWorkoutExercises, homeAlternative(For) |

### `plans`

| Column | Type | Notes |
|---|---|---|
| id | String (uuid) | PK |
| user_id | String | FK → users |
| name | String | |
| context | TrainingContext | |
| is_active | Boolean | default true (one active plan per user, enforced in service) |
| is_custom | Boolean | default false (Group D) |
| default_rest_seconds | Int? | custom timer (Group D) |
| work_interval_seconds | Int? | custom timer (Group D) |
| auto_advance_timers | Boolean | default true (Group D) |
| created_at / updated_at | DateTime | |

### `plan_days`

| Column | Type | Notes |
|---|---|---|
| id | String (uuid) | PK |
| plan_id | String | FK → plans |
| day_index | Int | unique per plan (`@@unique(plan_id, day_index)`) |
| name | String | |
| category | ExerciseCategory | |
| is_daily | Boolean | default false — mandatory daily routine (Group E) |

### `plan_exercises`

| Column | Type | Notes |
|---|---|---|
| id | String (uuid) | PK |
| plan_day_id | String | FK → plan_days |
| order | Int | unique per day (`@@unique(plan_day_id, order)`) |
| exercise_id | String | FK → exercises (**no cascade**) |
| sets | Int | |
| reps | String | modality-flexible ("8-12", "AMRAP 12 min", "hold") |
| rest_seconds | Int | |
| duration_seconds | Int? | time-based holds/intervals (Group D) |

### `workout_sessions`

| Column | Type | Notes |
|---|---|---|
| id | String | PK — **client-generated UUID** (idempotency key) |
| user_id | String | FK → users |
| plan_id / plan_day_id | String? | soft references (not FKs) |
| day_name | String | |
| category | ExerciseCategory | |
| context | TrainingContext | |
| started_at / finished_at | DateTime | |
| duration_seconds | Int | |
| delta | Json | SessionDelta — the planned-vs-actual summary the AI reads |
| created_at / updated_at | DateTime | index (user_id, started_at) |

### `workout_session_exercises`

| Column | Type | Notes |
|---|---|---|
| id | String | PK — client UUID |
| session_id | String | FK → workout_sessions |
| order | Int | unique per session |
| planned_exercise_id | String? | slug (not FK) |
| actual_exercise_id | String | FK → exercises |
| skipped | Boolean | |

### `workout_sets`

| Column | Type | Notes |
|---|---|---|
| id | String | PK — client UUID |
| session_exercise_id | String | FK → workout_session_exercises |
| set_index | Int | unique per exercise |
| planned_reps | String? | |
| planned_weight_kg | Float? | AI-prescribed load (Phase 6) |
| actual_reps | Int? | |
| weight_kg | Float? | canonical kg |
| completed | Boolean | |

### `bodyweight_entries`

| Column | Type | Notes |
|---|---|---|
| id | String | PK — client UUID |
| user_id | String | FK → users |
| weight_kg | Float | |
| logged_at | DateTime | index (user_id, logged_at) |

### `recovery_checkins`

| Column | Type | Notes |
|---|---|---|
| id | String | PK — client UUID |
| user_id | String | FK → users |
| soreness | Int | 1–5 |
| sleep_quality | Int | 1–5 |
| logged_at | DateTime | index (user_id, logged_at) |

### `meal_profile_items`

| Column | Type | Notes |
|---|---|---|
| id | String | PK — client UUID |
| user_id | String | FK → users |
| name / typical_portion | String | |
| deleted_at | DateTime? | soft delete |

### `meal_logs`

| Column | Type | Notes |
|---|---|---|
| id | String | PK — client UUID |
| user_id | String | FK → users |
| name / portion | String | |
| meal_type | MealType | |
| logged_at | DateTime | index (user_id, logged_at) |
| protein_g / carbs_g / fat_g / calories | Float? | null = unknown (Group B) |
| estimated_fields | String[] | which macros are AI-estimated (Group B) |

### `chat_messages`

| Column | Type | Notes |
|---|---|---|
| id | String (uuid) | PK — **server-generated** (chat is server-owned) |
| user_id | String | FK → users |
| role | ChatRole | |
| content | String | |
| created_at | DateTime | index (user_id, created_at) |

### `user_workouts` (Group F)

| Column | Type | Notes |
|---|---|---|
| id | String (uuid) | PK |
| user_id | String | FK → users (creator) |
| name | String | |
| is_public | Boolean | default false |
| cover_image | String? | inline data URI/URL |
| created_at / updated_at | DateTime | index (is_public, created_at) |

### `user_workout_exercises` (Group F)

| Column | Type | Notes |
|---|---|---|
| id | String (uuid) | PK |
| workout_id | String | FK → user_workouts |
| order | Int | unique per workout |
| exercise_id | String | FK → exercises |
| sets | Int | |
| reps | String | |
| rest_seconds | Int | |
| duration_seconds | Int? | |

---

## 4. Full API surface

All routes require a Bearer JWT via `requireAuth` **except** `/health`,
`/auth/register`, `/auth/login`. `req.userId` is set by the middleware.
Mounted in `app.ts`. Controller/service are same-domain unless noted.

| Method | Path | Purpose | Controller → Service | DB tables | Mobile caller(s) |
|---|---|---|---|---|---|
| GET | /health | Liveness + DB ping | inline in app.ts | (SELECT 1) | baseUrl smoke / RUNBOOK |
| POST | /auth/register | Create account, return JWT+user | auth → auth.service.register | users | AuthContext.register (Register screen) |
| POST | /auth/login | Login, return JWT+user | auth → auth.service.login | users | AuthContext.login (Login screen) |
| GET | /me | Current profile | profile → profile.service.getProfile | users | AuthContext restore (getMe) |
| PATCH | /me | Update profile (incl. avatar, publicBio) | profile → profile.service.updateProfile | users | ProfileScreen.save, PublicProfileSection.save |
| GET | /exercises | Library sync (optional `updatedSince` cursor) | exercises → exercises.service.listExercises | exercises | useExerciseLibrary → exercisesSync |
| POST | /plans | Generate template plan (deactivates prior) | plans → plans.service.createPlan | plans, plan_days, plan_exercises, exercises | usePlan.create (PlanBuilder) |
| POST | /plans/custom | Create fully-custom plan (Group D/E) | plans → plans.service.createCustomPlan | plans, plan_days, plan_exercises, exercises | CustomPlanBuilder.create |
| GET | /plans/active | Fetch active plan (nested) | plans → plans.service.getActivePlan | plans, plan_days, plan_exercises, exercises | usePlan.refresh |
| POST | /workouts/sync | Idempotent batch upsert of sessions | workouts → workouts.service.syncSessions | workout_sessions(+exercises,+sets), exercises | useWorkoutSync → workoutSync.pushWorkouts |
| GET | /workouts | List sessions (nested) | workouts → workouts.service.listSessions | workout_sessions(+…) | *(none — mobile reads sessions from SQLite)* |
| POST | /bodyweight/sync | Idempotent bodyweight upsert | bodyweight → bodyweight.service.syncEntries | bodyweight_entries | ProgressScreen (pushBodyweight) |
| GET | /bodyweight | List entries | bodyweight → bodyweight.service.listEntries | bodyweight_entries | *(none — read from SQLite)* |
| GET | /ai/ability | Infer ability level (persists) | ai → ai.service.inferAbility → aiJson | users, workout_sessions | *(none called yet — see §6)* |
| GET | /ai/next-session/:planDayId | Adjust next session from deltas + soreness | ai → ai.service.nextSessionAdjustment → aiJson | plan_days, plan_exercises, users, workout_sessions, recovery_checkins | ActiveWorkoutScreen (getNextSession) |
| POST | /nutrition/profile/sync | Upsert meal-profile items | nutrition → nutrition.service.syncProfile | meal_profile_items | NutritionScreen (pushMealProfile) |
| GET | /nutrition/profile | List meal profile | nutrition → nutrition.service.getProfile | meal_profile_items | *(none — read from SQLite)* |
| POST | /nutrition/meals/sync | Upsert meal logs (incl. macros) | nutrition → nutrition.service.syncMeals | meal_logs | NutritionScreen (pushMeals) |
| GET | /nutrition/meals | List meals | nutrition → nutrition.service.listMeals | meal_logs | *(none — read from SQLite)* |
| GET | /nutrition/suggestion | One goal-aligned swap suggestion | nutrition → nutrition.service.mealSuggestion → aiJson | meal_logs, meal_profile_items, users | NutritionScreen.refreshSuggestion |
| POST | /nutrition/estimate-macros | Estimate only unknown macros | nutrition → nutrition.service.estimateMacros → aiJson | *(none — pure AI call)* | NutritionScreen.addMeal |
| POST | /chat | Send message, get reply (rate-limited) | chat → chat.service.sendMessage → aiText | chat_messages, users, plans(+days,+ex), workout_sessions | ChatScreen.send |
| GET | /chat | Chat history | chat → chat.service.getHistory | chat_messages | ChatScreen.load (→ chatRepo cache) |
| POST | /recovery/sync | Upsert soreness/sleep check-ins | recovery → recovery.service.syncCheckins | recovery_checkins | ActiveWorkoutScreen (pushCheckins) |
| POST | /workout-library | Create user workout | userWorkouts → userWorkouts.service.createUserWorkout | user_workouts(+exercises), exercises | CreateWorkoutScreen.save |
| GET | /workout-library/mine | List own workouts | userWorkouts → listMine | user_workouts(+…) | CommunityScreen (tab=mine) |
| GET | /workout-library/public | List public workouts (+creator) | userWorkouts → listPublic | user_workouts(+…), users | CommunityScreen (tab=public), WorkoutDetailScreen |
| POST | /workout-library/suggest-image | AI cover image (always unavailable) | userWorkouts → suggestCoverImage | *(none)* | CreateWorkoutScreen.suggestImage |
| GET | /workout-library/:id | Fetch one public workout | userWorkouts → getPublicWorkout | user_workouts(+…), users | *(via /public list; detail refetches list)* |
| POST | /workout-library/:id/copy | Copy public workout → new active plan | userWorkouts → copyToPlans | user_workouts, plans, plan_days, plan_exercises | WorkoutDetailScreen.copy |

> Route ordering note: in `userWorkouts.routes.ts`, `/mine`, `/public`,
> `/suggest-image` are declared **before** `/:id`, so they are matched
> literally (not captured as `:id`). Correct as written.

---

## 5. File-by-file reference, grouped by domain

Fields per file: **Purpose** · **Key exports** · **Depends on** · **Depended
on by**. "Depended on by" is grep-verified. Test files are grouped compactly
at the end of each domain (each is a leaf: depended on by nothing).

### 5.0 Cross-cutting / shared

#### `backend/src/db.ts`
- **Purpose:** Single shared `PrismaClient`, constructed with the `PrismaPg`
  adapter over `DATABASE_URL`.
- **Key exports:** `prisma`.
- **Depends on:** `@prisma/adapter-pg`, `./generated/prisma/client`, env.
- **Depended on by:** every service (`auth`, `profile`, `exercises`, `plans`,
  `workouts`, `bodyweight`, `recovery`, `ai`, `nutrition`, `chat`,
  `userWorkouts`) and all `*.test.ts` (for cleanup).

#### `backend/src/lib/errors.ts`
- **Purpose:** Typed API errors and Zod-parse helper. `ApiError(status, code,
  message)` with static `badRequest/unauthorized/notFound/conflict`;
  `parseOrThrow(schema, data)` throws a 400 `VALIDATION_ERROR` listing bad
  fields.
- **Key exports:** `ApiError`, `parseOrThrow`.
- **Depends on:** `zod`.
- **Depended on by:** every controller; `middleware/auth.ts`,
  `middleware/error.ts`; services that throw (`auth`, `profile`, `plans`,
  `workouts`, `bodyweight`, `nutrition`, `recovery`, `chat`, `userWorkouts`,
  `ai`).

#### `backend/src/lib/aiJson.ts`
- **Purpose:** The AI gateway. `aiEnabled()` (flag+key), `aiJson()`
  (validate→retry-once-with-error-feedback→deterministic fallback; returns
  `{value, source}`), `aiText()` (free-text, returns `string|null`),
  `extractJson()` (tolerant JSON extraction), and `liveTransport` (Anthropic
  SDK call, model from `AI_MODEL` default `claude-opus-4-8`). Transport is
  injectable for tests.
- **Key exports:** `aiEnabled`, `aiJson`, `aiText`, `extractJson`,
  `AiTransport`, `AiJsonResult`.
- **Depends on:** `@anthropic-ai/sdk`, `zod`, env.
- **Depended on by:** `ai.service.ts`, `chat.service.ts`,
  `nutrition.service.ts`, `userWorkouts.service.ts`; `aiJson.test.ts`.

#### `backend/src/middleware/auth.ts`
- **Purpose:** `requireAuth` — reads `Authorization: Bearer`, verifies JWT
  with `JWT_SECRET`, sets `req.userId`; throws `NO_TOKEN`/`BAD_TOKEN`.
  Augments Express `Request` with `userId?`.
- **Key exports:** `requireAuth`.
- **Depends on:** `jsonwebtoken`, `../lib/errors`.
- **Depended on by:** all 11 route files (via `router.use(requireAuth)` or
  per-route), except the public auth endpoints.

#### `backend/src/middleware/error.ts`
- **Purpose:** Express error handler → `{error:{code,message}}`. Maps
  `ApiError`, bad JSON (`BAD_JSON`), else 500 `INTERNAL`.
- **Key exports:** `errorHandler`.
- **Depends on:** `../lib/errors`.
- **Depended on by:** `app.ts`.

#### `backend/src/app.ts` / `backend/src/index.ts`
- **Purpose:** `app.ts` builds the Express app (cors, `express.json({limit:
  "2mb"})`, `/health`, mounts all routers, error handler). `index.ts` is the
  runtime entrypoint (`dotenv` + listen).
- **Key exports:** `createApp` (app.ts); none (index.ts).
- **Depends on:** all 11 `*.routes.ts`, `middleware/error`, `db` (health).
- **Depended on by:** `index.ts` and every `*.test.ts` (via `createApp()` +
  supertest).

#### `backend/src/generated/prisma/**` (16 files)
- **Purpose:** GENERATED Prisma client + per-model type files (`client.ts`,
  `models.ts`, `enums.ts`, `internal/*`, `models/<Entity>.ts`). Regenerated by
  `prisma generate`; gitignored.
- **Key exports:** `PrismaClient`, model/enum types.
- **Depends on:** `@prisma/client/runtime`.
- **Depended on by:** `db.ts` and services importing model types (e.g.
  `profile.service`, `plans.service`, `ai.service` import `Exercise`/`User`).
- **⚠ Do not hand-edit** — changes are overwritten on next generate.

#### `mobile/theme.ts`
- **Purpose:** Design-token source for the app: `palette` (dark+light),
  `typography`, `radius`, `spacing`, `glow()` shadow helper, `theme(mode)`,
  and a stub `useTheme`. Generated from `design/DESIGN_NOTES.md`.
- **Key exports:** `palette`, `typography`, `radius`, `spacing`, `glow`,
  `theme`, `Mode`, `useTheme`.
- **Depends on:** nothing.
- **Depended on by:** `theme/ThemeContext.tsx` (only direct importer; all
  components consume tokens via `useAppTheme`).

#### `mobile/src/theme/ThemeContext.tsx`
- **Purpose:** `ThemeProvider` computes the active mode (system + persisted
  override in AsyncStorage) and exposes the resolved token object via
  `useAppTheme()`.
- **Key exports:** `ThemeProvider`, `useAppTheme`.
- **Depends on:** `../../theme` (theme.ts), `@react-native-async-storage/...`,
  `react-native useColorScheme`.
- **Depended on by:** ~22 files — every screen/component that calls
  `useAppTheme` (all `ui/*`, all feature screens, charts). `App.tsx` renders
  the provider.

#### `mobile/src/ui/index.tsx`
- **Purpose:** Shared themed primitives. `Screen` (SafeArea bg), `KeyboardForm`
  (KeyboardAvoidingView+ScrollView — keeps focused field above keyboard),
  `Title/Heading/Body`, `AccentRule` (neon underline), `Button`, `TextField`
  (with `secureToggle` eye icon — Group A), `ErrorBanner`, `LoadingView`,
  `EmptyView`, `ChipRow` (single/multi-select).
- **Key exports:** the components above.
- **Depends on:** `@expo/vector-icons`, `react-native`, `../theme/ThemeContext`.
- **Depended on by:** essentially every feature screen and section component.

#### `mobile/src/ui/charts.tsx`
- **Purpose:** SVG chart primitives (single-series, theme-token colors, green
  = progress). `LineChart` (min/max grid, last-point marker+label), `BarRow`
  (horizontal magnitude), `StatTile` (hero number).
- **Key exports:** `LinePoint`, `LineChart`, `BarRow`, `StatTile`.
- **Depends on:** `react-native-svg`, `../theme/ThemeContext`.
- **Depended on by:** `ProgressScreen.tsx`.

#### `mobile/src/api/baseUrl.ts`
- **Purpose:** Resolve backend URL at runtime: `EXPO_PUBLIC_API_URL` if set →
  else Metro host (`expo-constants` hostUri) `:4000` → else Android emulator
  loopback `10.0.2.2:4000`.
- **Key exports:** `BASE_URL`.
- **Depends on:** `expo-constants`, `react-native Platform`.
- **Depended on by:** `api/client.ts`.

#### `mobile/src/api/client.ts`
- **Purpose:** The typed API client. `request<T>()` (fetch wrapper: JSON,
  bearer, maps non-2xx→`ApiError`, network fail→`NetworkError`) plus the `api`
  object with a method per backend endpoint.
- **Key exports:** `api`, `ApiError`, `NetworkError`, `BASE_URL` (re-export).
- **Depends on:** `./baseUrl`, `./types`, and data types (`planRepo`,
  `nutritionRepo`, `communityTypes`, `workoutTypes`, `data/types`).
- **Depended on by:** 17 files — AuthContext, Login/Register, ChatScreen, all
  community screens, useExerciseLibrary, NutritionScreen, both plan builders,
  usePlan, ProfileScreen, PublicProfileSection, ProgressScreen,
  ActiveWorkoutScreen, useWorkoutSync.

#### `mobile/src/api/types.ts`
- **Purpose:** Core auth/profile types shared by client and features. `User`
  (incl. `avatar?`, `publicBio?`), `AuthResponse`, `ProfileUpdate`,
  `Goal/TrainingContext/Units`.
- **Key exports:** those types.
- **Depends on:** nothing.
- **Depended on by:** `api/client.ts`, `AuthContext`, ProfileScreen,
  PublicProfileSection, PlanBuilder, and any screen using `Goal`/context enums.

#### `mobile/App.tsx` / `mobile/index.ts`
- **Purpose:** `App.tsx` loads Saira/Saira Condensed fonts then renders
  `SafeAreaProvider > ThemeProvider > AuthProvider > RootNav` (StatusBar style
  by theme). `index.ts` registers the root component.
- **Key exports:** default `App`.
- **Depends on:** font packages, `expo-font`, providers, `RootNav`.
- **Depended on by:** `index.ts` (Expo entry).

#### `mobile/src/navigation/RootNav.tsx`
- **Purpose:** Auth gate (loading → login/register when logged out) and the
  main **7-tab** bottom navigator: Home, Library, Community, Progress,
  Nutrition, Coach, Profile. Applies theme colors to the nav container.
- **Key exports:** `RootNav`, `MainTabParamList`.
- **Depends on:** all tab roots (HomeStack, LibraryStack, CommunityStack,
  Progress/Nutrition/Chat/Profile screens), Login/Register, AuthContext,
  `@react-navigation/*`, theme, ui.
- **Depended on by:** `App.tsx`.

### 5.1 Auth

Backend `auth.service.ts` (register/login, bcrypt(12), 30-day JWT,
`toPublicUser` from profile.service) · `auth.controller.ts` ·
`auth.routes.ts` (`/register`, `/login`) · `auth.schemas.ts` (register/login
Zod). Each: depends on the layer above/below by the standard route→controller
→service chain; controllers depend on `parseOrThrow`; `auth.service` depends
on `db`, `bcryptjs`, `jsonwebtoken`, `profile.service.toPublicUser`. Depended
on by: `app.ts` (route), `auth.test.ts`.

#### `mobile/src/features/auth/AuthContext.tsx`
- **Purpose:** Auth provider. Restores the persisted session on cold start
  (offline-first: trusts stored session, background `getMe` refresh, only a
  401 logs out), exposes `login/register/logout/updateProfile`, `session`,
  `restoring`. `useUser()` returns the logged-in user or throws.
- **Key exports:** `AuthProvider`, `useAuth`, `useUser`.
- **Depends on:** `api/client`, `./authStorage`, `api/types`.
- **Depended on by:** `App.tsx`, `RootNav`, and every screen calling `useUser`
  / `useAuth` (Home, Progress, Nutrition, Chat, Profile, PublicProfileSection,
  both plan builders, ActiveWorkout, community screens, useWorkoutSync).

#### `mobile/src/features/auth/authStorage.ts`
- **Purpose:** Session persistence in `expo-secure-store` (Android Keystore):
  `saveSession/loadSession/clearSession`.
- **Key exports:** those + `Session`.
- **Depends on:** `expo-secure-store`, `api/types`.
- **Depended on by:** `AuthContext.tsx`.

#### `mobile/src/features/auth/validate.ts`
- **Purpose:** Client-side field validation mirroring backend Zod:
  `validateEmail/validatePassword/validateDisplayName/validatePasswordMatch`
  (Group A).
- **Key exports:** the four validators.
- **Depends on:** nothing.
- **Depended on by:** `LoginScreen`, `RegisterScreen`, `validate.test.ts`.

#### `mobile/src/features/auth/LoginScreen.tsx` / `RegisterScreen.tsx`
- **Purpose:** Auth forms. Both use `KeyboardForm`, `TextField secureToggle`
  (eye icon). Register adds confirm-password with live match validation that
  blocks submit before any network call (Group A).
- **Key exports:** `LoginScreen`, `RegisterScreen`.
- **Depends on:** `api/client` (error types), `AuthContext`, `./validate`,
  `ui`, theme.
- **Depended on by:** `RootNav` (logged-out branch).

**Tests:** `auth.test.ts` (backend register/login/profile), `validate.test.ts`
(match validator).

### 5.2 Exercises & library

Backend `exercises.service.ts` (`listExercises(updatedSince?)` → returns
`serverTime` + rows for the sync cursor) · `exercises.controller.ts` ·
`exercises.routes.ts` (`GET /exercises`) · `exercises.schemas.ts`
(`updatedSince` iso). `seed.ts` + `seed-data.json` populate the table.

#### `mobile/src/data/exercisesRepo.ts`
- **Purpose:** Device-side exercise store + queries. `upsertExercises`
  (INSERT OR REPLACE on slug), `searchExercises(filter)` (query/category/
  equipment/homeOnly), `getExercise`, `countExercises`, `findSubstitutes`
  (same-muscle, context-appropriate, curated-alternative-first — Group 9),
  and the `meta` kv helpers `getMeta/setMeta`.
- **Key exports:** those + `ExerciseFilter`.
- **Depends on:** `./types` (DbLike, Exercise, HOME_EQUIPMENT).
- **Depended on by:** ProgressScreen, CustomPlanBuilder, useExerciseLibrary,
  ExercisePickerModal, ExerciseDetailScreen, ActiveWorkoutScreen,
  `exercisesSync.ts`, `planRepo.ts` (meta kv), and exercise sync tests.

#### `mobile/src/data/exercisesSync.ts`
- **Purpose:** Pull-sync the library. `syncExercises(db, fetchPage)` reads the
  stored cursor, fetches, upserts, stores `serverTime` as the next cursor
  (idempotent by slug). Server-owned data, one-directional.
- **Key exports:** `syncExercises`, `ExercisePage`, `ExerciseFetcher`.
- **Depends on:** `./exercisesRepo` (upsert + meta), `./types`.
- **Depended on by:** `useExerciseLibrary.ts`, `exercisesSync.test.ts`.

#### `mobile/src/features/library/useExerciseLibrary.ts`
- **Purpose:** Hook backing the Library screen: serves from SQLite, syncs from
  the server when empty / on refresh, prefetches demo images to the disk
  cache. Offline with local data present is still "ready".
- **Key exports:** `useExerciseLibrary`.
- **Depends on:** `expo-image` (prefetch), `api/client`, `data/db`,
  `exercisesRepo`, `exercisesSync`, `AuthContext`.
- **Depended on by:** `LibraryScreen.tsx`.

#### `mobile/src/features/library/LibraryScreen.tsx` / `ExerciseDetailScreen.tsx` / `LibraryStack.tsx`
- **Purpose:** Browse/search/filter the library (list + category/equipment
  chips + 3 states); detail with demo image, home alternative, instructions;
  a native stack wrapping the two.
- **Key exports:** the components + `LibraryStackParamList`.
- **Depends on:** `useExerciseLibrary`/`exercisesRepo`, `data/db`, `expo-image`,
  ui, theme, navigation.
- **Depended on by:** `LibraryStack` → `RootNav` (Library tab).

**Tests:** `exercises.test.ts` (backend), `exercisesSync.test.ts` (sync-twice
no-dupes, offline search).

### 5.3 Plans

Backend `plans.service.ts` — `createPlan` (template generation via
`planTemplates` + muscle-balance guard, deactivates prior active plan),
`createCustomPlan` (Group D/E: named days, hand-picked exercises, timer
settings, `isDaily`; validates exercise ids), `getActivePlan`. ·
`plans.controller.ts` (`create`, `createCustom`, `getActive`) ·
`plans.routes.ts` (`POST /`, `POST /custom`, `GET /active`) · `plans.schemas.ts`
(`createPlanSchema`, `createCustomPlanSchema`). `plans.service` depends on
`db`, `errors`, generated `Exercise`, `planTemplates`.

#### `backend/src/services/planTemplates.ts`
- **Purpose:** Static split templates per category (PPL, upper/lower, full
  body, SBD days, WODs, steady/intervals), muscle-slot definitions, and
  `resolveDayTemplates` (maps a category sequence to concrete day templates);
  `MAJOR_GROUPS` for the balance guard.
- **Key exports:** `Category`, `Slot`, `DayTemplate`, `resolveDayTemplates`,
  `MAJOR_GROUPS`.
- **Depends on:** nothing.
- **Depended on by:** `plans.service.ts`.

#### `mobile/src/data/planRepo.ts`
- **Purpose:** Active-plan cache + types + a pure duration estimator. The
  active plan is stored as a JSON blob in the `meta` kv (server-owned,
  device-read-only). `saveActivePlan/getActivePlanLocal`, `estimateDayMinutes`
  (work+rest across sets; time-based uses duration).
- **Key exports:** `Plan`, `PlanDay`, `PlanExercise`, `saveActivePlan`,
  `getActivePlanLocal`, `estimateDayMinutes`.
- **Depends on:** `./exercisesRepo` (meta kv), `./types`.
- **Depended on by:** HomeScreen, HomeStack (types), usePlan,
  CustomPlanBuilder, WorkoutDetailScreen, computeDelta (PlanDay type),
  `api/client` (Plan type), `planRepo.test.ts`.

#### `mobile/src/features/plan/usePlan.ts`
- **Purpose:** Offline-first active-plan hook: serve local cache immediately,
  background-refresh from `/plans/active`; `create()` calls `POST /plans`
  (template) and caches the result.
- **Key exports:** `usePlan`.
- **Depends on:** `api/client`, `data/db`, `planRepo`, `data/types`,
  `AuthContext`.
- **Depended on by:** `HomeScreen`, `PlanBuilderScreen`. *(Note: each caller
  gets an independent hook instance — see §6 "New Plan" bug.)*

#### `mobile/src/features/plan/PlanBuilderScreen.tsx`
- **Purpose:** Template plan builder: entry-point card linking to the custom
  builder, then style / days-per-week / context / custom per-day category mix
  → `usePlan.create` → `popToTop`.
- **Key exports:** `PlanBuilderScreen`.
- **Depends on:** `api/client`, `api/types`, `data/types`, `usePlan`, ui,
  theme, navigation (`HomeStackParamList`).
- **Depended on by:** `HomeStack`.

#### `mobile/src/features/plan/CustomPlanBuilderScreen.tsx`
- **Purpose:** Deep custom builder (Group D/E): plan name, timer settings
  (default rest / work interval / auto-advance), add/remove named days with
  per-day category and a **"Do every day"** toggle (isDaily), per-day exercise
  picking (inline search modal over the library) with per-exercise
  sets/reps/rest/hold, live estimated duration → `POST /plans/custom` →
  `saveActivePlan` → `popToTop`.
- **Key exports:** `CustomPlanBuilderScreen`.
- **Depends on:** `api/client`, `data/db`, `exercisesRepo` (search),
  `planRepo` (estimate+save), `data/types`, ui, theme, navigation, `AuthContext`.
- **Depended on by:** `HomeStack`.

**Tests:** `plans.test.ts` (template gen + balance), `customPlan.test.ts`
(named days + reload), `dailyRoutine.test.ts` (isDaily + independent
sessions), `planRepo.test.ts` (estimateDayMinutes).

### 5.4 Home

#### `mobile/src/features/home/HomeScreen.tsx`
- **Purpose:** Landing screen. Shows the active plan split into an always-on
  **"Every day"** section (isDaily days) and the **"Weekly split"** (Group E),
  each `DayCard` expandable with a "Start workout" that opens ActiveWorkout;
  empty state → "Build my plan"; a "New plan" button → PlanBuilder. On mount:
  drains the offline workout sync (`useWorkoutSync`) and re-arms the meal
  reminder from today's local meals (Group H).
- **Key exports:** `HomeScreen`.
- **Depends on:** `data/db`, `nutritionRepo` (today's meals),
  `planRepo`(types), `settings/reminders` (refreshMealReminder), `usePlan`,
  `useWorkoutSync`, `useUser`, ui, theme, navigation.
- **Depended on by:** `HomeStack`.

#### `mobile/src/features/home/HomeStack.tsx`
- **Purpose:** Native stack for the Home tab: HomeMain, PlanBuilder,
  CustomPlanBuilder, ActiveWorkout, WorkoutSummary. Defines
  `HomeStackParamList` (the `ActiveWorkout` param carries a full `PlanDay`).
- **Key exports:** `HomeStack`, `HomeStackParamList`.
- **Depends on:** all Home-stack screens, `planRepo` (PlanDay type),
  `@react-navigation/native-stack`.
- **Depended on by:** `RootNav`; `HomeStackParamList` imported by
  PlanBuilder, CustomPlanBuilder, ActiveWorkout, WorkoutSummary, HomeScreen.

### 5.5 Active workout & sync

Backend `workouts.service.ts` — `syncSessions` (validates exercise ids, then
per session: owner-guard, upsert session, delete+recreate nested exercises/
sets inside a transaction — idempotent on client UUID), `listSessions`. ·
`workouts.controller.ts` · `workouts.routes.ts` (`POST /sync`, `GET /`) ·
`workouts.schemas.ts` (`workoutSessionSchema` incl. `SessionDelta`, `plannedWeightKg`).

#### `mobile/src/data/workoutTypes.ts`
- **Purpose:** Shared shapes for a logged session: `WorkoutSet` (incl.
  `plannedWeightKg`), `SessionExercise`, `SessionDelta` (counts, skipped,
  swapped w/ reason, cutShort — the AI seam), `WorkoutSessionPayload`.
- **Key exports:** those types + `SwapReason`.
- **Depends on:** `api/types` (TrainingContext), `data/types` (ExerciseCategory).
- **Depended on by:** exportData, computeProgress, ProgressScreen,
  ActiveWorkout, computeDelta, WorkoutSummary, `api/client`, workoutSync,
  workoutRepo, and workout tests.

#### `mobile/src/data/workoutRepo.ts`
- **Purpose:** Local workout-session queue in SQLite. `saveSessionLocal`
  (INSERT OR REPLACE, preserves `synced`), `getUnsyncedSessions`,
  `markSessionsSynced`, `listSessionsLocal`, `countSessions`.
- **Key exports:** those.
- **Depends on:** `./types`, `./workoutTypes`.
- **Depended on by:** ProgressScreen, ProfileScreen (export), WorkoutSummary,
  ActiveWorkout, `workoutSync.ts`, workout tests.

#### `mobile/src/data/workoutSync.ts`
- **Purpose:** `pushWorkouts(db, post)` — the idempotent push. Sends all
  unsynced sessions, marks acked ones synced. **Conflict hardening:** a
  permanent 4xx (not 429) quarantines the batch (`synced = 2`) so one bad row
  can't block the queue forever; transient errors (network/5xx/429) rethrow
  and the batch stays pending. Returns `{pushed, quarantined}`.
- **Key exports:** `pushWorkouts`, `WorkoutPoster`.
- **Depends on:** `./types`, `./workoutTypes`, `./workoutRepo`.
- **Depended on by:** `useWorkoutSync.ts`, `workoutSync.test.ts`, `phase9.test.ts`.

#### `mobile/src/features/workout/useWorkoutSync.ts`
- **Purpose:** Opportunistic push hook: on mount (app entry) and on demand
  (`push()` after finishing a workout). Failures are silent (offline normal).
- **Key exports:** `useWorkoutSync`.
- **Depends on:** `api/client`, `data/db`, `workoutSync`, `AuthContext`.
- **Depended on by:** `HomeScreen`, `ActiveWorkoutScreen`.

#### `mobile/src/features/workout/computeDelta.ts`
- **Purpose:** Pure planned-vs-actual computation (`computeDelta`) producing
  the `SessionDelta`, plus unit conversion helpers `toKg/fromKg` and
  `KG_PER_LB`.
- **Key exports:** `computeDelta`, `toKg`, `fromKg`, `KG_PER_LB`.
- **Depends on:** `planRepo` (PlanDay), `workoutTypes`.
- **Depended on by:** `ActiveWorkoutScreen`, `ProgressScreen` (conversions),
  `workoutSync.test.ts`.

#### `mobile/src/features/workout/warmups.ts`
- **Purpose:** Static warm-up/cool-down checklists per category (Group 9).
- **Key exports:** `WARMUPS`, `COOLDOWNS`, `RoutineBlock`.
- **Depends on:** `data/types` (ExerciseCategory).
- **Depended on by:** `ActiveWorkoutScreen`.

#### `mobile/src/features/workout/ActiveWorkoutScreen.tsx`
- **Purpose:** The live session. Builds per-exercise drafts from the plan day,
  fetches the AI/deterministic next-session adjustment (prescribed loads,
  nudges) when online, runs session/rest timers, per-set rep/weight entry and
  tick-off (time-based exercises show their hold seconds), swap (substitution
  picker) and skip, a once-daily recovery check-in modal, warm-up/cool-down
  checklists; on finish computes the delta, saves locally, and pushes. Writes
  bodyweight? no — writes the session + optional check-in.
- **Key exports:** `ActiveWorkoutScreen`.
- **Depends on:** `api/client`, `data/db`, `exercisesRepo` (get+substitutes),
  `recoveryRepo`, `workoutRepo`, `workoutTypes`, `computeDelta`, `warmups`,
  `useWorkoutSync`, ui, theme, navigation, `useAuth/useUser`, `expo-crypto`.
- **Depended on by:** `HomeStack`.

#### `mobile/src/features/workout/WorkoutSummaryScreen.tsx`
- **Purpose:** Post-session summary: reads the saved session from SQLite,
  shows duration / sets / adherence stat tiles and the planned-vs-actual
  breakdown, plus sync status.
- **Key exports:** `WorkoutSummaryScreen`.
- **Depends on:** `data/db`, `workoutRepo`, `workoutTypes`, ui, theme, nav.
- **Depended on by:** `HomeStack`.

**Tests:** `workouts.test.ts` (backend replay/converge), `workoutSync.test.ts`
(queue + computeDelta), `phase9.test.ts` (quarantine + substitution engine).

### 5.6 Progress & bodyweight

Backend `bodyweight.service.ts` (`syncEntries` idempotent upsert + owner
guard; `listEntries`; `weeklySoreness` lives in recovery.service, not here) ·
`bodyweight.controller.ts` · `bodyweight.routes.ts` (`POST /sync`, `GET /`) ·
`bodyweight.schemas.ts`.

#### `mobile/src/data/bodyweightRepo.ts`
- **Purpose:** Bodyweight queue: `saveBodyweightLocal`, `listBodyweightLocal`,
  `getUnsyncedBodyweight`, `markBodyweightSynced`, `pushBodyweight`.
- **Key exports:** those + `BodyweightEntry`, `BodyweightPoster`.
- **Depends on:** `./types`.
- **Depended on by:** exportData, ProgressScreen, ProfileScreen (export),
  `bodyweightSync.test.ts`.

#### `mobile/src/features/progress/computeProgress.ts`
- **Purpose:** Pure progress math over local sessions: `strengthCurve`,
  `loggedExerciseIds`, `weekStartOf` (Mon-anchored UTC), `weeklyMuscleVolume`,
  `adherence`, `streakWeeks`, and `dailyActivity` (Group H — one point per
  UTC calendar day). Everything renders offline.
- **Key exports:** those + `CurvePoint`, `DayPoint`, `AdherenceSummary`.
- **Depends on:** `data/workoutTypes`.
- **Depended on by:** `ProgressScreen.tsx`, `computeProgress.test.ts`.

#### `mobile/src/features/progress/ProgressScreen.tsx`
- **Purpose:** Progress tab. Loads sessions + bodyweight + exercise metadata
  from SQLite; renders adherence/streak/session stat tiles, per-exercise
  strength curve (picker), the **Activity timeline** line chart (Group H),
  weekly sets-per-muscle bars, and a bodyweight trend + logging (writes local,
  pushes via `pushBodyweight`). Empty states throughout.
- **Key exports:** `ProgressScreen`.
- **Depends on:** `api/client`, `data/db`, `bodyweightRepo`, `exercisesRepo`,
  `workoutRepo`, `workoutTypes`, `computeProgress`, `computeDelta`
  (conversions), ui + `ui/charts`, theme, `useAuth/useUser`, `expo-crypto`.
- **Depended on by:** `RootNav` (Progress tab).

**Tests:** `bodyweight.test.ts` (backend), `bodyweightSync.test.ts`,
`computeProgress.test.ts` (incl. dailyActivity 5-days-5-points).

### 5.7 Nutrition

Backend `nutrition.service.ts` — meal-profile + meal-log sync (owner-guarded
upserts, macros persisted), `mealSuggestion` (aiJson + deterministic
goal-templated fallback), `estimateMacros` (aiJson; fills **only** unknown
fields; AI-off → empty; server-side filter prevents overwriting user values),
`macroEstimateSchema`. · `nutrition.controller.ts` · `nutrition.routes.ts`
(profile/meals sync + get, suggestion, estimate-macros) ·
`nutrition.schemas.ts` (`mealLogSchema` w/ macros, `estimateMacrosSchema`,
`MACRO_FIELDS`).

#### `mobile/src/data/nutritionRepo.ts`
- **Purpose:** Meal-profile + meal-log SQLite queues with macros. `MealLog`
  (macros + `estimatedFields`), `MacroField`, `saveMealLocal` (re-save resets
  `synced` so enriched rows re-sync), `listMealsLocal(sinceIso)`,
  `saveProfileItemLocal`, `listProfileLocal`, `pushMealProfile`, `pushMeals`.
- **Key exports:** those + `MealType`, `MACRO_FIELDS`, `MealProfileItem`.
- **Depends on:** `./types`.
- **Depended on by:** exportData, HomeScreen (today's meals), ProfileScreen
  (export), `api/client`, NutritionScreen, `nutritionSync.test.ts`.

#### `mobile/src/features/nutrition/NutritionScreen.tsx`
- **Purpose:** Nutrition tab. Meal-profile onboarding, daily meal logging with
  per-macro number-or-"don't know" inputs; on save writes local (honest
  nulls) → sync → if online + unknowns, requests estimates and re-saves with
  `estimatedFields` (blue "est" display); shows the goal-aligned suggestion;
  re-arms the meal reminder on load/after-log (Group H).
- **Key exports:** `NutritionScreen`.
- **Depends on:** `api/client`, `data/db`, `nutritionRepo`,
  `settings/reminders` (refreshMealReminder), ui, theme, `useAuth`,
  `expo-crypto`.
- **Depended on by:** `RootNav` (Nutrition tab).

**Tests:** `nutrition.test.ts`, `nutritionMacros.test.ts` (shawarma done-when),
`nutritionSync.test.ts` (queue + macro round-trip + soft delete).

### 5.8 AI coach (chat) & AI adjustment

#### `backend/src/services/ai.service.ts`
- **Purpose:** Two AI capabilities. `inferAbility` (classify from logged
  sessions, persist `ability_level`; deterministic heuristic fallback);
  `nextSessionAdjustment` (adjust sets/reps/prescribed load + nudges from the
  planned-vs-actual history and **weekly soreness** → deload; sanitizes AI
  output to known plan exercises, else full deterministic fallback). Exposes
  `abilityFallback`, `adjustmentFallback`, schemas.
- **Key exports:** `inferAbility`, `nextSessionAdjustment`, `abilitySchema`,
  `adjustmentSchema`, fallbacks.
- **Depends on:** `db`, `errors`, `aiJson`, `recovery.service.weeklySoreness`.
- **Depended on by:** `ai.controller.ts`, `ai.test.ts`, `recovery.test.ts`
  (deload assertion via next-session).

Backend `ai.controller.ts` (`ability`, `nextSession`) · `ai.routes.ts`
(`GET /ability`, `GET /next-session/:planDayId`). No `ai.schemas.ts` (params
only).

#### `backend/src/services/chat.service.ts`
- **Purpose:** Context-aware coach chat. In-memory per-user rate limit (20/hr),
  `buildContext` (assembles ONLY the user's own profile/active plan w/
  equipment + home alternatives/recent session deltas), `sendMessage`
  (free-text via `aiText`; on AI-off/failure throws 503 `AI_UNAVAILABLE` and
  does NOT persist the unanswered turn; persists both turns on success),
  `getHistory`, `resetRateLimit` (test hook).
- **Key exports:** `sendMessage`, `getHistory`, `buildContext`, `resetRateLimit`.
- **Depends on:** `db`, `errors`, `aiJson.aiText`.
- **Depended on by:** `chat.controller.ts`, `chat.test.ts`.

Backend `chat.controller.ts` (`send`, `history`) · `chat.routes.ts`
(`POST /`, `GET /`) · `chat.schemas.ts` (`sendChatSchema`).

#### `mobile/src/data/chatRepo.ts`
- **Purpose:** Local cache of server chat history for offline reading:
  `cacheChatMessages`, `listChatLocal`.
- **Key exports:** those + `ChatMessage`.
- **Depends on:** `./types`.
- **Depended on by:** `ChatScreen.tsx`.

#### `mobile/src/features/chat/ChatScreen.tsx`
- **Purpose:** Coach tab (blue accent). Optimistic send with rollback, server
  history cached to SQLite for offline reading, distinct banner states for
  coach-unavailable / offline / rate-limited; glowing send button.
- **Key exports:** `ChatScreen`.
- **Depends on:** `api/client`, `data/db`, `chatRepo`, ui, theme, `useAuth`,
  `expo-crypto`.
- **Depended on by:** `RootNav` (Coach tab).

**Tests:** `ai.test.ts` (ability + next-session + malformed fallback),
`chat.test.ts` (context, unavailable degradation, rate limit).

### 5.9 Recovery

Backend `recovery.service.ts` — `syncCheckins` (owner-guarded upsert),
`weeklySoreness` (trailing-7-day average, consumed by `ai.service`). ·
`recovery.controller.ts` · `recovery.routes.ts` (`POST /sync`) ·
`recovery.schemas.ts`.

#### `mobile/src/data/recoveryRepo.ts`
- **Purpose:** Check-in queue: `saveCheckinLocal`, `pushCheckins`,
  `hasCheckinToday` (gate the once-daily prompt).
- **Key exports:** those + `RecoveryCheckin`.
- **Depends on:** `./types`.
- **Depended on by:** `ActiveWorkoutScreen`.

**Tests:** `recovery.test.ts` (sync + soreness→deload via next-session).

### 5.10 Community (user workouts)

Backend `userWorkouts.service.ts` (Group F/G) — `createUserWorkout`
(validate exercise ids), `listMine`, `listPublic` (includes creator
`{id, displayName, avatar, publicBio}` — the Group G surfacing point),
`getPublicWorkout`, `copyToPlans` (clones a public workout into a new active
custom plan — copy, not reference), `suggestCoverImage` (AI-gated, **always
returns unavailable** — no first-party image gen). · `userWorkouts.controller.ts`
· `userWorkouts.routes.ts` · `userWorkouts.schemas.ts`
(`createUserWorkoutSchema` w/ inline cover cap ~900KB, `suggestImageSchema`).

#### `mobile/src/data/communityTypes.ts`
- **Purpose:** Community DTOs: `UserWorkout`, `UserWorkoutExercise`,
  `WorkoutCreator` (incl. `avatar?`, `publicBio?`), `CreateWorkoutInput`.
- **Key exports:** those.
- **Depends on:** `./types` (Exercise).
- **Depended on by:** CommunityScreen, WorkoutDetailScreen, `api/client`.

#### `mobile/src/features/community/pickImage.ts`
- **Purpose:** Shared device image picker → compact JPEG data URI with a size
  cap; typed `PickResult` (ok / canceled / denied / too_large). Used for
  workout covers (F) and avatars (G).
- **Key exports:** `pickImageAsDataUri`, `MAX_IMAGE_BYTES`, `PickResult`.
- **Depends on:** `expo-image-picker`.
- **Depended on by:** `CreateWorkoutScreen`, `PublicProfileSection`.

#### `mobile/src/features/community/ExercisePickerModal.tsx`
- **Purpose:** Reusable full-screen exercise picker over the offline library
  search (used by CreateWorkout; CustomPlanBuilder has its own inline copy).
- **Key exports:** `ExercisePickerModal`.
- **Depends on:** `data/db`, `exercisesRepo`, `data/types`, ui, theme.
- **Depended on by:** `CreateWorkoutScreen.tsx`.

#### `mobile/src/features/community/CommunityScreen.tsx` / `CreateWorkoutScreen.tsx` / `WorkoutDetailScreen.tsx` / `CommunityStack.tsx`
- **Purpose:** Community tab. `CommunityScreen` toggles Discover/My-workouts,
  lists cards (cover + creator + count), links to create/detail; reloads on
  focus. `CreateWorkoutScreen` — name, exercise picker, per-exercise
  sets/reps/rest, optional cover (device pick or AI-suggest→unavailable),
  public toggle, save (never blocked on image). `WorkoutDetailScreen` — view a
  public workout (creator avatar+bio) + "Add to my plans" (copy → saveActivePlan).
  `CommunityStack` wraps the three.
- **Key exports:** the components + `CommunityStackParamList`.
- **Depends on:** `api/client`, `communityTypes`, `data/db`, `planRepo`
  (save), `pickImage`, `ExercisePickerModal`, `expo-image`, ui, theme,
  `useAuth/useUser`, navigation.
- **Depended on by:** `CommunityStack` → `RootNav` (Community tab).

**Tests:** `userWorkouts.test.ts` (create→find→copy, privacy), `profileG.test.ts`
(avatar/bio surfaced only via public workout).

### 5.11 Profile

Backend `profile.service.ts` (`toPublicUser` — now includes avatar/publicBio;
`getProfile`, `updateProfile`) · `profile.controller.ts` (`getMe`, `updateMe`)
· `profile.routes.ts` (`GET /`, `PATCH /` under `requireAuth`) ·
`profile.schemas.ts` (`updateProfileSchema` incl. avatar/publicBio). Note
`toPublicUser` is also imported by `auth.service`.

#### `mobile/src/features/profile/ProfileScreen.tsx`
- **Purpose:** Profile tab (wrapped in `KeyboardForm`). Edit goal/days/context/
  units (own save), the `PublicProfileSection`, the `RemindersSection`, data
  export (JSON/CSV via `exportData` + `expo-file-system` + `expo-sharing`),
  and logout.
- **Key exports:** `ProfileScreen`.
- **Depends on:** `expo-file-system`, `expo-sharing`, `api/client` (error
  types), `api/types`, `bodyweightRepo`, `data/db`, `nutritionRepo`,
  `workoutRepo`, `exportData`, `RemindersSection`, `PublicProfileSection`, ui,
  theme, `useAuth/useUser`.
- **Depended on by:** `RootNav` (Profile tab).

#### `mobile/src/features/profile/PublicProfileSection.tsx`
- **Purpose:** Avatar + public bio editor (Group G, own save via
  `updateProfile`); avatar via `pickImageAsDataUri`.
- **Key exports:** `PublicProfileSection`.
- **Depends on:** `expo-image`, `api/client` (error types), `useAuth/useUser`,
  `community/pickImage`, ui, theme.
- **Depended on by:** `ProfileScreen.tsx`.

### 5.12 Reminders & export (settings)

#### `mobile/src/features/settings/reminderModel.ts`
- **Purpose:** Pure, RN-free reminder model (so it is unit-testable in node):
  `TimeOfDay`, `ReminderSettings`, `DEFAULT_REMINDERS`, `formatTime`,
  `mergeReminderSettings`, `nextMealReminderAt` (Group H skip logic), and
  constants (`STORAGE_KEY`, `MEAL_REMINDER_ID`, `WEEKDAY_LABELS`).
- **Key exports:** those.
- **Depends on:** nothing.
- **Depended on by:** `reminders.ts`, `reminders.test.ts`.

#### `mobile/src/features/settings/reminders.ts`
- **Purpose:** Notification scheduling (lazy-imports `expo-notifications` and
  no-ops in Expo Go). `applyReminders` (weekly training triggers + arms the
  meal reminder), `armMealReminder`/`refreshMealReminder` (single re-armable
  DATE occurrence that skips days already logged — Group H), `clearReminders`,
  `loadReminderSettings`. Re-exports the pure model.
- **Key exports:** `applyReminders`, `refreshMealReminder`, `clearReminders`,
  `loadReminderSettings`, `ReminderResult`, + re-exports.
- **Depends on:** `expo-constants`, `expo-notifications` (dynamic), `Platform`,
  `AsyncStorage`, `./reminderModel`.
- **Depended on by:** `RemindersSection` (apply/load), `HomeScreen`
  (refreshMealReminder), `NutritionScreen` (refreshMealReminder).

#### `mobile/src/features/settings/RemindersSection.tsx`
- **Purpose:** Profile reminders UI: per-reminder enable Switch + native time
  picker (`@react-native-community/datetimepicker`) for the training-day
  reminder (weekday chips + time) and meal reminder (time), Save →
  `applyReminders`.
- **Key exports:** `RemindersSection`.
- **Depends on:** `@react-native-community/datetimepicker`, `./reminders`, ui,
  theme.
- **Depended on by:** `ProfileScreen.tsx`. *(Contains the reminder-widget
  bug — see §6.)*

#### `mobile/src/features/settings/exportData.ts`
- **Purpose:** Pure export builders: `buildExportJson` (versioned JSON of
  sessions/bodyweight/meals) and `buildSetsCsv` (one row per set, CSV-escaped).
- **Key exports:** those + `ExportBundle`.
- **Depends on:** `bodyweightRepo`, `nutritionRepo`, `workoutTypes` (types only).
- **Depended on by:** `ProfileScreen.tsx`, `exportData.test.ts`.

### 5.13 Shared data-layer core

#### `mobile/src/data/db.ts`
- **Purpose:** `getDb()` — opens `profit.db` once, sets WAL, runs migrations,
  returns a memoized `DbLike`.
- **Key exports:** `getDb`.
- **Depends on:** `expo-sqlite`, `./schema`, `./types`.
- **Depended on by:** 14 files — every screen/hook that reads/writes SQLite
  (see grep list under §5 headers).

#### `mobile/src/data/schema.ts`
- **Purpose:** Versioned migration array (v1 exercises+meta, v2 workout
  sessions, v3 bodyweight, v4 nutrition, v5 chat cache, v6 recovery, v7 meal
  macros) + `migrate(db)` driven by `PRAGMA user_version`.
- **Key exports:** `migrate`.
- **Depends on:** `./types` (DbLike).
- **Depended on by:** `db.ts`, and every `__tests__` file (via `migrate` on a
  test db).

#### `mobile/src/data/types.ts`
- **Purpose:** `DbLike` (the minimal async SQL interface both expo-sqlite and
  `node:sqlite` satisfy), `SqlParam`, `Exercise`, `ExerciseCategory`,
  `HOME_EQUIPMENT`.
- **Key exports:** those.
- **Depends on:** nothing.
- **Depended on by:** every repo/sync module and their tests, planRepo,
  communityTypes, api/client (Exercise, ExerciseCategory).

#### `mobile/src/data/__tests__/testDb.ts`
- **Purpose:** `createTestDb()` — a `DbLike` backed by `node:sqlite` for
  running the data layer in vitest without native Expo modules.
- **Key exports:** `createTestDb`.
- **Depends on:** `node:sqlite`, `../types`.
- **Depended on by:** all `data/__tests__/*.test.ts`.

---

## 6. Known issues

Grouped: **(a) reported bugs** the team has observed, located precisely here;
**(b) logged decisions/limitations** carried from DECISIONS.md / PROJECT.md;
**(c) discrepancies** found while walking the code.

### (a) Reported bugs — located

- **"New Plan" doesn't refresh Home.** `HomeScreen` and `PlanBuilderScreen`
  each call `usePlan()` independently; they do **not** share state.
  `PlanBuilderScreen` builds via its own hook's `create()` and calls
  `nav.popToTop()`; `CustomPlanBuilderScreen` and `WorkoutDetailScreen` copy a
  workout by calling `saveActivePlan(...)` + `popToTop()` directly. In all
  three cases the tab's already-mounted `HomeScreen` keeps its stale `plan`
  state — `usePlan`'s refresh runs only in a mount `useEffect` (deps
  `[refresh]`, which depends on `[session]`), and `HomeScreen` has **no**
  `useFocusEffect`. **Result:** after building/copying a plan you return to a
  Home that still shows the previous plan until the tab is remounted or the app
  reloaded. Where to look: `mobile/src/features/plan/usePlan.ts` (no shared
  store / no focus refresh), `mobile/src/features/home/HomeScreen.tsx` (no
  focus listener), and the three creators (`PlanBuilderScreen.tsx`,
  `CustomPlanBuilderScreen.tsx:create`, `WorkoutDetailScreen.tsx:copy`).

- **Reminder time-picker "doesn't close."** In
  `mobile/src/features/settings/RemindersSection.tsx`, `TimeField` (≈lines
  46–59) renders `@react-native-community/datetimepicker` conditionally on an
  `open` flag. On **iOS** it uses `display="spinner"`, which is an *inline*
  spinner (not a modal) with no confirm affordance, and `onChange` sets
  `open=false` on the first value change — so it can dismiss before the user
  finishes scrolling (a code-visible defect). On **Android** it uses
  `display="default"` (a modal dialog) and follows the standard dismiss
  pattern (`setOpen(false)` on every `onChange`, set/dismissed alike), which
  *should* close; the on-device "doesn't close" report on the S22 is not
  explained by the static code and needs a device repro (candidate causes: a
  version-specific picker issue, or re-mount from the surrounding
  `KeyboardForm`/`ScrollView` re-render). Where to look:
  `RemindersSection.tsx` `TimeField`.

### (b) Logged decisions / limitations (from DECISIONS.md, PROJECT.md)

- **7-tab bottom nav is crowded.** `RootNav` mounts Home/Library/Community/
  Progress/Nutrition/Coach/Profile. DECISIONS (Group F) flags this and
  suggests a future "More" grouping.
- **Images stored inline as data-URI text.** Workout covers
  (`user_workouts.cover_image`) and avatars (`users.avatar`) are base64 data
  URIs in Postgres; `express.json` limit raised to 2 MB; Zod caps ~900 KB;
  client picks at quality 0.4. MVP shortcut — move to object storage before
  scale (DECISIONS Groups F/G).
- **AI cover-image generation has no first-party source.** Anthropic's API is
  text/JSON only; `suggestCoverImage` always returns `{available:false}`.
  Real generation needs a third-party image vendor (new key/cost/disclosure) —
  DECISIONS Group F (owner decision).
- **No moderation/reporting on public workouts.** "Public" = visible to all
  authenticated users; no report/takedown. DECISIONS Group F.
- **Meal-reminder skip is best-effort.** A local repeating trigger can't
  cancel a single instance, so the "skip if already logged" relies on the app
  being opened / a meal logged that day to re-arm; a truly closed-app skip
  needs a background task or push. DECISIONS Group H.
- **Reminders / notifications need a dev or release build.** `expo-notifications`
  no-ops in Expo Go (lazy-loaded behind an environment gate); the time-picker
  UI works in Expo Go but scheduling/firing does not. DECISIONS Group C.
- **No self-service account deletion.** Google Play requires it for apps with
  accounts; there is no `DELETE /me` endpoint. Blocking item in
  `docs/DEPLOYMENT_CHECKLIST.md` and DATA_INVENTORY §4.
- **Backend hardening gaps for production.** `app.ts` uses wide-open `cors()`;
  `/auth/*` has no rate limiting; the dev `JWT_SECRET` is in local history.
  Listed in DEPLOYMENT_CHECKLIST §1.
- **Expo SDK pinned to 54.** Downgraded from 57 so the store Expo Go can run
  it; `app.json` plugins dropped `expo-image`/`expo-sharing` (their SDK 54
  builds have no config plugin). Revisit on the move to EAS builds.

### (c) Discrepancies found while walking the code

- **`GET /ai/ability` has no mobile caller.** `ai.service.inferAbility` /
  `GET /ai/ability` are implemented and tested, but no mobile screen calls
  `api` for ability (only `getNextSession` is wired, in ActiveWorkout). Ability
  level is therefore only ever populated if `/ai/ability` is hit directly.
  PROJECT.md §1.3 implies ability is surfaced/used; in the app it is computed
  server-side and read into the chat/adjustment context but never triggered
  from the UI.
- **`GET /workouts` and `GET /bodyweight` and `GET /nutrition/*` list
  endpoints are largely unused by the app.** The mobile app reads
  workouts/bodyweight/meals from **SQLite**, not these endpoints (they exist
  for completeness/tests). Only `/plans/active`, `/chat` (GET), and the
  community GETs are actually fetched for display. Not a bug — just note that
  server-side reads and device reads can diverge (a session logged on another
  device won't appear until a device-side aggregation exists, which it does
  not — see next).
- **No multi-device merge for synced logs.** Sync is push-only from device →
  server; the app never pulls others' or prior-device sessions/meals/
  bodyweight back into SQLite. Progress/exports reflect only what this device
  logged. Consistent with DECISIONS (Phase 5) but worth keeping in mind.
- **Two near-duplicate exercise pickers.** `community/ExercisePickerModal.tsx`
  (reusable) and an inline picker inside `CustomPlanBuilderScreen.tsx` do the
  same job; the custom builder predates the extracted component and was left
  as-is to avoid touching committed code. Candidate for consolidation.
- **`workout_sessions.plan_id` / `plan_day_id` are soft references, not FKs.**
  A session survives deletion of its plan/day (intentional — sessions are
  historical), but nothing enforces referential integrity there.
- **`ExerciseCategory` is duplicated** as a Prisma enum (backend) and a TS
  union (`mobile/src/data/types.ts`); they are kept in sync by hand.
- **Timeline chart date labels use local time on a UTC-bucketed day.**
  `dailyActivity` buckets by UTC (`startedAt.slice(0,10)`), but the chart's
  `shortDate` renders `new Date('YYYY-MM-DD').toLocaleDateString`, which can
  show the prior calendar day in timezones behind UTC. Cosmetic; point counts
  are correct.
