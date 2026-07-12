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
