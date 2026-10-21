# Phase 5: Guided workout and timers

**Done when:** complete a logged session in airplane mode; the rest alert fires with the app
in the background.

## The model

Use the Phase 3 exercise module, hook and screen patterns, and the Phase 2 sync engine.
Add Drizzle tables and a generated migration, matching SQLite tables and a numbered migration,
and entries in both sync collection registries. Tests use the existing real SQLite driver,
fake sync server and backend Postgres route fixtures.

| Record | Fields beyond the existing sync columns |
|---|---|
| `workout_sessions` | plan id, day id, local start date, start time, end time or null, status (`active`, `completed`, `abandoned`), notes, easier-today flag, day snapshot |
| `set_logs` | session id, snapshot exercise position, set index, logged time, chosen log fields, values |
| Local workout state | user id, session id, timer state, notification id and generation; never synced |

- Sessions use `randomId()`. Sets use UUIDv5 from session id, snapshot exercise position and
  set index, so retrying a tap updates the same set. A new attempt at a workout gets a new session.
- A session snapshot contains plan/day names, plan difficulty and ordered exercises with ids,
  names, Standard targets, sets, rest seconds and chosen fields. Deleting or editing a plan or
  custom exercise must not rewrite a workout already started. Bound snapshots to 100 exercises;
  show a validation error before starting a larger day, preserving the plan.
- Values use the existing field names: reps, weight, time, distance, rest, RPE, notes and done.
  Store only selected fields with actual values; never persist hidden prefill values. Weight
  is kg, time and rest are seconds, distance is metres. Display uses the profile's units.
- Validate on phone and server: finite numbers, reps an integer 0 to 1000, weight 0 to 2000 kg,
  time 0 to 86400 seconds, distance 0 to 1000000 metres, rest 0 to 3600 seconds, RPE 0 to 10,
  notes at most 2000 characters, done a boolean. Selected fields are unique and nonempty.
  Reject unknown value keys and unselected fields. Zero is a value, not a missing input.
- Logging requires a numeric result, nonempty notes or `done: true`, including notes-only plans.
  Blank optional fields stay absent. The log action itself records completion when `done` is
  not selected; explicitly false `done` does not count as a completed set.
- Session end cannot precede start. Active sessions have no end; completed or abandoned ones
  have an end. Abandoned sessions retain their logs but do not advance the plan or contribute PRs.
- Follow D30 soft links and ownership-scoped queries. Out-of-order sets remain hidden until
  their session arrives. Validate set position and index against the owned session snapshot
  when reading; never trust a join by id alone. Deleting a session tombstones existing sets,
  and later arriving sets stay hidden. Deleting a plan does not delete session history.
- Local writes run in the existing database transaction queue, mark rows dirty, then notify
  sync. Finishing commits the end time and status before navigating. Sync failure never loses
  the saved workout. Refresh hooks on focus and after sync, like `useExerciseLibrary`.
- Resume an existing active session before starting another on this phone. If offline phones
  produce multiple active sessions, show a choice; never silently discard either. Remote
  timers and alerts are not started automatically on this phone.

## Pure workout functions (tested)

All functions receive data and time explicitly. No database, clock, router or notification
calls belong in these functions. Form validation returns field errors rather than throwing.

```
validateSession(input), validateSet(input, snapshot):
  check the model limits, dates, status and snapshot structure
  require the set position/index to exist in the snapshot
  reject unknown or unselected values; return field errors

sessionSnapshot(plan, day, exercises, exerciseNames):
  sort exercises by position then id; copy names, ids, Standard targets and selected fields
  retain the original difficulty; do not keep references to mutable plan objects
  rest days snapshot no exercises; missing names or invalid targets block starting

sessionTargets(snapshotExercise, difficulty, easierToday):
  use Phase 4 scaleTargets with gentle when easierToday, otherwise the saved difficulty
  always scale from Standard, never from an already rounded result

prefill(snapshotExercise, targets, history, before):
  keep valid completed logs for this exercise from completed sessions owned by this user
  require those sessions to end by the supplied cutoff
  order by logged time then id; for each selected numeric field find its last recorded value
  prefer explicit target reps/time/distance and configured rest over history
  use history for weight and numeric fields without a target; otherwise leave blank
  never prefill notes, RPE or done; return only selected fields

completedSets(session, logs):
  pick the latest edit per log id before filtering tombstones and incomplete copies
  keep only this session's deterministic slot ids, valid selected fields and in-session times
  exclude done=false; return in exercise and set order

workoutProgress(session, logs):
  total = sum of planned sets; completed = count(completedSets)
  next = first missing exercise/set slot; return counts and next, or null when finished

estimatedOneRepMax(weightKg, reps):
  require positive weight and integer reps from 1 through 10, otherwise return null
  one rep -> weight; otherwise weight * (1 + reps / 30)

personalRecords(candidate, previousLogs):
  compare only the same exercise id, valid completed sets and chronological earlier logs
  evaluate heaviest positive weight, most reps at exactly the same stored weight,
    estimatedOneRepMax, and longest positive time when their required fields exist
  explicit zero reps disqualifies a load PR; missing weight is never inferred
  a first eligible value establishes a record; ties do not create another record
  return metric, value and previous best (or null); round only for display

sessionVolume(session, logs):
  sum weightKg * reps for completed sets containing both fields
  missing weight contributes zero; never estimate body weight or machine resistance

sessionSummary(session, logs, earlierHistory, now):
  return completed/planned sets, elapsed time, volume and records
  compare each set with sessions completed by its session start and earlier sets in this session
  ignore abandoned sessions and tombstones; edits cause records to be recomputed

lastCompletion(planId, sessions):
  choose latest completed matching session by end time then id
  return { planId, dayId, date: local start date } for Phase 4 todaysDay
  active and abandoned sessions never advance a cycle
```

D33 records these defaults. A partially logged session can be finished after a confirmation
showing the missing set count; it advances the cycle once. An empty training day cannot start.
A cycle rest day offers "Rest day complete": save a completed session with an empty snapshot
and no sets, so the next cycle day becomes available. Weekly missing days need no record.
The daily habit still has no completion logging until Phase 6.

## Timer engine (pure functions, tested)

Timer state contains mode, validated configuration, accumulated milliseconds, running-since
Unix milliseconds or null, and a generation id. Persist transitions locally, not every tick.
Rendering may refresh on an interval, but the interval never counts elapsed seconds.

```
validateTimer(config):
  accept rest, interval, Tabata, EMOM, AMRAP, stopwatch or session clock
  require positive whole-second durations up to 86400 and rounds from 1 through 1000
  interval rest may be zero; reject nonfinite numbers and unknown modes

startTimer(config, now, generation):
  validate; return accumulated=0, runningSince=now and the supplied generation

elapsed(timer, now):
  return accumulated + (runningSince is null ? 0 : max(0, now - runningSince))

pauseTimer(timer, now):
  store elapsed(timer, now); clear runningSince; repeated pause is unchanged

resumeTimer(timer, now):
  when paused set runningSince=now; when running leave unchanged

resetTimer(timer, generation):
  clear elapsed, leave paused, replace generation so old alerts cannot match

timerView(timer, now):
  rest/AMRAP: remaining = max(0, duration - elapsed); done at exact duration
  interval: walk work/rest segments for the configured rounds, with no final rest
  Tabata: interval preset of 20 seconds work, 10 seconds rest, 8 rounds
  EMOM: rounds of 60 seconds; show round and time until the next minute
  stopwatch/session clock: elapsed only, with no scheduled end
  return segment, round, remaining, elapsed and done
  exact boundaries belong to the next segment; jump directly over slept-through segments

restDeadline(timer, now):
  return null unless a rest countdown is running with positive time remaining
  otherwise return now + remaining milliseconds from timerView

restAlertIntent(timer, savedAlert, now):
  derive desired generation and deadline, or none
  matching saved alert -> keep; obsolete alert -> cancel; future rest -> schedule
```

The session clock uses the persisted session start and end timestamps and cannot be paused.
Other timers can pause/resume/reset. Wall-clock changes clamp negative elapsed time to zero;
manual clock changes can affect timing and must be documented, not hidden by tick counting.
Test exact boundaries, zero rest, final round, long sleeps, repeated transitions and invalid
configuration. Test session duration separately from paused exercise timers.

## Phone effects and background rest alert

After a set commits, cancel the previous rest alert and start a new rest countdown using the
snapshot rest duration. A zero rest duration schedules nothing. Logging the next set first,
pausing/resetting rest, replacing the timer, finishing, abandoning or signing out cancels it.
Persist the timer so returning from sleep or restarting the app restores the correct display.

A small adapter applies `restAlertIntent` to the operating system. Serialize schedule/cancel
operations, persist notification ids and tag requests by user/session/generation. Reconcile
pending tagged notifications at launch to remove stale requests after a crash. If an async
schedule completes for an obsolete generation, immediately cancel that returned id. A denied
permission or scheduling failure leaves the workout saved and shows that background alerts
are unavailable. Do not promise web or operating-system-suppressed delivery.

Keep the screen awake only while a workout is active and visible. Release it on leaving the
workout, finish and sign-out. Neither keep-awake nor background JavaScript is the rest clock.

**Dependency approval required:** `expo-keep-awake` is not a direct mobile dependency and
`expo-notifications` is absent. Ask Peter before adding either in steps 5.5 and 5.6; this plan
is not approval. Before implementation, read their SDK 57 documentation and install approved
versions from Expo's bundled module manifest. Confirm Android notification permissions,
channel and scheduling requirements from those docs before choosing the adapter APIs.

## API additions

```
POST /sync/push   adds workout_sessions and set_logs to existing changes
GET /sync/pull    returns both collections through the existing shared version cursor
```

No workout-specific network endpoint is needed. Reuse strict Zod validation, per-user locks,
LWW timestamps, tombstones, rejection reporting and the existing 500-record batch limits.
Test both collections for round trips, retries, ownership, malformed fields, tombstones and
pagination. Do not let missing or foreign parent references expose another user's records.

## Screens

- **Home and plan day:** Start workout, or Resume when one is active. Home supplies the latest
  completion to `todaysDay`; rest days show the explicit completion action described above.
- **Workout:** current exercise and set first, editable selected fields with prefill, large
  Log set button, completed/planned count, timer and next exercise. A filled set takes one tap;
  a done-only set can be checked and logged in at most two. Show PR feedback after saving.
- **Workout controls:** timer mode/configuration, set notes only when selected, session notes,
  easier-today switch, finish and confirmed abandon. Easier today changes future prefills,
  never saved logs or the plan. Manual edits to the current draft are not overwritten.
- **Finish summary:** completed sets, duration, volume and PRs, plus pending/offline sync state.
  Show a clear message when no eligible PR or volume data exists.

Routes stay in `src/app`; storage, pure logic, effects and hooks live in `features/workouts`.
Use the existing UI components and theme tokens. Every screen has loading, empty, retryable
error and missing/deleted-record states. Preserve drafts when showing a save error and guard
repeat taps while a transaction is pending.

## Validation and phone handoff

After every step run both typechecks and test suites. Follow BUILD_PLAN rule 8 for Postgres
when it cannot run locally, and require green backend CI before calling a step complete.
Add tests alongside each slice, including real SQLite persistence/reopen, migration from
Phase 4, offline retry, two-phone sync, selected-field filtering and deleted-plan history.

For the done-when check Peter must use a real Android development build: start in airplane
mode, log several field combinations, background during rest and hear/see its scheduled alert,
return after the deadline and verify the timer, then finish and restart the app offline.
Reconnect and verify the session and sets once on a second signed-in phone. Also check early
logging cancels the old alert, denied permissions, keep-awake release, small-screen keyboard
behaviour, light/dark themes and account switching. Record the actual device/build and results
at the bottom of this file. Browser tests cannot establish background notification delivery.

## Not in this phase

- Automatic progression, training recommendations, streaks and daily habit completion: Phase 6.
- Charts and long-term records dashboards: Phase 8.
- Nutrition, sharing, AI plans and exercise substitutions.
- Wearables, remote push alerts, background workout execution or a new sync protocol.
- Dependency installation without Peter's approval.

## Implementation checkpoint

Step 5.1 was committed before code and passed both CI jobs. Step 5.2 adds the session and set
tables, generated Postgres migration, SQLite migration, strict sync records and the tested
mobile storage module. Both typechecks and 244 mobile tests pass locally, including SQLite
reopen, migration, offline retry and two-phone sync. Backend integration uses PostgreSQL 16
in CI under BUILD_PLAN rule 8; local Postgres remains unavailable. No dependency was added.

Step 5.3 adds the pure snapshot, target, prefill, progress, PR, volume, summary and completion
functions with 31 additional tests. Both typechecks and all 275 mobile tests pass locally.
Backend execution still requires the rule 8 CI gate. D34 records history cutoffs, timestamp
ordering, incomplete-set handling and zero/missing values. No UI or dependency changes are
part of this step. The timer engine remains the next step, 5.4.

The lint command was attempted for step 5.3. It asks to install missing ESLint configuration
and dependencies; installation was declined under Peter's dependency rule. No lint success
is claimed. The previously documented ESLint approval question remains open.

Step 5.4 implements all seven timestamp timer modes, pause/resume/reset, restoration
validation and pure rest-alert scheduling intent. Twenty new tests cover exact boundaries,
long sleeps, final-round behaviour, clock rollback, invalid state and stale alert replacement.
Both typechecks and 295 mobile tests pass locally; backend tests require the rule 8 CI gate.
No notification or keep-awake dependency has been added.

Additional pure timer helpers:

```
readTimer(value): validate configuration, timestamps and generation; return a copy or null
sessionClock(start, end, now): validate timestamps; max(0, (end or now) - start)
formatTimer(milliseconds, countdown): clamp at zero; ceil countdown seconds, floor elapsed;
  format minutes:seconds, including hours for long sessions
```

A timer reset requires a new generation. Session clocks cannot pause or reset. Tabata has
eight work periods and seven rest periods, matching the no-final-rest rule above.

## Step 5.5 preparation, approval still required

The dependency-free workout flow is implemented: start/resume from Home or a plan day,
current-set logging, unit-aware prefills, set/session notes, easier-today for future drafts,
PR feedback, finish/abandon confirmation and summary. Home now advances from completed
sessions. The foreground timer controls use the pure engine and persist transitions per
user/session through the existing key-value store (SQLite on native). Advanced timer settings
are collapsed initially. Saves guard repeat taps and keep the current draft on errors.

Pure form helpers added with tests:

```
setDraft(values, units): convert kg/metres for display, round numeric input text to 3 decimals
parseSetDraft(draft, fields, units, original): keep only selected nonblank fields; reject
  malformed numbers; convert edited values to storage units; retain exact original numbers
  when their displayed text is unchanged; never infer done from an unchecked button
fieldLabel(field, units), recordLabel(record, units), volumeLabel(volume, units):
  return plain labels using the user's units; round only for display
setLabel(index, total): show the zero-based slot as Set index+1 of total
timerConfig(mode, duration, rest, rounds): parse integer text into the selected mode's config;
  the timer validator rejects missing, malformed or out-of-range values
```

Both typechecks and 308 mobile tests pass. The web export bundles successfully. Backend tests
run in CI under rule 8 because local PostgreSQL remains unavailable. Lint again requested
missing ESLint tooling; installation was declined. No dependencies were added. The existing
local icon change is not part of these commits.

Step 5.5 stays unticked: expo-keep-awake needs Peter's approval before installation, and the
new screen still needs device interaction checks. Step 5.6 needs expo-notifications approval;
step 5.7 requires an actual airplane-mode session and background notification on a phone.
No background alert or keep-awake success is claimed. Those gates prevent advancing to 6.1.

Peter's request also permits more exercise images if credits remain. This environment exposes
no image-credit balance; no image generation has been charged or claimed in this batch.

## Step 5.5 implementation, 15 October 2026

Peter approved both native workout dependencies. Added expo-keep-awake at the SDK manifest
version and an active/focused/foreground wake-lock lifecycle. Late activation after leaving
is released; activation errors show a message. The existing screen flow completes step 5.5's
implementation. Actual device interaction and wake-lock behaviour remain in the 5.7 gate.
Both typechecks and 310 mobile tests pass. Backend tests cannot connect to local PostgreSQL;
CI remains the rule 8 gate. Lint attempted to install unapproved ESLint tooling and automatic
approval review blocked it. The attempted package changes were removed; lint is not passed.

Effect lifecycle: acquire a unique wake-lock tag for each visible active interval; release on
blur, background, finish or unmount; release again if activation resolves after cleanup.

## Step 5.6 implementation, 18 October 2026

Added the approved expo-notifications SDK 57 dependency, native config plugin, Android channel
and exact-alarm permission declaration. Rest countdowns schedule OS local notifications.
Early logging, pause/reset, replacement, finish/abandon and sign-out cancel old requests.
Requests carry ownership and generation metadata and remain in the OS's persisted ledger.
A serialized controller cancels late obsolete schedules and reconciles requests at startup,
foreground return and sync changes. The web adapter explicitly reports native alerts unavailable.
Enable rest alerts requests permission on a user tap; denial does not fail a workout save.

Controller pseudocode:

```
setUser(user): invalidate old-account work immediately; queue cancellation of foreign requests
update(user, session, timer): increment session revision; serialize OS operations;
  retain at most one matching restAlertIntent, cancel obsolete ids;
  require permission and a future deadline before scheduling;
  after schedule resolves, cancel its id if account or session revision changed
reconcile(readLocalTimer): inspect tagged OS requests; cancel foreign, stale, ended or duplicate
  requests; defer to any newer explicit transition; never start a remote phone's timer
timerAfterLogs(timer, loggedAt): discard a running timer if a set committed after it began;
  otherwise preserve it; use the same check in screen restoration and alert reconciliation
```

Both typechecks and all 320 mobile tests pass. Tests cover matching requests, replacement,
pause/reset, late scheduling after sign-out/pause, permission denial, OS failures, expired
deadlines, duplicate cleanup and crash recovery. Web and Android JavaScript exports passed;
this is not a native APK build or installation. Backend tests require
CI's PostgreSQL service under rule 8. Lint remains unavailable because its automatic installer
attempted unapproved ESLint packages and approval review blocked it; those package changes
were removed. Only the two approved direct dependencies were added. The unrelated icon edit
is excluded.

## Phase 5 device handoff (step 5.7 still pending)

A new native build is required for the added module and permissions. Expo Go and a web export
do not establish the done-when condition. Use the existing Android development build workflow
with the JavaScript bundle loaded before going offline. For a cold offline restart, use the
existing internal preview APK profile, which embeds JavaScript and does not need Metro.
The preview needs a reachable configured API and Google OAuth client/signing setup for initial
sign-in; the developer sign-in button is deliberately absent in preview/release builds.

Record device model, Android version, build/commit, notification permission, Alarms and reminders
access, battery restrictions and actual results. No device run or APK installation is claimed.

1. Install the new native build, sign in online and create a day with several sets and 30-second
   rests. Include weight/reps, time/distance, notes and done-only fields. Tap Enable rest alerts.
2. Enable airplane mode. Start from Home, log sets, background or lock the phone during rest,
   and confirm one alert near its deadline. Return after the deadline and confirm the timer.
3. Log another set early and confirm the old alert does not fire. Repeat with pause, reset,
   another timer mode, finish and abandon. Sign out during rest and verify cancellation.
4. Confirm the active visible workout stays awake beyond the system timeout, while Home and
   a finished workout allow normal sleep. Check small-screen keyboard scrolling and both themes.
5. Finish offline and reopen the app offline. Verify saved sets, notes and summary. Reconnect
   and confirm one session with the same sets on a second signed-in phone.
6. Deny notifications and repeat logging. Saving must work and the alert limitation must be
   visible. Restore permission in phone settings and use Enable rest alerts to retry. Check
   Alarms and reminders access on Android 12+; inexact fallback can be delayed.
7. Restart during a rest countdown and verify no duplicate alert. Check account switching and
   the existing timer modes after a long background interval. Manual clock changes can alter
   wall-clock timers and are not treated as elapsed-time accuracy guarantees.

Status: implementation ready for review; step 5.7 remains unticked until these real-phone
results are recorded. Phase 6 has not started.

## Review corrections, 20 October 2026

The review identified missing gym workflows and performance/readability problems. D38 and
`PHASE_5_CORRECTIONS.md` now define the authorized correction scope and acceptance checks.
They supersede this phase's earlier exclusions for session replacement and history. Execute
BUILD_PLAN steps 5.8.1 through 5.8.12 before the final 5.7 real-phone gate.

Peter has approved ESLint, Prettier and required development configuration. Earlier lint
approval notes above describe historical results, not an outstanding approval request.
Neither this notice nor passing CI establishes phone behavior or completion of the corrections.
