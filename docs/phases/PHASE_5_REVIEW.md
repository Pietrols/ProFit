# Phase 5 self-review before device testing

Date: 22 October 2026. Branch: feat/workout-corrections. Authority: Peter's request and D52.
This is a working review record. It does not claim all vulnerabilities have been eliminated.
Run automated tests during implementation; request the final phone checks after the corrections.

## Scope and execution

1. Review API/session identity, profile persistence, sync and media across awaited work.
2. Reproduce isolation and lost-edit findings with deterministic failure tests; fix them in
   separate small commits and rerun both package gates and real PostgreSQL CI.
3. Inspect workout ownership, stable identity, correction/undo, immutable targets, draft recovery,
   timer attribution and query bounds. Record checked areas and practical limits.
4. Continue 5.8.8 through 5.8.12 in order: history/comparison, rest-day completion, plate/per-side
   logging, alert behavior and integrated regression/performance/readability checks.
5. Produce a fresh corrected native build and consolidate the physical scenarios under 5.7.
   Keep Phase 6 blocked until acceptance and review are complete.

## Findings under reproduction

| Id | Source and failure candidate | Required regression |
|---|---|---|
| R1 | lib/api/client.ts shares refresh globally and saves/expires the current session after a late response | A refresh completes or fails after B signs in, including A signing in again: B/new A credentials survive; no old request retries with the new account |
| R2 | sync/engine.ts checks owner after negotiation but not during media, row reads, push/pull batches or transaction admission | Switch during each boundary: no foreign upload, pull application, cursor advance, dirty acknowledgement or stale status |
| R3 | Rejected push acknowledgement clears dirty without matching the sent revision | A newer valid edit made while the rejected version is in flight remains dirty and syncs |
| R4 | Profile cache/pending writes publish after awaits using mutable current state | Delayed old reads/writes cannot publish another account's profile or erase a new account's pending edit |
| R5 | Media upload/download obtains current auth after selecting another owner's local photo | Bind owner and transfer retries; late download must not cache a foreign image under the caller |
| R6 | Backend media upload checks ownership before file IO, then upserts without an ownership condition | Concurrent claims of one id cannot modify another owner's metadata or content |

Candidates become confirmed findings only when a failing regression establishes the behavior.
Do not equate these first-party findings with dependency vulnerability scan results.

## Original review traceability

| Requested correction | Current state |
|---|---|
| Set edit, delete and undo | Implemented; review concurrency and historical entry point |
| Select, defer, skip/restore, add/remove/replace/reorder | Implemented; preserve performed results and routine snapshots |
| Current set/timer first, next/overview, steppers, durable drafts | Implemented and browser-verified; physical checks retained in 5.7 |
| Lint, formatting and readable/small commits | Configured and enforced; continue readability review |
| Bounded history and isolated ticking | Implemented projections/readers; populated-history evidence remains in 5.8.12 |
| History, comparisons and planned-versus-actual finish review | Not yet implemented: 5.8.8 |
| One-tap rest day with safe undo | Not yet implemented: 5.8.9 |
| Plate loading and explicit per-side semantics | Not yet implemented: 5.8.10 |
| Sleep/pause, permissions, exact alarms and alert cancellation | Pure engine exists; full correction checks remain in 5.8.11 and 5.7 |
| Integrated regression and final phone acceptance | Pending: 5.8.12 and 5.7 |

## Validation ledger

Baseline: merged PR #12 has 500 mobile tests, 125 backend tests, four production browser cases,
two delayed-draft account-switch cases and a verified arm64 development APK. This baseline
does not establish safety of untested background sync/profile/media account transitions.
New regressions, fixes, exact commits and CI results will be recorded below.
