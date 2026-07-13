# ProFit — Data Inventory

**Source of truth for all privacy/store documents.** Built from a direct audit
of `backend/prisma/schema.prisma` (all models/migrations), every mounted route
in `backend/src/app.ts` (`/auth`, `/me`, `/exercises`, `/plans`, `/workouts`,
`/bodyweight`, `/ai`, `/nutrition`, `/chat`, `/recovery`), the Zod schemas in
`backend/src/routes/*.schemas.ts`, the mobile SQLite migrations
(`mobile/src/data/schema.ts`, v1–v6), and the device modules using
SecureStore, AsyncStorage, notifications, file export/sharing, and the
network. Last audited: 2026-07-12, commit `40bf313`.

**Sensitivity note:** workout logs, bodyweight, soreness/sleep check-ins, and
meal logs are **health-and-fitness data** and are treated as sensitive
throughout these documents.

## 1. Inventory

Legend — *Leaves device:* whether the data is transmitted off the phone.
*Shared with:* third parties other than the ProFit backend.

| # | Data | Where it lives | Why collected | Leaves device? | Shared with |
|---|------|----------------|---------------|----------------|-------------|
| 1 | **Email address** | Postgres `users.email`; cached in device SecureStore (inside the session object) | Account identifier, login | Yes (account creation/login) | Nobody |
| 2 | **Password** | Postgres `users.password_hash` — bcrypt, cost 12; plaintext never stored | Authentication | Yes (transmitted once per login/registration, then only the hash exists) | Nobody |
| 3 | **Display name** | Postgres `users.display_name`; SecureStore session cache | Personalization (greetings) | Yes | Nobody — **not included** in AI prompts |
| 4 | **Session token (JWT)** | Device SecureStore (Android Keystore); not stored server-side (stateless, 30-day expiry) | Keep the user logged in | Sent as a bearer header on every API call | Nobody |
| 5 | **Profile: goal (bulking/cutting/maintaining), training days/week, home/gym context, kg/lb units** | Postgres `users`; SecureStore session cache | Drives plan generation, adjustments, suggestions | Yes | **Anthropic** (goal, context, ability — only when AI enabled; see §3) |
| 6 | **Ability level (beginner/intermediate/advanced)** | Postgres `users.ability_level` | Derived by the app from logged sessions (never self-declared); tunes adjustments | Server-derived | **Anthropic** (when AI enabled) |
| 7 | **Workout sessions, exercises, sets** — timestamps, duration, exercise ids, planned/actual reps, planned/actual weights, completed/skipped flags | Device SQLite `workout_sessions` (written first, works offline); synced to Postgres `workout_sessions` / `workout_session_exercises` / `workout_sets` | Core product: logging, progress charts, adjustments. **Health & fitness data** | Yes (idempotent sync when online) | **Anthropic** (summaries of recent sessions — when AI enabled) |
| 8 | **Planned-vs-actual delta** (set counts, skipped/swapped exercises, cut-short flag) | Postgres `workout_sessions.delta` (JSONB); inside the device session payload | Input for AI/deterministic session adjustment. **Health & fitness data** | Yes | **Anthropic** (when AI enabled) |
| 9 | **Bodyweight entries** (kg + timestamp) | Device SQLite `bodyweight_entries`; synced to Postgres `bodyweight_entries` | Bodyweight trend chart. **Health data** | Yes | Nobody (not included in AI prompts) |
| 10 | **Recovery check-ins** — soreness 1–5, sleep quality 1–5, timestamp | Device SQLite `recovery_checkins`; synced to Postgres `recovery_checkins` | Deload logic (a plan that never backs off is a bug). **Health data** | Yes | **Anthropic** (weekly soreness average only — when AI enabled) |
| 11 | **Meal profile** ("usual foods": name + typical portion) | Device SQLite `meal_profile_items`; synced to Postgres `meal_profile_items` (soft delete) | Nutrition suggestions grounded in what the user already eats. **Health/nutrition data** | Yes | **Anthropic** (when AI enabled) |
| 12 | **Meal logs** (food name, portion, meal type, timestamp) | Device SQLite `meal_logs`; synced to Postgres `meal_logs` | Daily nutrition logging. **Health/nutrition data** | Yes | **Anthropic** (today's meals — when AI enabled) |
| 13 | **Training plans** (generated weekly plans, exercises, sets/reps) | Postgres `plans`/`plan_days`/`plan_exercises`; cached as JSON in device SQLite | The user's program; offline viewing | Generated server-side | **Anthropic** (the plan day being adjusted / plan summary in chat — when AI enabled) |
| 14 | **Chat messages** (free text from the user + AI replies) | Postgres `chat_messages`; cached in device SQLite `chat_messages` for offline reading | The AI coach feature. May contain anything the user chooses to type, including health details | Yes | **Anthropic** (the message + last 10 turns + context — chat only works when AI enabled) |
| 15 | **Theme preference, reminder settings** (weekdays/hour) | Device AsyncStorage only | UI preference; local notification schedule | **No** | Nobody |
| 16 | **Local notifications** | Scheduled on-device via expo-notifications | Training-day reminders | **No** (no push tokens; no remote push service) | Nobody |
| 17 | **Data exports** (JSON of sessions/bodyweight/meals; CSV of sets) | Written on demand to the app's cache directory; handed to the Android share sheet | User owns their logs | Only where the **user** sends them via the share sheet | Whoever the user shares the file with |
| 18 | **Exercise library** (names, muscle groups, equipment, instructions) | Postgres `exercises` → synced to device SQLite | App content — **not personal data** (public-domain dataset) | n/a | n/a |

## 2. Third-party connections

| Party | What | When | What they can see |
|---|---|---|---|
| **Anthropic (Claude API)** | AI features: ability inference, next-session adjustment, meal suggestion, coach chat | Only when the server flag `AI_ENABLED=true` **and** an API key is configured — **off by default**. All calls are proxied through the ProFit backend; the API key exists only server-side; the mobile app never talks to Anthropic. | Per feature (from `backend/src/services/*.service.ts` prompts): goal, ability, training context, plan-day/plan summaries with exercise names + equipment tags, recent session summaries (reps/weights/deltas), weekly soreness average, today's meals + usual foods, chat text. **Never sent:** email, display name, password/hash, tokens, bodyweight entries, raw user ids. |
| **GitHub (raw.githubusercontent.com)** | Exercise demo images (public-domain dataset) are fetched **directly by the device** and disk-cached | When browsing exercises with a demo image not yet cached | Standard web-request metadata: device IP address, user-agent. No ProFit account data. |
| *(none besides the above)* | No analytics SDK, no crash reporting, no ads, no advertising ID, no social SDKs, no location, no contacts, no camera/photos access. | | |

## 3. Transport & storage security

- All API traffic authenticates with a bearer JWT; passwords hashed with
  bcrypt(12); tokens stored in SecureStore (Android Keystore).
- **Encryption in transit: HTTPS is required for production** — the deployed
  backend must sit behind TLS (see `docs/DEPLOYMENT_CHECKLIST.md`). Dev runs
  on LAN HTTP only.
- Device data lives in the app-sandboxed SQLite database; removed by
  uninstalling the app or clearing app data.

## 4. Retention & deletion

- Server data is retained until the user requests deletion. **Gap:** there is
  currently **no self-service account-deletion endpoint** — deletion must be
  handled via the privacy contact until one is built. Google Play requires an
  account-deletion option for apps with account creation → tracked as a
  **blocking item** in `docs/DEPLOYMENT_CHECKLIST.md`. (The schema cascades:
  deleting a `users` row removes all their sessions, logs, meals, check-ins,
  plans, and chat.)
- In-app **export** exists today (Profile → "Your data"): full JSON + per-set
  CSV, generated on-device from local data.
- Quarantined sync rows (conflict hardening) remain on-device only.
