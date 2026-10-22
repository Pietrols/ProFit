# Phase 5 corrections: dependable workout logging

Status: design and acceptance contract, 20 October 2026. Implementation is not complete.
Branch: feat/workout-corrections, based on rebuild at
850abec74ba48185c2c521f5be7801864a006149. Source of execution order: BUILD_PLAN.md.

Peter authorized these corrections after Claude's review, including ESLint and Prettier.
This document supplements PHASE_5.md. It does not claim a quality score, device result,
installed dependency, benchmark or implemented feature. The desired quality must be
demonstrated by the acceptance checks below, not by a self-assigned 8.9/10.

## Done when

A person can follow a routine, adapt it when equipment is occupied, correct a mistaken
result, finish with an honest planned-versus-actual comparison, and reopen that workout
offline from history. Six months of history must not make each timer tick or set save scan
all previous workouts. Lint and formatting must be reproducible checks. The corrected
build must also pass the original Phase 5 real-phone notification and offline checks.

The order is 5.8.1 through 5.8.12, then the still-open 5.7 phone gate. The new 5.8 work is
intentionally placed before 5.7 so the final phone check tests the corrected product.
Phase 6 cannot start while either corrections or the phone gate are incomplete.

## 1. Findings verified in the current source

| Finding | Evidence in rebuild | Required correction |
|---|---|---|
| No set correction UI | SetForm only submits a new result; useWorkouts exposes no edit/delete action | Edit, delete and undo with original slot identity and timing |
| Fixed exercise order | workoutProgress picks the first missing positional slot; the screen always uses summary.next | Explicit selection, do-later and skip with honest completion counts |
| Unsafe naive reorder | identity.ts derives set ids from exercisePosition and setIndex | Separate immutable identity from presentation order before structural changes |
| Current task buried | workouts/[id].tsx renders the session clock and timer/settings card before SetForm | One primary current-set card, compact timer/progress, secondary settings |
| No history entry point | Train has plans and habit links; Home resumes active workouts only | Paginated history and linked session detail |
| Broad repeated reads | useWorkouts lists all sessions; listSets re-reads each session before fetching its sets | Queries bounded to the consumer's needs, shared invalidation |
| Repeated calculations | 250 ms state updates in the workout root call sessionSummary and prefill over all history | Isolate clock updates and prepare relevant history only when data changes |
| Duplicate consumers | Home and StartWorkout each call useWorkouts | Pass the summary/commands down or share one subscribed read |
| Dense code | Route, forms, timers and storage compress multiple statements and JSX branches onto long lines | Prettier plus component/module separation and targeted lint rules |
| Incomplete tooling | Mobile lint invokes Expo with no installed ESLint; backend has no lint script; CI runs neither lint nor format | Checked-in configuration, locked tooling, CI enforcement |
| Rest-day friction | StartWorkout starts a full session and navigates even for restDay | Atomic one-tap completion without timers or training navigation |

For N sessions, one current useWorkouts history refresh performs approximately 1 + 2N
database reads: listSessions, then getSession and the set query inside listSets for each
session. A second hook instance repeats that work. This count follows the code; it is not
a timing benchmark. Startup and save latency still need measurement on a phone.

The reported 320 mobile and 111 backend tests are a prior reviewed baseline. Green unit
tests established those tested properties, not completeness of the gym workflow. No new
local test run was possible during this design pass because the execution environment
was unavailable. GitHub source inspection and document publication remain possible.

### What remains sound

Keep timestamp timers, immutable original plan snapshots, device-generated ids, strict
selected-field validation, canonical kg/metres/seconds, user-scoped reads, tombstones and
OS-scheduled rest notifications. Preserve zero versus missing values and the existing
rule that bodyweight or machine resistance is not guessed. Do not replace the sync engine
or import code, assets or data from another fitness project.

### Why the earlier process failed

The implementation treated a large checklist step as the minimum commit unit, rather
than splitting it into independently reviewable changes. It also treated tested storage
and pure functions as sufficient evidence for a usable workout screen. The new workflow
requires both small implementation commits and scenario-based product checks. Do not
rewrite merged history to hide the large commits. Correct the process going forward.

## 2. Timer behavior in plain language

| Situation | Expected result |
|---|---|
| Start a 20-minute countdown, then the phone sleeps for 10 minutes | About 10 minutes remain on return |
| Explicitly pause with 15 minutes remaining, then sleep for 10 minutes | Still 15 minutes remain |
| Resume that paused countdown and wait 2 minutes | About 13 minutes remain |
| Leave longer than the countdown's remaining time | Show complete, never a negative value |
| Finish a workout and reopen it later | Session duration stays at its saved end time |

The app stores the start timestamp and accumulated active time. Rendering derives elapsed
time from the current timestamp. A screen refresh interval only updates the display; it
does not count time. Screen sleep is not a pause action. Notification delivery is a
separate OS effect and can be delayed or suppressed even when the displayed timer is right.
Clock changes remain a documented limitation of wall-clock timestamps.

Add explicit 20-minute/10-minute and paused-sleep tests to make this behavior easy to read.
Retain tests for restore, long sleep, exact boundaries, final rounds, reset generations,
pause/resume idempotency, clock rollback and notification cancellation. Do not display a
paused label solely because the app is backgrounded.

## 3. Product behavior and interaction contract

### Current set and timer hierarchy

Use one main training card in this order: exercise name, set position, compact progress,
the relevant live timer, selected log fields, then the primary Log set action. A time-based
exercise may give its work timer more space; ordinary strength logging gives reps and
weight the emphasis. Keep the session clock as small supporting text.

Directly below, show Next with the next eligible exercise and a Change exercise action.
A workout overview lists every item and its state. Timer configuration, session notes,
easier-today, notification settings and abandon belong in secondary sections. Keep essential
save/permission failures visible near the action they affect. Once permission is granted,
do not leave an Enable rest alerts button dominating every set.

At 360 px width and default text size, the name, essential numeric fields and Log set
action must be reachable without scrolling past settings. Larger text, notes-only fields
and the software keyboard may require scrolling, but must never obscure the save action.
Use existing tokens, clear focus/reading order, labeled controls and minimum 44 px targets.
Verify dark and light themes and screen-reader labels. Never color-code status without text.

### Edit, delete and undo

Allow correction from the current workout's logged-set list and from completed history.
Editing keeps the same logical set id, exercise identity, side and original loggedAt;
updatedAt records the correction time. Preserve session start/end and original targets.
Recompute volume, PRs, comparison results and relevant caches after a correction.

Deleting a set creates a tombstone and offers Undo. Undo restores the same result identity
with a new edit time, not another set. Confirm destructive actions that have no easy undo.
If a newer remote edit exists, do not silently overwrite it with an old undo payload:
show the saved and current values and require an explicit decision.

Correcting an old set must not start a new rest timer, resume a completed workout, advance
the routine again or emit another immediate PR celebration. Deleting the latest active
set cancels only a rest timer attributable to that result, not an unrelated manual timer.
Retain an explicit Edit/save/cancel mode so normal Log set remains a fast action.

### Adapt the session without rewriting the routine

| Action | Meaning | Effect on progress |
|---|---|---|
| Train this now | Select any available pending item | Nothing is completed merely by selection |
| Do later | Move an unfinished item behind other pending work | It remains outstanding and is offered again |
| Skip today | Explicitly omit remaining work for an item, optional reason | Count as skipped, never completed |
| Restore skipped | Return omitted remaining work to the queue | Existing valid logs remain unchanged |
| Add exercise | Pick a library/custom exercise and targets for this session | Mark as added work, separate from original plan |
| Remove from session | Omit remaining work; retain original plan and any results | Show removed/omitted work in the comparison |
| Replace exercise | Omit remaining original work and add a linked replacement | Attribute results and PRs to the replacement |
| Add/remove set | Change remaining session work within limits | Preserve original target count and every saved result |
| Reorder | Change presentation/execution order | Never change exercise or set identity |

If some sets are already logged, skip/remove applies only to the remaining work. Never
silently delete those results. Removing a saved result is a separate explicit delete.
Replacing after partial completion shows the original partial work and the replacement.
Do not transfer an old weight to a different exercise automatically.

Session adjustments do not modify the saved plan. The UI states For this workout.
A future Update my plan action would require its own explicit preview/approval; it is
not part of this correction. Plan-day editors continue to handle permanent changes.

Keep separate counts for original planned sets, completed planned sets, omitted planned
sets, and added completed sets. Added work does not erase a miss. Finishing partial work
keeps the existing explicit confirmation and single cycle advance. Abandoned workouts
stay out of PR and progression history. An all-skipped workout must clearly say no sets
were logged, not congratulate the user for hitting targets.

Drafts are keyed by stable item/set identity. Selecting another exercise, editing a saved
set, receiving sync, changing units or changing easier-today must not silently discard
an unsaved draft. Save drafts locally or explicitly confirm before discarding them.
A logged result takes precedence over an older persisted draft after restart.

### Steppers and input behavior

Add minus/plus controls alongside directly editable reps and weight. Reps default to
steps of 1; weight defaults to 2.5 kg in metric and 5 lb in imperial, with a visible option
to choose a suitable increment. These are input conveniences, not progression advice.
Keep values in the displayed unit until validated conversion to canonical storage units.

Blank plus starts at one step; blank minus remains blank. Minus from zero remains zero.
Reject malformed text instead of converting it to zero. Prevent exceeding validation
bounds and floating-point drift. Preserve the exact stored value when the display was
not edited, as D35 requires. Test comma decimals, arbitrary typed weights, unit changes,
repeated taps, disabled/busy state, limits and screen-reader labels. A typical prefilled
set needs one tap to log, or one adjustment and one tap to log.

### History and planned-versus-actual review

Train gains Workout history; Home can show a recent-session link without loading all logs.
List newest first with local date, plan/day snapshot name, status, duration and a concise
completion figure. Include completed, abandoned and rest-day records with clear filters.
Keep active sessions in a separate Resume section. Paginate by startedAt and id, not offset,
so new synced records do not duplicate or skip an existing page.

Detail shows original targets, session adjustments, actual sets, units, notes, duration,
volume, records and sync status. It remains available offline after plan deletion/renaming.
Offer a plan filter and exercise filter so users can follow the same routine over time.
An exercise view shows recent comparable results; long-range charts remain Phase 8.

The finish summary and history detail share the same comparison function. For each original
item, show target sets/reps/time/distance, actual values, omitted work and replacements.
Also show added exercises. Missing values are unknown, not zero. Compare against the targets
actually in effect for that set, while retaining the original routine target separately.
Changing easier-today halfway through cannot rewrite the target of a set already logged.

A corrected historic result invalidates downstream bests and comparison caches. Existing
PR computations remain authoritative until optimized projections pass equivalence tests.
Do not approximate historical records with only the last few sessions.

### One-tap rest-day completion

Home's Rest day done action writes a completed zero-set record in one local transaction.
It never opens a training screen, starts a timer or acquires a wake lock. Repeated taps
and retries must reference the same occurrence id.

For a cycle, identify the occurrence by plan/day plus the preceding completion id, or
a stable initial-cycle token. A second legitimate cycle through that day has a new
occurrence. For an explicit weekly rest day, identify it by plan/day/local date.
An unscheduled weekly rest day needs no fabricated plan-day record.

Show a small completion acknowledgement with Undo. Undo tombstones only that occurrence
and recalculates today's day. If a successor workout has started, explain the dependency
and do not silently rewind its active snapshot. Rest completion earns no lifting PR,
volume or workout-duration credit. Two-device concurrent retries must converge.

## 4. Data design and migration safeguards

Do not splice, reorder or replace entries inside the original snapshot array. Existing
setLogId(sessionId, exercisePosition, setIndex) makes the index part of identity.
Display order must become a separate field before structural adaptation is exposed.

Use the existing sync collection pattern. The intended additive design is:

| Record/projection | Purpose |
|---|---|
| Existing workout session snapshot | Immutable original routine for comparison and old history |
| Session items | Stable id, session id, original position or null, origin planned/added, replacement link, independent display order, exercise snapshot, active/skipped/removed state, reason and remaining-work targets |
| Set slots/results | Stable session-item identity and slot identity; actual chosen values; original performance time; targets at performance; optional side |
| Derived exercise history index | Local rebuildable searchable projection, never the authority for user data |
| Local view state | Selected slot, drafts and timer source id, scoped to account/session |

Planned item ids are deterministic UUIDv5 values from session id and original snapshot
position. Added/replacement items get random device UUIDs. A repeated exercise in one
session has distinct item ids. Do not derive added identity from current list length.
Slot ids are independent of display order; existing positional set ids are preserved.

Before implementation, finalize the additive wire shape and fixture tests in a small
schema-contract commit. Prefer extending existing set records with a nullable item
reference and side/target metadata, while retaining the legacy identity path. If that
cannot preserve old records and validation cleanly, document the alternative before code.
Do not invent a silent reinterpretation of exercisePosition.

Legacy records are adapted on read; never rewrite every historic workout merely to show
it. Existing dirty rows, tombstones, timestamps and ids must survive migration. Legacy
sessions with no target-at-performance snapshot must show that the historic target is
unknown if easier-today changes cannot be reconstructed. Do not guess it.

Server deployment accepts both legacy and new wire variants before new clients write them.
Define and test how older installed clients are prevented from corrupting new-format
sessions. If a minimum-version/capability gate is needed, apply it before push/pull and
retain unsynced data. Do not return ordinary per-record validation rejections for an
unsupported client version: D17/D21 would otherwise risk dropping pending edits.
New collections also need an explicit old-client pull strategy. Test compatibility before
enabling adaptation; do not assume old clients ignore unknown fields or collections.

Every new record uses ownership-scoped joins, existing sync metadata and tombstones.
Soft references can arrive before parents. Hide orphaned/foreign/invalid results and
re-evaluate once legitimate parents arrive. Deleting a session hides all late children.
Use existing transactions for related local changes; no filesystem/network operation
belongs inside a database transaction.

Keep D21's per-record merge policy. Separate item records prevent edits to different
exercises from overwriting an entire session array. Concurrent changes to the same item
still need deterministic resolution and a visible reconciliation result. Never claim
automatic conflict-free merging merely because ids are stable.

Required migration fixtures: populated Phase 5 SQLite, unsent edits, completed and active
workouts, tombstoned sets, duplicate exercise ids, mixed legacy/new sync, two offline phones
adding exercises, concurrent reorder, removed items with late sets, and delete/undo races.

## 5. Pure function contracts

Write the relevant pseudocode and tests before each implementation slice. No React,
database, Date.now, router or OS calls belong in these functions.

~~~text
effectiveSession(original, items, slots, results):
  resolve latest records and tombstones using existing rules
  join by stable owned identity; preserve original snapshot
  sort display order with stable id as tie-breaker
  return original targets, adjusted work, actual results and omissions separately

chooseSlot(effective, selectedSlot, deferredOrder):
  honor a valid user selection; otherwise choose the first eligible outstanding slot
  do not select skipped/removed/completed slots automatically
  return current and next; deferred work remains outstanding

applySessionCommand(effective, command, suppliedIds):
  validate active session, selected item and bounds
  return records to write for select/defer/skip/restore/add/remove/replace/reorder
  preserve results and original targets; never renumber identity
  reject unsupported or stale commands with a usable error

correctSet(existing, patch, expectedRevision, editTime):
  preserve id, item, side, slot and loggedAt
  validate chosen fields and values; update only entered result data and edit metadata
  refuse a stale expected revision instead of silently overwriting another edit

undoDeletion(deletedResult, currentResult, undoToken, editTime):
  restore the same logical identity only if the deletion still matches the undo token
  retain original performance time; create a later edit; otherwise report a conflict

stepDraft(text, direction, increment, units, limits):
  validate editable decimal text; handle blank and zero explicitly
  perform decimal-safe arithmetic; enforce bounds
  return new display text or validation error; no storage conversion until save

compareSession(original, effective, completedResults):
  return per-item planned, adjusted, completed, missing, skipped and added work
  use per-set targets at performance when available
  return per-metric comparisons without treating unknown as zero
  never count added/replacement work as hitting the original exercise's target

historyCursor(page):
  return the last startedAt/id tuple or null
  stable ordering and continuation must match the query predicate

restOccurrenceId(user, plan, day, localDate, predecessor):
  weekly uses local date; cycle uses predecessor or initial token
  repeated attempts share an id; later cycle occurrences do not

exerciseHistoryProjection(validSessions, results):
  include only valid eligible performed results and the relevant exercise identity
  retain ordering and tie semantics used by the current PR functions
  derived data can be rebuilt; never change authoritative results

sideSummary(results, convention):
  report left/right separately; missing side remains unknown
  sum only actually logged external-load volume under the explicit convention

platePairs(target, bar, collarPair, denominations, inventory, unit):
  validate unit consistency, nonnegative mass and paired inventory
  convert to exact integer mass units; subtract bar/collars
  find an achievable symmetric combination, exact when possible
  otherwise choose nearest achievable total at or below target
  return per-side plates, actual total and shortfall; never round up silently
~~~

Each command must distinguish a failed local write from a successful write followed by a
failed read or sync. After a committed set, the UI must update its slot identity immediately
or block another Log set action until refresh; otherwise a stale screen can overwrite the
just-saved slot. Preserve drafts when the local write fails.

## 6. Performance correction and evidence

Separate reads by purpose:

- Home: active session summaries and latest completion for the active plan, without set logs.
- Active workout: one session, its items/results and relevant exercise history.
- History list: one bounded page of session summaries, without a query for each row.
- Session detail: that session's data, plus only the comparison/best data it needs.

Replace per-session fan-out with bounded batched queries. A local derived exercise/result
index may be needed because exercise identity currently lives inside JSON snapshots.
It must update transactionally after saves, edits, deletes and sync, be rebuildable from
canonical records, and be indexed by owner, exercise and performance ordering. Compare
query plans before and after. Do not add a cache/state library just to avoid clear queries.

Query count alone is insufficient: one query that returns every historic set still scales
poorly. Prefill needs the latest eligible value per selected field. PRs need exact relevant
bests, including reps at a specific weight and historical cutoffs. Batch these reads for
the session's exercise ids. Invalidate corrected/deleted histories before exposing a
cached record. Never load all unrelated exercise logs to compute one current set.

Move ticking state into small clock components. A timer tick must issue zero database
queries and cause zero calls to full history preparation, prefill or PR recomputation.
Memoize data-derived summaries against stable data revisions, not the current timestamp.
Do not mutate cached input arrays. Refresh immediately when foregrounded, stop display
refreshes when not visible, and retain timestamp-derived correctness after sleep.

Use request versions/account guards so stale async reads cannot replace newer local work.
A sync state transition must not refresh all history twice. Preserve the existing current
draft on background reads. Share summary reads between Home and StartWorkout.

Performance fixtures and proposed budgets, to be measured rather than claimed:

| Check | Fixture/target | Evidence |
|---|---|---|
| Scale | 0, 50, 500 and 2,000 sessions; up to 40,000 result rows | Original synthetic fixtures only |
| Timer isolation | 60 seconds of clock updates | Zero DB calls and zero history/PR rebuilds |
| Home/history query count | Same query count at 50 and 2,000 sessions | SQL instrumentation; no per-session fan-out |
| Active read volume | Bounded current-session rows and relevant exercise aggregates | Row counts and query plans |
| History first page | 25 records with stable cursor | No full log materialization |
| Interaction | Proposed p95 local set-save feedback under 200 ms | At least 30 runs on named Android device |
| Warm entry | Proposed p95 history first page under 300 ms; workout ready under 500 ms | Same device/build and dataset before/after |
| Account isolation | Switch during a slow read | No prior-account data or draft flashes |

Do not gate CI on fragile wall-clock timings from arbitrary runners. Use deterministic
query-count, returned-row and render-invocation regressions there, and record device
timings separately. If the target device cannot meet a budget, document the measurements
and cause before changing the budget. No unmeasured claim that it is fast.

## 7. Plate loading and unilateral results

These are explicit correction slices, not hidden additions to progression logic.

Plate calculator: a collapsible tool for barbell work, with editable bar weight, collars,
available plate sizes and pair counts. Treat logged barbell weight as total external load.
Do not assume all bars are 20 kg or that a gym has unlimited plates. The result states
plates per side and achieved total. A greedy algorithm is not sufficient for arbitrary
inventory; test exact combinations, unavailable pairs, odd totals, below-bar targets,
mixed units, zero load and unreachable totals. Applying a calculated weight needs a tap.

Per-side logging: an explicit bilateral/per-side setting, not a guess from exercise name.
Offer left and right fields/results and label whether load is total or per-hand. Store
the convention in the session item. Existing records remain bilateral/unspecified and
must not be silently doubled. One side logged is partial work; never fabricate the other.
PRs compare compatible conventions and sides. Progression will consume both sides and
must not increase load from one successful side while the other is missing or missed.

## 8. Tooling, readability and commit discipline

Peter's 20 October approval covers ESLint, Prettier and the configuration/parser packages
needed for mobile and backend checks, including eslint-config-expo. Log installed names
and versions. No need to ask again for this tooling. New runtime libraries still require
approval. Resolve versions against the installed Expo/TypeScript versions and official
docs; generate lockfiles with the package manager, never by guessing integrity hashes.

Use a checked-in Prettier configuration with 100-column print width, single quotes,
semicolons and the repository's line endings. ESLint should enforce hooks correctness,
unused variables, valid imports and readable statements. Avoid blanket disable comments,
disabled hooks rules or ignoring entire feature folders to obtain a green check.
Prettier is not an architectural refactor: extract readable components and commands too.

Install/configure first, then separate formatting-only commits by feature area from
behavior changes. Exclude generated builds, dependency trees and generated datasets.
A temporary, explicit baseline for untouched formatting may be used only during the
formatting rollout; remove it before 5.8.2 completes. Lint errors have no permanent baseline.
Do not mix a repository-wide rewrite with a functional fix.

After tooling is established, each backend/mobile check sequence is:
~~~sh
npm run format:check
npm run lint
npm run typecheck
npm test
~~~
Backend also runs its build in CI; mobile exports web and Android bundles when routes or
native adapters change. These exports are not APK builds. CI must use npm ci and include
format/lint as required jobs without continue-on-error or silent successful skips.

A reviewable commit contains one logical change and its necessary tests. Aim for 50 to
200 hand-written changed lines and at most five related files; these are review triggers,
not incentives to split a working invariant into broken commits. Stop and split when a
diff grows beyond roughly 300 hand-written lines. Generated lockfiles/migrations, this
design document and mechanical formatting have separate, explicitly identified exceptions.
No more 2,118-line mixed implementation commits.

Before each commit: inspect the diff, run the applicable complete gates, verify ownership
of changed files, check no em dashes, then commit with a conventional message and push.
Do not wait for a whole checklist step if a smaller tested change is ready. Keep the box
open until the final commit completing that step, and tick it in that commit. Never tick
a feature because only its data layer exists. Failed CI means the slice remains open.
Do not squash away the requested reviewable history or rewrite already merged commits.

If local PostgreSQL is unavailable, use the existing rule 8 CI gate. If the entire coding
workspace is unavailable, publish documentation and report the constraint. Do not hand-edit
lockfiles, claim local checks, or mark executable fixes complete without running them.

## 9. Ordered implementation slices

Each row is a checklist step; commit boundaries inside it are deliberately smaller.

| Step | Work and suggested commit boundaries | Completion evidence |
|---|---|---|
| 5.8.1 | Source audit, this contract, scope decisions and checklist order | Design committed before code; links and invariants reviewed |
| 5.8.2 | Lock/configure tooling; format workout pure modules; format storage/hooks; format screens; format remaining authored areas in small commits; enable all CI gates | Fresh npm ci, both format/lint/typecheck/test suites green, no temporary exclusions |
| 5.8.3 | Add bounded session/detail/history queries and regression fixtures; isolate ticking displays; introduce relevant exercise projections/aggregates with equivalence tests | No N+1 reads or timer-driven history work; measured query/row evidence |
| 5.8.4 | Transactional correction/delete/undo commands; conflict tests; active logged-set editor | Correct 80 to 60 kg, delete/undo offline, retain time/id, no stale-slot overwrite |
| 5.8.5 | Legacy/new contract and identity tests; backend acceptance/migration; matching SQLite/sync support; effective-session functions | Existing histories and unsent edits survive; mixed-version behavior tested |
| 5.8.6 | Selection/defer/skip/restore; add/remove/replace/reorder and set-count actions, each with storage/tests/UI commits | Adapt a busy-gym workout without rewriting the plan or misattributing sets |
| 5.8.7 | Current-set layout; next item/overview; unit-safe steppers; draft persistence/recovery | Small-screen and keyboard scenarios pass, fast normal logging, readable components |
| 5.8.8 | Paginated history route; detail/correction route; per-exercise comparison and finish read-back | Saved routine and deviations traceable offline; edits update bests and totals |
| 5.8.9 | Rest occurrence identity and atomic completion; Home action and undo | One tap, no training route/timer, idempotent retries and two-device convergence |
| 5.8.10 | Plate algorithm/tests, then collapsible UI; side metadata/contracts, then left/right UI and calculations | Honest total load and side-specific results; no legacy doubling |
| 5.8.11 | Notification permission/status UI; source-linked rest effects; exact-alarm behavior review; integrated timer tests | Denied/revoked permissions and set correction do not break saved data or alerts |
| 5.8.12 | Integrated offline/sync scenarios; populated-history benchmark; visual/readability audit; correction summary | Acceptance matrix complete except explicitly pending physical 5.7 results |
| 5.7 | Fresh native build, physical Android acceptance, final phase summary and review PR | Recorded build/device/results, green CI, no assumed passes |

5.8.5 precedes structural adaptation. Editing existing legacy sets in 5.8.4 does not require
renumbering them. History UI arrives after bounded queries so it cannot cement the current
all-history hook. Side-dependent summary support is extended in 5.8.10 after its schema
contract is tested. Stop within Phase 5 if the final device gate is unavailable.

## 10. Acceptance matrix

| Scenario | Required result |
|---|---|
| Mistyped 80 kg, correct to 60 | Same set/time, corrected volume and eligible records, no new rest |
| Delete latest set, then undo offline | One result identity, correct progress, no duplicate after sync |
| Another phone edits before undo | Explicit conflict handling, no silent stale overwrite |
| Bench occupied, train rows first | Select rows, preserve bench draft and outstanding work |
| Skip remaining bench sets | Already logged sets retained, misses visible, no false target success |
| Add then replace an exercise | Plan unchanged, separate identities, results attributed correctly |
| Reorder with existing logs | Saved sets still belong to their original exercise |
| Concurrent offline additions | Both additions survive, no index collision |
| Finish partial workout | Honest counts and one confirmed cycle advance |
| Reopen history after deleting plan | Snapshot, results and comparisons still readable |
| Correct a past record | Relevant later best/PR caches invalidated without replaying celebration |
| Change units or easier-today mid-session | No draft loss or rewriting of recorded targets |
| Rest day complete twice | One occurrence; no timer or training UI |
| 20-minute running timer, sleep 10 minutes | Approximately 10 minutes remain |
| Explicitly paused timer, sleep 10 minutes | Same remaining time |
| Early logging, pause, reset, replacement, finish, sign-out | Obsolete rest notification cancelled |
| Permission denied or later revoked | Workout saves; visible honest alert status |
| App killed/reopened offline | Saved workout/drafts recovered consistently, no duplicated result |
| 2,000-session fixture | Query/render budgets verified; no per-tick history work |
| Unilateral left-only result | Partial status, no invented right side or doubled volume |
| Limited plates cannot reach target | Achievable total and shortfall shown, never a silent higher load |
| Light/dark, 360 px, large text, keyboard, screen reader | Current action remains usable and errors readable |

Record a result and evidence for every row. Add a regression test when a discovered
failure represents behavior, persistence or concurrency; do not add tests that merely
assert the implementation's internal shape.

## 11. Android, release and final evidence

Notification permission and exact-alarm access are separate. Verify SDK 57 capabilities
against installed source and official docs before choosing a settings/status API.
Android 14 behavior must be checked on a fresh install, including denied exact-alarm
access and notification permission revocation. The manifest declaration alone is not
evidence that exact scheduling is granted. Do not switch to a different alarm permission
to avoid the user's settings or store requirements.

Keep plain status text: alerts enabled, permission needed, scheduling failed, or delivery
may be delayed. Do not repeatedly prompt at every set. Add a user-initiated settings path
when supported. Check current Play policy for the actual permission/build before release;
do not assert eligibility or a required declaration from memory.

The 5.7 report must identify commit, native build, phone model/OS, install type, relevant
permissions and battery settings. Run airplane-mode logging, background alert, cancellation,
finish/restart offline, then reconnect and verify on a second signed-in phone. Capture
screens for current-set hierarchy, history, corrections, deviations and finish comparison.
A JavaScript export, unit test or browser simulation cannot replace those observations.

Deliver the correction summary with: what changed, before/after evidence, test commands
and results, remaining risks, and exact device follow-ups. Review the result against this
contract. Do not claim an 8.9/10 outcome merely because CI passes.

## 12. References and current checkpoint

Official references checked during design:
- Expo lint/format setup: https://docs.expo.dev/guides/using-eslint/
- Prettier configuration: https://prettier.io/docs/configuration
- React render profiling: https://react.dev/reference/react/Profiler
- Android exact-alarm access changes:
  https://developer.android.com/about/versions/14/changes/schedule-exact-alarms

Use the installed SDK version for implementation APIs. References guide implementation;
they do not replace tests in this repo.

Checkpoint, 20 October 2026: merged Phase 5 source reviewed through GitHub. Correction
branch and design prepared. The execution environment is unavailable, so no package
installation, code correction, local test, device run or performance measurement is
claimed in this checkpoint. The first implementation step after the documentation is
5.8.2, the approved lint/format setup. All executable correction boxes remain open.

## Step 5.8.2 implementation, 21 October 2026

Installed the approved development tools and recorded their versions and compiler compatibility
in D39. Both packages now expose `format`, `format:check` and `lint`. Prettier uses the shared
100-column, single-quote, semicolon and LF configuration. Source/configuration checks exclude
generated environment declarations, bundled data and binary assets. ESLint scans both packages,
enforces one statement per line and fails on warnings. Mobile extends Expo's SDK 57 flat config,
including hooks rules. No feature folders or hooks rules are disabled.

Mechanical formatting was committed separately for backend, workouts, plans, exercises and
shared UI/infrastructure, using the documented formatting exception. Small functional commits
then fixed the misleading starter-command name, imports, a redundant disable comment, JSX copy,
lazy timer initialization, stale timer-restore dependencies and a ref written during render.
Workout reads now check the current auth-store account before publishing results. The wake-lock
warning clears after successful activation; a new regression test checks that confirmation is
not emitted after leaving the screen. Alert error reporting has stable effect dependencies.

Both packages pass formatting, zero-warning lint and typecheck. The backend build passes.
All 321 mobile tests pass locally. Backend database tests use CI's PostgreSQL service under
BUILD_PLAN rule 8 because local PostgreSQL cannot be installed here. CI passed for the tooling
installation and the published workout-effect corrections. The completing commit
adds mandatory format and lint steps to both existing CI jobs; its CI result remains the gate.
Web and Android JavaScript exports pass. These are not APK builds or phone interaction results.

The unrelated local icon modification was excluded from every commit. No workout-history
performance improvement is claimed by this tooling step. Step 5.8.3 is next: bounded reads,
exact relevant history, shared invalidation and isolated clock rendering. The remaining
corrections and the physical 5.7 phone gate remain open; Phase 6 has not started.

## Step 5.8.3 checkpoint, 21 October 2026

Implemented indexed overview and 25-row history-page queries, a two-query single-workout read,
request/account guards, and shared Home/resume reads. The generated fixture contains 0, 50,
500 and 2,000 sessions with up to 40,000 sets. Overview plus first page stays at three queries,
at most 53 returned session rows and no set reads. Query plans use the new indexes without a
temporary ordering tree. Tests cover pagination across tied instants/offsets, ownership,
tombstones, active overflow and migration of populated unsynced data. The detail read returns
one parent and its 20 fixture sets in two queries at both tested history sizes.

The workout route no longer owns ticking state. SessionClock and TimerReadout own display
refreshes, while results and prefills are memoized against their data. Display lifecycle tests
cover 60 seconds of updates, ten minutes hidden, foreground catch-up, explicit pause and late
callbacks after cleanup. Both package checks and all 333 mobile tests pass; web and Android
JavaScript exports pass. CI passed through the display-clock lifecycle commit. Physical
render/save latency and background notification results are still unmeasured.

Step 5.8.3 remains unticked. The active workout hook still fetches the original broad history
on focus/save; the next slice must replace that path with D40's exact relevant-history
projection and aggregate reads. The new history query is data preparation for 5.8.8, not a
claim that a history screen exists. Do not start 5.8.4 or Phase 6 from this checkpoint.

## Step 5.8.3 implementation, 21 October 2026

The broad active-workout hook is removed. The screen now reads one owned session, its results
and exact historical representatives. Prefills and PRs use indexed latest/best lookups with
completion cutoffs, original performance instants, id tie ordering and the candidate's actual
load. Tests compare this path with the full-history functions, including sparse/zero values,
overlapping completions, foreign exercises/accounts and a larger same-instant result that must
not hide an earlier eligible best. Notes-only results perform no comparison query.

SQLite migrations 6 and 7 add only rebuildable local history data and an exercise-id catalog.
Canonical workouts, unsynced edits and tombstones are preserved. Triggers queue invalidations
inside local/sync transactions. Explicit ON CONFLICT DO NOTHING keeps these triggers compatible
with the existing canonical upserts. Repairs process at most 25 sessions per transaction and
insert at most 50 projection rows per statement. Failure rolls back the batch and leaves it
retryable. Comparison reads check freshness and consume their canonical snapshot atomically.
Catalog selection leaves unrelated workouts unprepared until needed; retained old exercise
tags ensure snapshot changes/deletions cannot leave stale indexed results visible.

At 50, 500 and 2,000 sessions, the 20-set fixture's warm detail/comparison read uses five queries
and at most 102 returned rows, independent of its history size. The first preparation reads
40,000 fixture sets in bounded batches, at most 500 per source query. With half the workouts
unrelated, opening the requested exercise reads only 20,000 sets and leaves the other 1,000
workouts queued. Later reads fetch only the current 20 canonical set rows plus the required
representatives. These deterministic row/query checks are not phone latency measurements.

Home and resume controls share the overview; focused queries refresh once at sync completion,
not at both start and finish. Clock state remains in the two small display components, with
no workout-root clock state. A committed write requires a newer successful read before another
set can be logged; read failures preserve the committed write and expose a retry message.
Simulated SQLite clients verify sync corrections, deletion and children arriving before parents.

Both package format/lint/typechecks and the backend build pass. All 357 mobile tests pass.
Web and Android JavaScript exports pass; backend database tests use CI's PostgreSQL service
under rule 8. The completing commit's CI result is the gate. No APK, real-phone timing,
background alert or visual acceptance result is claimed. Those remain in 5.8.12 and 5.7.

Step 5.8.4 is next. Before enabling structural adaptation in 5.8.5/5.8.6, extend the catalog and
projection to the new stable item/slot contracts and add compatibility fixtures; they currently
interpret the original Phase 5 snapshot format. History navigation itself remains in 5.8.8.

## Step 5.8.4 implementation checkpoint, 21 October 2026

Logged sets now have an editor, delete action and one-level Undo in the workout detail route,
for active and completed sessions. Completed-session navigation remains in 5.8.8. Abandoned
sessions remain readable without correction actions. The editor pins the original result and
display units while a draft is open. A failed save keeps the editor and its entered values.
The current-set form stays mounted while editing; session-local, slot/unit-keyed drafts also
survive the current-slot change caused by deleting and undoing an earlier set. Durable draft
recovery across leaving the route or restarting the app remains in 5.8.7.

Transactional commands implement D41. Corrections preserve id, slot, log fields, loggedAt and
session start/end. A full revision fingerprint catches stale values even at equal timestamps.
Deletion produces a tombstone and an exact-revision undo receipt. A newer result or deletion
blocks stale undo. The comparison view offers keeping the saved result or explicitly applying
the proposed values to the newly read revision; a second intervening change is checked again.
The existing post-commit read barrier blocks another mutation if the saved result cannot be
refreshed. It does not report a committed write as a failed save.

History invalidation uses the existing canonical-row triggers. Corrected values recalculate
volume and records through the same bounded detail reader. Editing clears the live PR
acknowledgement and does not start another timer. New automatic rests carry a local source
set id; deleting that source clears rest, and restart reconciliation cancels an existing
request whose source is gone. Manual and legacy unlinked timers remain available with an
explicit clear action. Undo does not start a rest timer.

Validation: 371 mobile tests pass, including real SQLite correction/delete/undo, failed-write
rollback, unchanged performance/session times, zero versus missing values and exact cache
invalidation. A two-client fake-server regression corrects 80 to 60 kg offline, verifies 480 kg
volume after sync, deletes and restores the same result, then refuses stale undo after a newer
70 kg result arrives. The alert-port regression verifies source deletion cancels the request
without rescheduling after edit. These are simulated clients and ports, not physical phones.

Both packages pass format, lint and typecheck; the backend build and web/Android JavaScript
exports pass. PostgreSQL tests use CI under rule 8. The completing commit's green CI is the
gate. No visual interaction check is claimed: the available Playwright runtime had no browser,
and its browser download returned invalid archives. Visual acceptance remains in 5.8.12;
the native timer/permission matrix and real Android check remain in 5.8.11 and 5.7.

Step 5.8.5 is next. Preserve the legacy result path and extend cache invalidation/catalog
coverage before structural session adaptation is enabled. Phase 6 has not started.

## Step 5.8.5 partial checkpoint, 21 October 2026

This step remains unticked. D42 defines staged sync negotiation; D43 and
WORKOUT_STRUCTURE_CONTRACT.md define the exact additive item/result shape and deterministic
slot identities. The schema fixtures were committed before migrations. Existing planned slot
ids remain unchanged after display reordering, and added/replacement occurrences have distinct
namespaces. Pure target capture records difficulty/easier-adjusted targets without inventing
historical targets or guessing a weight. Stable record validators check identity, selected
values, captured slot bounds and session times while retaining performed work after an item
is skipped, removed, tombstoned or reduced.

The authenticated capabilities endpoint and client preflight are implemented. Negotiation runs
before media upload, push or pull. Tests cover old/missing/malformed capability responses,
feature requirements, whole-request unsupported versions, unchanged dirty rows/cursors on
failure, successful retry and sign-out during negotiation. During preparation the server still
accepts protocols 1 and 2 with minimum 1 and no structural feature. This preserves old-client
sync while no new collection or result variant is exposed.

SQLite migration 8 adds session_items and rebuilds set_logs to permit a null original position,
with nullable result metadata. It copies the legacy columns exactly and restores the set
indexes/dirty triggers. Item triggers transactionally queue history invalidations and retain
old/new exercise catalog tags. Populated fixtures preserve active/completed sessions, dirty
and clean sets, tombstones, repeated exercise occurrences and the existing dirty queue. Tests
also cover migration retry, integrity_check, transactional rollback and repeated upserts.

PostgreSQL migration 0005 adds the item table and nullable metadata columns. Its generated
Drizzle snapshot accounts for most lines in that isolated migration commit. The legacy
exercise_position constraint remains unchanged until result serialization is switched to the
tested union in a later migration/cutover slice. No structural records are registered for
sync or created through app controls at this checkpoint.

All 389 mobile tests pass. Both packages pass format, lint and typecheck; the backend build,
six supplemental pure backend contract tests and full PostgreSQL CI pass. The full database
suite remains the gate under rule 8. The SQLite and PostgreSQL migration commits both have
green CI. Earlier workout UI changes also passed web/Android JavaScript exports; these storage
changes do not claim an APK, visual check or physical-phone test.

Next within 5.8.5: owned item/result readers and effective legacy/stable views, updated history
projection/catalog reads, complete sync mappings and compatibility fixtures, then the atomic
minimum-version/feature cutover. Require read equivalence and pending-data preservation before
ticking the step. Adaptation commands/UI remain in 5.8.6. Phase 6 has not started.

## Step 5.8.5 reader and command checkpoint, 21 October 2026

Step 5.8.5 remains unticked. D44 defines the effective read eligibility rules and D45 defines
new-performance logging. The following work is committed in small, separate changes:

- Shared revision resolution preserves numeric edit-time ordering, tombstone precedence and
  deterministic ties. Resolve legacy/stable results together before filtering eligibility.
  Timestamp parsing is reused within each read batch, without a global mutable cache.
- Effective item views adapt the original routine without writing canonical item rows. They
  retain removed/skipped/tombstoned context, reject replacement cycles and missing parents,
  and report malformed overrides instead of silently restoring original work.
- Owned SQLite reads return canonical records, unavailable ids and effective result views.
  Added results keep null original positions. Results arriving before their items become
  readable when the owned item arrives. Deleted parents hide late children.
- Legacy and stable results share volume, sparse prefill and PR calculations. Original target
  snapshots remain unchanged; legacy performance targets remain unknown. Progress counts current
  target slots separately from extra actual work, retains its volume and blocks next-work
  selection/record celebrations when current data is incomplete.
- History rebuilding joins item/result rows in batches of at most 25 sessions, with no query per
  session. Stable results enter and leave the exact exercise projection through existing dirty
  triggers/catalog tags. Removed/reduced items retain valid actual results. Comparison queries
  use the performed exercise identity, including after future fields change to notes-only.
- The new structured detail reader prepares owned data and exact comparisons in one transaction.
  Its small warm fixture uses six queries with one parent read and one result read. Relevant
  exercise requests are chunked below SQLite's older 999-parameter limit.
- Correction/delete/undo now preserve stable metadata and include every captured target in the
  revision fingerprint. SQLite regressions cover added, removed and reduced occurrences, equal
  edit-time metadata conflicts, cache rebuilding and unchanged performance/session times.
  Correction forms use performance fields rather than a later item's field selection.
- Finishing checks all live stable/legacy logging times, including explicitly incomplete sets,
  and rejects incomplete reads. Session deletion tombstones owned items. Legacy saves cannot
  overwrite stable metadata. New stable logging checks the reviewed item/settings, commits
  atomically, refuses replacement of live saved results and safely reuses explicitly deleted
  slots. Rollback restores both the canonical row and its derived invalidation.
- Prepared sync mappings round-trip item snapshots, nullable positions, stable targets and
  tombstones. Absent legacy target metadata stays SQL NULL, while existing JSON-list defaults
  stay unchanged. These new collection mappings are not registered yet.

Validation: all 440 mobile tests pass. Both packages pass format, lint and typecheck, and the
backend build and six supplemental pure backend tests pass. PostgreSQL CI remains the full
backend gate under rule 8. Web and Android JavaScript exports pass for the correction-component
changes. These checks do not claim a visual inspection, APK or physical-phone result.

The 40,000-set regressions exposed repeated item/identity validation and timestamp parsing;
both were reduced in separate performance fixes. A later CI run timed out while one
test combined fixture generation and both targeted cold repairs under five seconds. A local
Node/SQLite profile measured about 1.09 seconds for seeding, 1.25 seconds for related preparation,
21 milliseconds for the warm read and 1.09 seconds for the other exercise's preparation. These
are single host measurements, not phone latency or p95 guarantees. Fixture setup now runs in a
hook and the 50/500/2000-session cases run separately. All query/row-count assertions and the
five-second test limit remain. CI passed the adjusted harness and subsequent correction tests.

The app still uses its legacy logging/detail route. Stable logging, structured detail/progress
and the prepared mappings are tested foundations, not exposed adaptation controls. The server
still advertises minimum protocol 1 and no structural feature; the client required-feature list
is still empty. Do not deploy or describe this checkpoint as the completed compatibility slice.

Next within 5.8.5:

1. Register client mappings with the mandatory workout_structure_v1 preflight. Prove failed
   negotiation retains new and legacy dirty rows, tombstones and cursors before any upload.
2. Adopt structured detail/progress and stable logging in the hook/screen and alert read port.
   Keep incomplete saved results editable, preserve performance fields and pin an open editor
   if its item becomes unavailable. Do not add the 5.8.6 adaptation controls in this slice.
3. Complete backend item/result mappings, the nullable-position migration and D42's minimum-2
   feature cutover. Reject old-client whole requests before processing records or pull pages.
   Deployment remains server first, then app; do not reset local storage or sync cursors.
4. Run mixed legacy/stable two-client compatibility, ownership, arrival-order and dirty-data
   regressions, confirm full CI and tick 5.8.5 only in its completing commit. Then start 5.8.6.


## Step 5.8.5 completion, 21 October 2026

Stable item/slot storage, readers, logging and sync compatibility are connected. The original
routine snapshot and every legacy set identity remain intact. Normal new performance captures
its effective targets, chosen fields, original item link and logging time. Logging rechecks the
reviewed item and difficulty revision in the write transaction; a live saved slot requires
correction or explicit deletion rather than silent replacement.

The workout route uses the owned structured detail reader and stable logging command. Valid
incomplete results remain in Logged sets for correction but contribute no completion, volume
or records. An open correction retains the reviewed exercise form if a later read becomes
unavailable. Unreadable or orphaned structural records show an incomplete-data message and
block new performance and finishing until they resolve. Already performed work remains
attributed to its original exercise when current item state or targets change.

Both sync registries now include session_items and the result union. Absent legacy metadata
stays SQL NULL, never a fabricated target. PostgreSQL migration 0006 permits null original
positions; its isolated populated-table regression preserves live legacy rows and tombstones.
The server requires protocol 2 before validating a push envelope or returning a pull page and
advertises workout_structure_v1. The client requires that feature before media work, push,
acknowledgement or pull. Deploy the server before the app without clearing local data or
resetting cursors. Old apps receive HTTP 426 and retain pending local work until upgraded.

Added acceptance evidence:

- Failed protocol-2 feature negotiation leaves seven mixed dirty records and a nonzero cursor
  unchanged. After support returns, both variants and item/result tombstones reach another
  phone with zero values and exact performance metadata preserved.
- Two offline phones add independent occurrences of the same exercise. Both survive sync.
  Concurrent display reorder and result edit/delete converge using existing latest-edit rules;
  Undo restores the same slot and original performance time. The routine is unchanged.
- PostgreSQL API regressions cover legacy/stable round trips, whole-request old-client rejection,
  foreign ownership protection, partial-metadata rejection, stale tombstone revival and
  child-before-item-before-session pagination through one cursor.
- Rest-alert recovery reads stable sources, including added exercises with null original
  positions. Value correction keeps the original timer; incomplete/deleted sources and ended
  or unavailable workouts are ineligible. This is read-port coverage, not a physical alert test.
- Legacy and structured warm detail comparisons are checked at 50, 500 and 2,000 workouts of
  20 sets. Structured reads use six queries and return at most 102 rows for this fixture.
  Cold preparation retains the 25-session/500-result batch assertions. Cache construction is
  fixture setup for the warm checks; their default five-second timeout is unchanged. A local
  CPU profile also showed first-use cache construction remains materially more expensive than
  warm reads. No phone latency or p95 claim is made from this host.

Validation: 449 mobile tests pass locally, both packages pass formatting/lint/typecheck,
backend build and six supplemental pure backend tests pass, and all 125 backend tests pass
in PostgreSQL CI, which is the
backend gate under Build Plan rule 8. Both jobs passed for commit 67cc792 in CI run
39672695150. Current web and Android JavaScript exports pass. These
exports are not APK builds, visual interaction checks or proof of background notifications.

PR #9 was already merged into rebuild before these later commits. The remaining work is in
new draft PR #10: https://github.com/Pietrols/ProFit/pull/10. Each logical change has a separate
commit and push; the generated Drizzle snapshot is kept in its migration commit.

Next is 5.8.6: selection, do-later, skip/restore, add/remove/replace, independent display order
and future set-count changes. Do not rewrite the routine or any performed identity. UI hierarchy,
steppers, durable drafts, history screens and native acceptance remain in their ordered steps.
Phase 6 has not started. The physical 5.7 gate remains open.


## Step 5.8.6 completion, 21 October 2026

The workout's expandable exercise overview now offers Train now, Do later, skip/restore,
remove/restore, move up/down, add, replace, future set-count changes and target/field editing.
The screen labels these actions For this workout. The exercise picker reuses the existing
library search, custom exercises and row component; target editing reuses the plan editor's
fields and numeric parser. No dependency was added.

Selection chooses the first pending slot of the chosen active exercise. It falls back to the
normal queue when that item has no pending work and keeps incomplete saved slots reviewable.
Draft keys remain stable slot/unit keys, so changing selection within the mounted workout keeps
the previous set draft. The add/replace editor stays in that screen rather than navigating away.
Durable draft storage and restart/unit behavior remain in 5.8.7; this is not a persistence claim.

D46 commands validate the owned active session, complete data, reviewed item and (for moves)
reviewed order inside one transaction. They write only item overrides and their derived-history
invalidations. Failures roll back the entire group. Source rows, set identities, performance
metadata, the original snapshot and saved plan are retained. New additions and replacements
have independent device ids; replacement links to the omitted source rather than transferring
its values. No draft weight is copied from the source exercise to a replacement.

Skip and remove confirm the omission of remaining work with an optional reason. Restore returns
the same item. A local set-count reduction refuses a live saved tail slot, including incomplete
work; the UI disables removal when that final slot is already saved. Valid late synced results
remain actuals beyond current targets. Original completed/omitted targets and additional logged
work are counted separately. An all-skipped workout says No sets logged rather than claiming
that its original targets were met.

Evidence:

- Pure selection, item changes, move and addition/replacement tests cover boundaries, stale
  revisions, unknown data, ended workouts, independent identities and input immutability.
- Real SQLite tests verify ownership, atomic multi-item replacement, retry after a failure in
  the second write, foreign-id collision rollback and unchanged original results/snapshots.
- The integrated busy-gym regression selects rows, defers/skips bench work, adds a plank,
  reduces its future set count, replaces remaining row work and finishes. It verifies six
  original target slots, two original completions, four omissions and two added completions.
  Historical target counts and original performance times remain intact; ended sessions reject
  further adjustments. This exercises commands/read models, not rendered taps.
- Both packages pass formatting, lint and typecheck. All 474 mobile tests and all 125 backend
  tests pass in CI for c39dbe6, push run 39677546283 and PR run 39677552924. Backend build and
  six supplemental pure tests also pass locally under the no-local-Postgres rule.
- Fresh web and Android JavaScript exports pass after the controls are connected. No APK,
  rendered interaction, real-phone notification or populated-phone latency result is claimed.

Small commits preserve each tested change, including separate command, storage, parser,
shared-form, screen and integrated-regression commits. Draft PR #10 contains these changes.

Next is 5.8.7: current-set hierarchy, relevant timer and next-exercise preview, compact overview,
unit-safe weight/reps steppers and durable draft recovery. History/comparison screens and the
remaining native/visual acceptance stay in their ordered correction steps. Phase 6 has not
started and the physical 5.7 gate remains open.

## Step 5.8.7 implementation checkpoint, 21 October 2026

PR #10 was merged into rebuild before this session. The new logging-flow changes are in
draft PR #11: https://github.com/Pietrols/ProFit/pull/11. Step 5.8.7 remains unticked because
its small-screen, keyboard and accessibility product checks have not been run. Do not proceed
to 5.8.8 or treat this checkpoint as the phase's Done-when result.

### Implemented behavior

- The current exercise, set number, progress, active timer and logging form precede the session
  clock and timer configuration. The active timer remains visible after the last pending set.
  Clock ticks stay inside their readout components. Timer settings remain collapsible.
- Separate previews show the next pending set and next exercise occurrence, wrapping to earlier
  deferred work. Skipped, removed, completed and unavailable work is excluded appropriately.
- The exercise overview is collapsed initially. Each occurrence has an ordinal, status,
  Train-now action and expandable adjustments. Choosing another exercise scrolls to its current
  set card. Display order never becomes a draft or performance identity.
- Reps and weight retain direct text entry and gain minus/plus controls. Defaults are one rep,
  2.5 kg or 5 lb; a visible weight-step control exposes other increments. Decimal-digit integer
  arithmetic prevents drift. Blank, zero, malformed text, comma decimals and upper bounds are
  handled explicitly. Buttons provide increment/unit labels and disabled accessibility state.
- New-set and correction drafts use the existing local key-value port, backed by SQLite on
  native devices. Account/session/item/slot keys isolate inputs. Display units, exact canonical
  prefills and raw custom-field text are preserved. Changing profile units, easier-today or
  receiving fresh workout data does not reinterpret an existing draft. Only selected fields
  are submitted. New drafts use the current unit preference.
- Writes are serialized across form remounts. Recovery completes before editing is enabled;
  failed reads do not overwrite storage. Failed writes keep the latest text in memory with a
  retry action. The UI distinguishes saving, saved and failed persistence. A forced shutdown
  before an outstanding write completes can only recover the last durable version.
- Result revision checks include corrections and tombstones. If performance commits before
  draft cleanup, the saved slot takes precedence after restart and cannot be logged twice.
  Explicit deletion starts a fresh draft revision instead of reviving obsolete input.
- Unreadable drafts have Retry and a separate confirmed discard action for that slot. The
  warning states that unsaved input is lost and saved results are kept. A synchronous submit
  guard prevents rapid duplicate form submissions. Keyboard taps on controls are handled by
  the scroll container rather than consumed only to dismiss the keyboard.

### Automated evidence

- Both packages pass formatting, lint and typecheck. All 496 mobile tests pass locally across
  77 files. Backend build and six supplemental pure tests pass locally; full database tests use
  CI under BUILD_PLAN rule 8 because this environment has no local Postgres.
- Code head 9f59c74 passes push run 39682622518 and PR run 39682628742. Backend CI runs all 125
  tests against PostgreSQL. New tests cover decimal bounds/drift, scoped recovery, ordered
  writes, storage errors, next-exercise previews and a combined database/draft scenario.
- That combined scenario selects another exercise, reorders work, changes easier-today,
  recovers the original units and entered values, commits performance, simulates a crash
  before cleanup, rejects duplicate logging and verifies deletion changes the draft revision.
  These are storage and logic checks, not rendered interaction checks.
- Fresh web and Android JavaScript exports pass. These are neither an APK nor a phone test.
  No runtime dependency was added. Eleven small tested implementation/test commits were
  pushed before this documentation checkpoint; no merged history was rewritten.

### Remaining product acceptance for 5.8.7

1. On 320-pixel and 390-pixel widths, in light/dark themes and large text, verify the current
   set, timer and Log-set action are usable without scrolling through configuration. Check
   long exercise names and every chosen logging field without overlap or truncated controls.
2. With the native numeric keyboard open, type a weight, tap minus/plus rapidly, choose an
   increment and log. Each control must act on the first tap. Check blank/zero/comma/invalid
   input, busy controls, validation errors and an incomplete saved set's correction path.
3. Enter distinct bench and row drafts. Select/defer/reorder/skip/restore work, edit a saved
   result, change units/easier-today and receive sync. Return to each draft and verify its
   text, labels and intended slot. Kill/reopen offline after Saved-on-this-phone appears.
4. With a screen reader, verify numeric input labels, increment/unit announcements, disabled
   state, expanded/collapsed actions and distinguishable duplicate exercise occurrences.
   Check focus and the return to the current card after selecting another exercise.
5. Switch accounts while recovery is pending. No prior-account draft may flash or be saved
   under the new account. Exercise disk read/write errors and confirmed unreadable-draft
   discard through the rendered UI, preserving other slots and every saved result.

No browser executable or native device was available for these checks in this environment.
Keep their acceptance status open. History, rest-day shortcuts, plate/per-side logging and
notification/exact-alarm checks remain in their ordered steps. Phase 6 has not started.

## Step 5.8.7 rendered-browser checkpoint, 22 October 2026

PR #11 has merged. Follow-up work is in draft PR #12:
https://github.com/Pietrols/ProFit/pull/12. Nine small commits add the browser harness, tested
fixtures and fixes found during visual review. No dependency was added. Step 5.8.7 remains open
for the native and account-switch acceptance below; do not proceed to 5.8.8 yet.

### How the rendered checks run

The new workout-browser CI job exports the actual mobile web app against a disposable,
loopback-only API. It uses D24's isolation headers, the existing fake sync server, real browser
SQLite/localStorage and Chrome/ChromeDriver already present on the runner. Node's built-in
fetch drives WebDriver. It never signs in to a real account or uses production data.

Both packages still run format, lint, typecheck and their existing suites. The backend job also
checks harness formatting and runs two Node tests covering fixture isolation and driver failure
handling. Browser assertions fail CI, with screenshots, accessibility-tree JSON and diagnostics
uploaded as workout-browser-evidence even on a failed run. The workflow contains the exact
export, fixture server and driver commands for reproducing the check with an existing browser.

### Findings and corrective changes

Visual review exposed narrower-than-44-pixel stepper buttons and 40-pixel increment choices.
Button and ChipGroup now enforce the existing touchTarget token in both dimensions. Browser
checks measure all four stepper controls and the expanded increment choices, then choose a
different increment and restore the default.

The second set also showed a blank weight immediately after logging 60 kg. New drafts now
include eligible resolved results from the current workout when choosing the same exercise's
latest values. Planned targets still take priority, zero load remains valid, and notes/effort/
done are not copied. A deleted/incomplete result or a different exercise cannot supply that
load. Existing drafts remain unchanged. D49 and four pure regression tests record this rule.
No additional database read or broader history scan was introduced.

### Verified evidence

- Code 4d3fad4 passes all three jobs in PR CI run 39740405281: backend, mobile and workout-browser.
  All 500 mobile tests across 78 files, 125 PostgreSQL backend tests, package tooling checks,
  backend build and the two additional fixture/driver tests pass.
- A fresh Android JavaScript export also passes after the fixes. This is not an APK, native
  keyboard test or physical phone result.
- All four 320/390-pixel by dark/light cases pass. Normal logging precedes configuration and
  fits within an 844-pixel viewport, with no horizontal page overflow. Tests inspect accessible
  increment labels, measured touch targets, increment choice and comma-decimal edits.
- Exercise selection returns the current heading into view. Independent bench/row drafts
  survive selection, offline reload and reconnect. Offline logging advances the slot once,
  creates one synced result and prefills the next weight with 60 kg.
- The 320-dark case additionally passes defer, skip with reason, restore and reorder while
  retaining the row draft. Easier-today preserves the entered reps; a profile unit change keeps
  existing drafts metric while a new occurrence uses pounds, a 5 lb step and its gentler target.
- Rendered storage failures also pass: failed writes keep typed input, save retry succeeds,
  failed reads block editing, read retry recovers the draft, cancelled discard leaves corrupt
  data intact and confirmed discard recovers from saved work. Another slot's draft survives.
- The initial browser artifact was visually inspected, then updated screenshots were inspected
  after the fixes. Evidence artifact 12408873104 belongs to the passing PR run. It contains
  current-set, selected-exercise, custom-field, rest, enlarged-text and pinned-unit screenshots.
  Screenshot review confirms the corrected next-set weight and narrow-width layout. DOM text
  enlargement is a browser check, not native font-scale or screen-reader acceptance.

### Remaining acceptance and next action

On the corrected native build, run the numeric-keyboard scenarios from the previous checkpoint,
including first-tap logging/stepping, rapid taps, malformed/blank/zero input, busy state and
validation errors. Use native large-text settings and a screen reader to verify labels, focus,
announcements and reachable actions with long names and custom fields. Browser accessible-name
checks do not prove spoken output or native focus behavior.

The rendered account-switch-during-recovery scenario is still open. Existing scoped storage and
read-owner tests pass, but do not substitute those for observing an actual account transition.
Record these results before ticking 5.8.7. Physical airplane-mode/background notifications remain
the final 5.7 gate; browser reload is not a physical app-kill test. Phase 6 has not started.
