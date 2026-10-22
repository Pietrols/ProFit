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

## Confirmed findings and corrections

| Id | Reproduced failure | Correction and evidence |
|---|---|---|
| R1 | Late API refresh could overwrite/expire a newer sign-in or retry an old request under it | Scoped request/refresh lifetime and expected user binding; seven deterministic API identity regressions |
| R2 | Account changes during sync row reads and transaction admission could continue an obsolete run | Run generation, live owner and API identity checks at awaited boundaries; five boundary regressions |
| R3 | Rejection of an in-flight version cleared a newer valid edit's dirty flag | Acknowledgements match the sent edit timestamp; regression confirms the newer edit reaches the server |
| R4 | A delayed profile save could persist B's private pending note under A; old sign-out/login could replace a newer sign-in | Ordered storage per key, auth generations, owned cache validation and withdrawn screens during sign-in persistence; durable-storage and auth race regressions |
| R5 | Selected photos could upload/retry as a new account; late download/local lookup could return or cache an obsolete photo | Bind picks, transfers, retries and transactions to expected user/sign-in; owner-scoped failure backoff and render-time URI gate; eleven media isolation/presentation regressions |
| R6 | Two accounts could both pass the upload ownership check, then mutate one media row | Atomic owner reservation before file IO and conditional owned metadata publication; concurrent-claim PostgreSQL regression passed in CI |
| R7 | Eight simultaneous writes sharing a timestamp produced seven ENOENT failures; separate file/metadata replacement could mismatch bytes and MIME type | Unique temporary files and immutable SHA-256 revisions published atomically with metadata (D53); local stress now 8/8, with replacement/failure/legacy regressions in CI |
| R9 | A concurrent family revoke could miss a newly issued refresh token, including a sibling retry branch | Whole-family transaction locks before issuance/revocation (D54); both controlled PostgreSQL race tests pass, backend total 132 at f787f11 |
| R10 | Production accepted the publicly known development signing key when explicitly supplied, and accepted padding-only keys | Reproduced with the production loader, then rejected the development key, padded variants and whitespace-only/short padded values; configuration regression added |
| R11 | Default error serialization included Drizzle SQL parameters and nested private profile/workout text | Reproduced with the actual previous logger; the replacement retains bounded diagnostic frames and SQLSTATE while excluding messages, queries, params and causes; real logger serialization regressions added |


These are first-party findings, separate from the dependency scan below. They establish failures
and specific protections, not an exhaustive security guarantee. Local account ownership guards
cannot revoke a network transfer already sent with its original owner's valid credentials.
Such a transfer remains attributed to that owner; obsolete work cannot retry as a new account.

### Further boundaries to verify before handoff

- A valid access JWT retains its existing short lifetime after sign-out (D54). Do not claim
  instant server invalidation of every issued access token from the refresh-family fix.
- Alert owner transitions: WorkoutAlerts currently skips loading snapshots and local sign-out
  publishes only after durable storage cleanup. Reproduce delayed sign-in/sign-out cancellation
  in 5.8.11, preserving legitimate persisted alerts while startup identity is still unknown.
- Browser text entry: inspect the actual input before testing recovery. One failed CI screenshot
  showed an empty note before navigation, and the stronger driver then caught an unaccepted
  adjustment reason. Focus/editability diagnostics and scroll settling are being verified.

## Dependency scan and limits

Read-only `npm audit --omit=dev --json` found zero backend production advisories. Mobile reports
26 affected package entries (20 high, six moderate), which trace to four distinct advisories;
transitive entries are not 26 independent defects. No dependency or lockfile was changed.

| Advisory | Locked path and reachability review | Follow-up |
|---|---|---|
| [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 through Metro/build tooling; no ProFit user-facing pattern evaluator found | Advisory lists no patched release; keep untrusted patterns out of build inputs and recheck supported Expo updates before release |
| [node-forge RSA verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | node-forge 1.4.0 through Expo CLI code-signing tooling, not ProFit's backend JWT verifier | Advisory lists no patched release; review signing/update trust and supported upstream fix before release |
| [URI decoder denial of service](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | decode-uri-component 0.2.2 through query-string 7.1.3 and Expo Router; installed Router fork uses URLSearchParams for inbound parsing, but also bundles a core parser | Finish native/deep-link boundary validation before handoff; 0.5.0 is ESM and cannot be blindly substituted into the locked CommonJS caller |
| [uuid buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | uuid 7.0.3 through xcode tooling calls v4; advisory concerns caller-buffer v3/v5/v6 | Affected API use not found on this path. ProFit's own deterministic IDs use its own module; recheck upstream tooling update before release |

Do not run audit force-fixes that downgrade native packages or migrate the app to an unplanned
Expo SDK. A remaining advisory must retain its reachability/mitigation record; a clean first-party
regression suite does not erase it. Long-term release hardening remains Phase 11.

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

### Review validation checkpoint

- 529 mobile tests across 84 files pass after R1-R5, plus both packages' formatting, lint and
  typecheck gates. Backend builds locally. PostgreSQL remains provided by CI under build rule 8.
- API owner-binding commit f47426c passed push/PR CI (39864254164 / 39864261822), including the
  production browser and delayed-draft account-switch scenarios.
- Backend owner reservation 4f745e3 passed push/PR CI (39865148494 / 39865154867), including the
  new PostgreSQL concurrency regression. Immutable media publication 04a72a0
  passed push/PR CI (39865731485 / 39865738674), including its new PostgreSQL regressions.
- All changes are separate reviewable commits. Generated Drizzle snapshots are isolated from
  behavioral fixes. The unrelated local app-icon edit is excluded from every commit.
- Next: complete 5.8.8 history/comparison, then 5.8.9 through 5.8.12. Physical acceptance stays
  pending in 5.7 and Phase 6 remains blocked. No phone result or completeness score is inferred.
