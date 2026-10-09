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

sessionSnapshot(plan, day, exercises):
  sort exercises by position then id; copy names, ids, Standard targets and selected fields
  retain the original difficulty; do not keep references to mutable plan objects

sessionTargets(snapshotExercise, difficulty, easierToday):
  use Phase 4 scaleTargets with gentle when easierToday, otherwise the saved difficulty
  always scale from Standard, never from an already rounded result

prefill(snapshotExercise, targets, history):
  keep valid completed logs for this exercise from completed sessions owned by this user
  order by logged time then id; for each selected numeric field find its last recorded value
  prefer explicit target reps/time/distance and configured rest over history
  use history for weight and numeric fields without a target; otherwise leave blank
  never prefill notes, RPE or done; return only selected fields

completedSets(snapshot, logs):
  keep one live valid log per snapshot exercise position and set index
  exclude done=false; return in exercise and set order

workoutProgress(snapshot, logs):
  total = sum of planned sets; completed = count(completedSets)
  next = first missing exercise/set slot; return counts and next, or null when finished

estimatedOneRepMax(weightKg, reps):
  require positive weight and integer reps from 1 through 10, otherwise return null
  one rep -> weight; otherwise weight * (1 + reps / 30)

personalRecords(candidate, previousLogs):
  compare only the same exercise id, valid completed sets and chronological earlier logs
  evaluate heaviest positive weight, most reps at exactly the same stored weight,
    estimatedOneRepMax, and longest positive time when their required fields exist
  a first eligible value establishes a record; ties do not create another record
  return metric, value and previous best (or null); round only for display

sessionVolume(logs):
  sum weightKg * reps for completed sets containing both fields
  missing weight contributes zero; never estimate body weight or machine resistance

sessionSummary(session, logs, earlierHistory):
  return completed/planned sets, elapsed time, volume and records
  compare each set with earlier completed sessions and earlier sets in this session
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
