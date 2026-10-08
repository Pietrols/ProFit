# Phase 4: Plans

**Done when:** build a 3-day cycle with custom log fields, see today's day on Home, edit and delete a day.

Plans use the existing local store, sync engine and exercise library. Writes go to SQLite first.

## The model

| Collection | Fields besides the usual sync columns |
|---|---|
| `plans` | name, shape (`cycle` or `weekly`), difficulty (`gentle`, `standard`, `hard`), active |
| `plan_days` | planId, position, weekday (Monday 1 to Sunday 7, nullable), name, restDay |
| `plan_exercises` | dayId, exerciseId, position, sets, targetReps, targetTimeSeconds, targetDistanceMetres, restSeconds, logFields |
| `daily_habit` | exerciseIds, an ordered list shown every day |

Names are 1 to 80 characters; positions are non-negative integers; sets 1 to 100; reps
1 to 1000; time 1 to 86400 seconds; distance 1 to 1000000 metres; rest 0 to 3600 seconds.
Targets can be null. Log fields are a non-empty unique selection of reps, weight, time,
distance, rest, RPE, notes and done. Exercise ids are library slugs or custom UUIDs.

Plans, days and exercises get random device UUIDs. Habit ids are UUIDv5 derived from the user
so two phones edit one routine. Relationships are soft references to tolerate out-of-order
sync. Reads hide children of deleted parents and scope every query to the signed-in user.
Deleting a day or plan tombstones its existing children in one local transaction.
Missing exercises stay visible with an explanation.

Activating a plan deactivates others locally in one transaction. If concurrent edits activate
several, Home chooses the latest edited active plan, then id as a stable tie breaker.
The editor enforces unique weekdays. Unscheduled weekdays are rest days.

## Pure functions (tested)

```
todaysDay(plan, days, lastCompleted, today):
  keep live days of this plan; sort by position then id
  invalid calendar date or no days -> null
  weekly -> day matching today's calendar weekday, or null (rest)
  cycle -> first day without a completion for this plan
    completion today -> that day, avoiding a second advance today
    older completion -> next day, wrapping
    deleted completed day -> first day
  return explicit rest days too

defaultLogFields(tracking):
  weight_reps -> [reps, weight]; reps -> [reps]
  time -> [time]; distance_time -> [distance, time]

scaleTargets(targets, difficulty):
  multiply present reps, seconds and metres by 0.8, 1 or 1.2
  round to nearest integer, minimum 1, cap at validation maxima
  preserve nulls; sets and rest unchanged

validatePlan / validateDay / validatePlanExercise / validateHabit:
  check model limits, vocabulary, exercise ids and unique log fields

moveDay(days, id, direction):
  sort; swap adjacent days when possible; assign consecutive positions
  keep weekday attached to its day

copyStarter(starter):
  check every built-in id; create fresh plan, day and exercise ids
  save independent editable copy in one local transaction
```

Store Standard targets and scale only when displaying or prefilling a future session.
Record percentages in DECISIONS. Phase 5 supplies completion records; until then a cycle
shows its first day. Cycle rest days remain selected until a completion advances the cycle.

## API additions

```
POST /sync/push: plans, plan_days, plan_exercises, daily_habit
GET /sync/pull: same collections, including tombstones
```

Each collection follows custom exercises: Drizzle table and migration, Zod wire schema,
sync mappings, SQLite migration and mobile collection entry. No new routes or dependencies.

## Screens

- Train links to My plans and the exercise library.
- My plans lists editable plans, active choice, New and starter plans. Use this plan makes a copy.
- Plan editor changes name, shape, difficulty and active flag; adds, renames, reorders and
  deletes days; chooses weekdays and rest days.
- Day editor reuses the library list as a picker; sets targets, sets, rest and log fields;
  removes exercises. Missing exercises explain why they cannot be picked again.
- Daily habit editor picks an ordered exercise list and removes entries.
- Home shows today's named day or rest, the daily habit and four hub tiles. No plan shows
  Pick a starter plan. Session logging arrives in Phase 5.

Hooks follow useExerciseLibrary, reloading on focus and sync. Screens use theme tokens and
existing UI components, with loading, empty and retryable error states. Real SQLite tests
cover writes, ownership, tombstones and two-phone sync. D24 browser isolation and same-origin
API proxy verify the done-when flow on two browser phones.

## Not in this phase

- Sessions, completion writes, timers and easier-today switch: Phase 5.
- Progression, habit completion and streaks: Phase 6.
- Exercise substitutions and difficulty ladders: current library has no relationships for these.
- Sharing and AI plans: Phases 9 and 10.
- New dependencies and generated exercise images.
