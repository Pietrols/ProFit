# ProFit Audit — 2026-07-18

Code, UX, security, and competitive audit. Each finding carries a fix; the
Status column tracks resolution (this file is updated as fixes land).

## What works well (keep)

- Consistent routes → controllers → services layering; colocated Zod at every
  entry point; uniform `{error:{code,message}}` contract.
- Offline-first sync: client UUIDs + idempotent upserts; every sync service
  enforces row ownership (`*_OWNER_MISMATCH`) — no IDOR found.
- `aiJson()` gateway treats AI output as untrusted input (schema → retry →
  deterministic fallback); the plan builder cannot emit invented exercises.
- Tokens in Android Keystore (expo-secure-store); bcrypt cost 12 with 72-char
  cap; stack traces never reach clients; `.env` ignored and never committed.
- Loading/empty/error states on every screen; theme tokens used throughout.
- Test discipline: each phase's done-when encoded as a test (81 backend,
  51 mobile at audit time).

## Security findings

| # | Severity | Finding | Fix | Status |
|---|----------|---------|-----|--------|
| S1 | Critical | No rate limiting/lockout on `/auth/login`+`/auth/register` — open to brute force & mass registration | Per-IP + per-email sliding-window throttle on auth endpoints | FIXED |
| S2 | Critical | 30-day stateless JWT, no revocation; logout only deletes local copy; `JWT_SECRET` unvalidated (`change-me` shipping risk) | `tokenVersion` on User checked in `requireAuth`; bump on password change; boot refuses default/missing secret in production | FIXED |
| S3 | Critical | No password reset or email verification — anyone can register someone else's email; forgotten password = permanent lockout | Tokened verify/reset flows via pluggable mailer (console transport in dev, SMTP-ready) | FIXED |
| S4 | Critical | TLS not enforced; all client fallbacks are `http://` | Client refuses plain http outside `__DEV__`; server sets HSTS/security headers (helmet) for proxy deployment | FIXED |
| S5 | Critical | No account deletion (GDPR right-to-erasure; app-store review item) | `DELETE /me` (password-confirmed, cascades) + mobile flow with local data wipe | FIXED |
| S6 | High | Community content unmoderated: free-text names + user-supplied data-URI images shown to all users; no report/block; no image validation | Validate data-URI is a real image (magic bytes); report endpoint; auto-hide at report threshold | FIXED |
| S7 | High | CORS wide open (`cors()` no options) | Env-driven origin allowlist (mobile clients unaffected; closes the future-web hole) | FIXED |
| S8 | High | No request/audit logging; `console.error` may leak PII; chat limiter is in-memory (resets on deploy, breaks multi-instance) | Structured logger (pino) with redaction; auth events logged; limiter kept in-memory but isolated behind one module with a documented Redis upgrade path | FIXED |
| S9 | Medium | `bcryptjs` (pure JS) blocks the event loop at cost 12 under login load | Swap to native `bcrypt` (same API) | FIXED |
| S10 | Medium | Chat prompt injection: free user text into prompt. Blast radius small (own data only; builder is schema-locked) | Prompt hardening + injury-aware context (see DECISIONS — output-filter approach rejected for false positives) | FIXED |
| S11 | Low | Local SQLite unencrypted | Accepted: app-sandboxed, user's own data. SQLCipher if threat model changes | ACCEPTED |
| S12 | Low | 2MB JSON body limit; public `/health` | Accepted as-is | ACCEPTED |

## Logging fix (S8 detail)

- `pino` structured logs, JSON in prod, pretty in dev.
- Redaction paths: `req.headers.authorization`, `*.password`, `*.token`,
  `*.email` (log a hash prefix where correlation is needed).
- Log: auth successes/failures (userId or email-hash + IP), rate-limit trips,
  5xx with error id returned to client, AI fallbacks.
- Never log: request bodies, chat content, health data values.

## Code quality findings

| # | Finding | Fix | Status |
|---|---------|-----|--------|
| C1 | `plans.service.ts` becoming a god-module (generation + templates + difficulty) | Split difficulty logic into `planDifficulty.service.ts` | FIXED |
| C2 | `ChatScreen.tsx` does three jobs (chat, builder, confirmation) | Extract `usePlanBuilder()` hook + `ProposalCard` component | FIXED |
| C3 | Disclaimer copy duplicated (server template vs onboarding hardcode) | Single client constant consumed by both screens; server copy asserted equal in test | FIXED |
| C4 | `as never` casts on Prisma enum writes | Accepted: a cast helper adds indirection without real type safety (values are Zod-validated upstream); revisit if Prisma adds enum narrowing | ACCEPTED |
| C5 | Exercise pull-sync has no tombstones — removed exercises live on devices forever | Deferred: exercises are only ever added; sessions reference them historically so hard deletion is undesirable anyway. Documented here | DEFERRED |

## UX findings

| # | Finding | Fix | Status |
|---|---------|-----|--------|
| U1 | Home crowded (header + difficulty chips + routine + split + 2 buttons) | Difficulty moves behind a compact plan-header expander; "New plan" demoted | FIXED |
| U2 | Difficulty change is silent & irreversible-feeling | Post-change summary of what swapped + one-tap Undo | FIXED |
| U3 | Starter templates unreachable outside onboarding/AI chat | Template browser screen linked from empty-Home and PlanBuilder | FIXED |
| U4 | Injury data collected then never used by the coach | `User.injuryNotes` synced up; `buildContext()` includes it | FIXED |
| U5 | No haptics; rest timer silent on completion | expo-haptics on set completion/PR; vibration + haptic cue on timer end | FIXED |
| U6 | 7 bottom tabs at the ceiling | Watch item — no action until a tab is actually added | WATCH |

## Competitive gaps (market scan 2026: Hevy / Strong / Fitbod)

| # | Gap | Action | Status |
|---|-----|--------|--------|
| M1 | Rest-timer sound/vibration (table stakes) | Implemented with U5 | FIXED |
| M2 | Streaks + personal records (retention drivers) | Weekly streak on Home; per-exercise records (max weight, max reps, est. 1RM via Epley) in Progress; PR detection at summary | FIXED |
| M3 | Recovery-aware suggestions (Fitbod's moat; we already collect check-ins) | "Suggested today" hint on Home from soreness + session recency | FIXED |
| M4 | Health platform integration (Health Connect / Apple Health) | Deferred — large surface, needs store review prep; scheduled after launch hardening | DEFERRED |
| M5 | Social following/feed (Hevy's moat) | Deferred — community library exists as the seed; a feed is a product decision with moderation costs (see S6) | DEFERRED |
| M6 | Localization / i18n | Deferred — full i18n is high-effort pre-launch; unit preference already exists and onboarding now asks it. Revisit with first non-English market | DEFERRED |

## Diminishing-returns triage

Implemented now (high value / low-to-moderate cost): S1–S10, C1–C3, U1–U5,
M1–M3. Deferred with reasons logged (DECISIONS.md "Audit remediation"):
M4 health platforms, M5 social feed, M6 i18n, C5 tombstones, S11 SQLCipher.
Watch: U6 tab count.
