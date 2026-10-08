# ProFit build plan (source of truth)

This file is the single checklist for building ProFit. Whoever is building (Claude, Codex or a
person) works from it top to bottom and ticks each box **in the same commit that completes it**.
Scope comes from `docs/SPEC.md`, order from `docs/ROADMAP.md`, rules from `CLAUDE.md`. If this
file and those disagree, the SPEC wins: stop and note the conflict in `docs/DECISIONS.md`.

Legend: `[x]` done and merged, `[ ]` to do, `[~]` deferred on purpose (reason given).

---

## How to work (read every session)

1. **Read first:** `CLAUDE.md`, `docs/SPEC.md`, `docs/DECISIONS.md`, `docs/DESIGN.md`, the
   previous phase file in `docs/phases/`, and this file. Find the first unticked step.
2. **One phase at a time.** Create the branch named in the phase (`feat/<name>` off `rebuild`).
3. **Plan before code.** The first step of every phase writes `docs/phases/PHASE_N.md` in the same
   style as `PHASE_2.md` and `PHASE_3.md`: "Done when", the data model, pseudocode for every pure
   function, API additions, screens, and what is not in the phase. Commit it before any code.
4. **Each step is a vertical slice.** Data, logic, tests, then screen. After each step:
   `cd backend && npm run typecheck && npm test` and `cd mobile && npm run typecheck && npm test`.
   Commit only when both pass. Tick the step's box in this file in that commit.
5. **Copy the existing patterns, do not invent new ones.**
   - Synced data: a Drizzle table + migration in `backend/src/db/`, an entry in
     `backend/src/sync/collections.ts`, a SQLite migration in `mobile/src/lib/db/`, an entry in
     `mobile/src/features/sync/collections.ts`, and a feature module like
     `mobile/src/features/exercises/customExercises.ts` with tests.
   - Hooks like `mobile/src/features/exercises/useExerciseLibrary.ts`; screens like
     `mobile/src/app/exercises/*.tsx`; UI only from `mobile/src/ui` and theme tokens.
   - Ids made on the phone (`randomId()`), or name-based UUIDv5 when one record per key (see
     `favourites.ts`).
6. **Rules that are easy to break:** no em dashes anywhere (code, comments, docs, commits, UI);
   no hardcoded colours or fonts; every screen has loading, empty and error states; numbers come
   from pure functions with tests; never copy code or data from other projects (openGym is AGPL,
   ideas only); ask Peter before adding any dependency not already implied by `docs/DECISIONS.md`
   (write the question in the PR and continue with what does not need it).
7. **Expo APIs change.** Before using any Expo module, read `mobile/AGENTS.md` and the SDK 57
   docs. Install with versions from `mobile/node_modules/expo/bundledNativeModules.json`.
8. **No Postgres in your environment?** Backend tests need one (`DATABASE_URL`, default
   `postgres://profit:profit@localhost:5432/profit`). Try `docker compose up -d db`, or install
   Postgres 16. If neither works, run typecheck, push, and treat CI (which has Postgres) as the gate.
9. **End of phase:** run the "Done when" check, write the phase summary at the bottom of the phase
   file (what was built, how it was tested, what Peter must check on a real phone, decisions
   logged), push, open a PR into `rebuild`, wait for CI green, then **stop and ask Peter to
   review**. Do not start the next phase until he says so.
10. **Small commits** with conventional prefixes (`feat(mobile):`, `feat(backend):`, `test:`,
    `docs:`, `fix:`). Push at least after every completed step.

---

## Done

- [x] **Phase 0** Foundation: spec, tokens, skeletons, CI
- [x] **Phase 1** Accounts: Google sign-in, profile, onboarding (`docs/phases/PHASE_1.md`)
- [x] **Phase 2** Local store and sync engine, body-weight log (`docs/phases/PHASE_2.md`)
- [x] **Phase 3** Exercise library, search, favourites, custom exercises, photos (`docs/phases/PHASE_3.md`)
- [x] Image generation pipeline: rules, job list, Codex task, review gallery (`docs/IMAGE_GUIDE.md`)
- [~] Generating the exercise images: deferred by Peter. Placeholders show until then. Do not
  generate images unless Peter asks.

---

## Phase 4: Plans (`feat/plans`)

Done when: build a 3-day cycle with custom log fields, see today's day on Home, edit and delete a day.

- [x] 4.1 Write `docs/phases/PHASE_4.md` (model, pseudocode, screens). Model to cover: plan
  (name, shape `cycle` or `weekly`, difficulty `gentle|standard|hard`, active flag), plan days
  (order or weekday, name, rest day flag), plan exercises (exercise id, order, sets, target reps or
  time or distance, rest seconds, log fields chosen from reps, weight, time, distance, rest, RPE,
  notes, done), and the daily habit (list of exercises, shown every day).
- [x] 4.2 Backend: tables, migration, sync collections for plans, days, plan exercises and habit;
  sync tests like `routes/exercises.sync.test.ts`.
- [x] 4.3 Mobile: SQLite migration, sync collections, `features/plans/plans.ts` (create, update,
  delete with tombstones, list) with tests.
- [x] 4.4 Pure logic with tests: `todaysDay(plan, days, lastCompleted, today)` for both shapes
  (cycle advances after a completed session, weekly follows the weekday, rest days handled);
  default log fields from an exercise's tracking type; difficulty scaling of targets
  (gentle and hard as fixed percentages, logged in DECISIONS).
- [x] 4.5 Plan list and plan editor screens: create a plan, choose shape, add, rename, reorder and
  delete days, add exercises from the library (reuse the library list as a picker), set targets
  and log fields per exercise.
- [ ] 4.6 Starter plans: 3 to 4 plans written by us (beginner full body 3 days, push pull legs,
  upper lower 4 days, home bodyweight) as data in the app, using library ids only; "Use this plan"
  copies one into the user's plans as an ordinary editable plan. Test that every id exists.
- [ ] 4.7 Daily habit editor and Home: Home hub tiles with today's session on top (from 4.4) and
  the habit card; guided first step "Pick a starter plan" when there is no plan.
- [ ] 4.8 Done-when check on two browser phones (harness in D24), phase summary, PR, stop.

## Phase 5: Guided workout and timers (`feat/workout`)

Done when: complete a logged session in airplane mode; the rest alert fires with the app in the background.

- [ ] 5.1 Write `docs/phases/PHASE_5.md`.
- [ ] 5.2 Sessions and set logs: backend tables and sync, mobile tables and module, tests. A
  session records plan day, start, end, notes; each set records only its chosen log fields.
- [ ] 5.3 Pure logic with tests: prefill targets and last used values per exercise; personal
  record detection (heaviest weight, most reps at a weight, estimated 1RM, longest time); session
  volume.
- [ ] 5.4 Timer engine as a pure module with tests, driven by timestamps not intervals (so it is
  correct after the app sleeps): rest, interval (work, rest, rounds), Tabata, EMOM, AMRAP,
  stopwatch, session clock.
- [ ] 5.5 Workout screen: start from Home or a plan day, current set first with timer and progress,
  log a set in one or two taps, notes per set and session, "easier today" switch, finish summary
  with PRs. Keep the screen awake (`expo-keep-awake`, ask Peter first if not already installed).
- [ ] 5.6 Background rest alert: a scheduled local notification at rest end, cancelled if the set
  is logged first (`expo-notifications`, ask Peter first). Document what Peter must test on a phone.
- [ ] 5.7 Done-when check, phase summary, PR, stop.

## Phase 6: Progression, streaks, reminders (`feat/progression`)

Done when: a full session suggests a heavier next target with its reason; a missed day breaks only a real streak.

- [ ] 6.1 Write `docs/phases/PHASE_6.md`.
- [ ] 6.2 Progression rules per plan exercise (add weight when all sets hit reps, rep range
  double progression, add time) as pure functions with many tests: missed reps never add load,
  repeated stalls suggest a lighter week, every suggestion returns its reason text.
- [ ] 6.3 Suggestion UI after a session and before the next: accept or dismiss, nothing applied
  without a tap.
- [ ] 6.4 Streaks as pure functions with tests: planned sessions and habit completions, plan rest
  days never break a streak, time zones and day boundaries handled.
- [ ] 6.5 Reminders: workout time, meal logging, streak at risk, weekly summary; each switchable
  in You, scheduled locally.
- [ ] 6.6 Done-when check, phase summary, PR, stop.

## Phase 7: Nutrition (`feat/nutrition`)

Done when: log a day of meals, see totals against the target and the day's colour on the calendar.

- [ ] 7.1 Write `docs/phases/PHASE_7.md`.
- [ ] 7.2 Foods, usual foods and meal entries: backend and mobile tables, sync, modules, tests.
  Depth setting (simple, standard, detailed) on the profile.
- [ ] 7.3 Pure logic with tests: daily calorie target from profile and goal (state the formula in
  DECISIONS, for example Mifflin-St Jeor with activity factor), manual override, daily totals, day
  status on target, close or well off with the thresholds logged.
- [ ] 7.4 Food tab: today's meals, add food manually or from usual foods with quantity and
  multiples, totals against target at the chosen depth.
- [ ] 7.5 Calendar with soft colour tones only (no red; tokens from the theme).
- [ ] 7.6 Done-when check, phase summary, PR, stop.

## Phase 8: Progress and celebrations (`feat/progress`)

Done when: charts render real logged data in each range; a PR shows its badge.

- [ ] 8.1 Write `docs/phases/PHASE_8.md`. Pick a chart approach and ask Peter before adding a
  chart library.
- [ ] 8.2 Pure series builders with tests: body weight, volume, strength per exercise, calories and
  macros, consistency, for week, month, 3 months and year.
- [ ] 8.3 Progress screen: user picks which charts show and the range; empty states explain how
  to fill each chart.
- [ ] 8.4 Celebrations: PR badges, streak milestones, short messages, shown once each.
- [ ] 8.5 Done-when check, phase summary, PR, stop.

## Phase 9: Community (`feat/community`)

Done when: a second account finds a shared plan, copies it, and the copy stays unchanged when the author edits.

- [ ] 9.1 Write `docs/phases/PHASE_9.md` (online only, not synced; privacy default).
- [ ] 9.2 Backend: public profiles (photo, name, goal, bio, private switch), shared plans and
  workouts as frozen snapshots, follow, like, feed and search endpoints, with tests including
  privacy.
- [ ] 9.3 Media: allow reading a photo that belongs to shared content (extends `GET /media/:id`).
- [ ] 9.4 Mobile: profile editor, community feed, shared plan view, copy into my plans (a new
  independent plan), follow and like. Clear offline state.
- [ ] 9.5 Done-when check with two accounts, phase summary, PR, stop.

## Phase 10: AI coach (`feat/coach`)

Done when: a coach plan uses only library exercises, applies only after approval, and the app runs with the coach off.

- [ ] 10.1 Write `docs/phases/PHASE_10.md`. Compare providers by cost, log the choice in DECISIONS,
  and ask Peter before adding any SDK. All AI calls go through the backend, never the phone.
- [ ] 10.2 Backend adapter interface with a fake provider for tests; per-user rate limits; coach
  on or off setting.
- [ ] 10.3 Q&A grounded in the user's own data (summarised server side).
- [ ] 10.4 Plan from chat: output validated with Zod, every exercise id checked against the
  library, shown as a proposal, applied only on approval.
- [ ] 10.5 Review and propose changes with reasons from the log; macro estimate from a food name;
  daily check-in and weekly summary; tone choice.
- [ ] 10.6 Done-when check including the app fully working with the coach off, summary, PR, stop.

## Phase 11: Hardening and release (`feat/release`)

Done when: a release build is installed by testers from Google Play closed testing.

- [ ] 11.1 Write `docs/phases/PHASE_11.md`.
- [ ] 11.2 Error reporting, crash-safe sync, data export and account deletion.
- [ ] 11.3 Privacy policy and store listing text (ProFit's own words).
- [ ] 11.4 Lock app name and Android package id with Peter; EAS build profiles; signing.
- [ ] 11.5 Backend deployment notes for Peter's Oracle Cloud server (env, migrations, backups of
  Postgres and `MEDIA_DIR`).
- [ ] 11.6 Closed testing checklist for Peter, summary, PR, stop.
