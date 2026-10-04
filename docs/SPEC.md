# ProFit Product Spec (v1)

Status: locked for the v1 build, October 2026. Changes go through `docs/DECISIONS.md` first.
Source: the rebuild interview brief (see the ProFit project doc `profit-rebuild-brief.md`).

## 1. What ProFit is

A training and nutrition log for one gym community. People plan and log their workouts and meals,
keep streaks, share their programs with each other, and get an AI coach that compares what they
set out to do with what they actually did.

**Who it is for:** anyone who trains, from complete beginners to competitors, at home or in a gym.
Launch is global, English only.

**First 60 seconds:** the user signs in with Google, answers a few questions or skips them, and
lands on Home with one clear next step. Within a minute they should see that they can log a
workout, add notes, build their own routines, and look at what other people in the community train.

**Success at six months:** a small to medium community using it regularly, keeping streaks and
sharing programs.

## 2. Principles

1. **Offline first.** Everything except community features works with no connection: logging,
   building plans, the exercise library, meals, progress. Data is written on the phone first and
   synced when a connection returns. Nothing unsynced is ever discarded.
2. **The user decides.** The app suggests progressions and the coach proposes changes; nothing is
   applied without a tap.
3. **Customisable without being cluttered.** Depth is chosen by the user (simple or detailed
   logging, simple or full nutrition), with sensible defaults so a beginner never sees a wall of
   options.
4. **Honest numbers.** A missed set is a miss. Progression and targets are calculated from the
   log, and every suggestion shows why it is that number.
5. **Free for now.** No paywall in v1. The structure should not block a freemium tier later.

## 3. Look and feel

| Item | Choice |
|---|---|
| Palette | Sandstone: warm stone neutrals, terracotta accent, deep teal second accent |
| Theme | Dark by default, light available as a toggle (and "follow phone" option) |
| Display type | Bebas Neue, for headings, big numbers and timers |
| Body type | Barlow |
| Home layout | Hub tiles: four large doors to Workouts, Meals, Progress, Coach, with today's session on top |
| Navigation | Four tabs: Home, Train, Food, You |
| Corners | Soft (about 14 px on cards) |

Exact tokens live in `docs/DESIGN.md` and `mobile/src/theme/tokens.ts`.

## 4. v1 features (launch scope)

### 4.1 Accounts and onboarding
- Sign in with Google only.
- Onboarding takes under a minute and every step can be skipped and filled in later from You.
- Asked: display name, main goal, experience level, home or gym. Optional later: age, sex,
  height, weight, days per week, injuries or limits.
- Goal categories: Weight loss, Bodybuilding, Calisthenics, Athlete, Powerlifting, General fitness.
- After onboarding the user lands on Home with a guided first step (for example "Pick a starter
  plan" or "Log your first workout").

### 4.2 Exercise library
- Built-in exercises seeded from public-domain data, each with name, muscles, equipment,
  category, instructions and one static image.
- Images are ProFit's own, generated in batches (see `docs/IMAGE_GUIDE.md`, added in Phase 3).
  Until an exercise has its own image it shows a clean placeholder.
- Users can add custom exercises with their own photo.
- Search, filter by muscle, equipment and category, and favourites.

### 4.3 Plans
- Two plan shapes, user chooses: a **cycle** of named days (Day 1 Push, Day 2 Pull, repeat) or a
  **weekly schedule** tied to weekdays.
- Starter plans load as ordinary editable plans.
- Each exercise in a plan chooses what gets logged per set: any of reps, weight, time, distance,
  rest, effort (RPE), notes, or just "done".
- Plan difficulty (Gentle, Standard, Hard) plus a per-session "easier today" switch.
- A daily habit routine (for example morning mobility) that sits outside the plan and is shown
  every day.

### 4.4 Guided workout and timers
- Starting a session prefills targets and the last weights used.
- Mid-set the screen shows the timer and session progress first.
- Timers: rest between sets, interval (work, rest, rounds), Tabata, EMOM, AMRAP, stopwatch, and a
  whole-session clock.
- The rest countdown keeps running and alerts when the app is in the background.
- The screen stays awake during a session.
- Notes per set and per session. Personal records are flagged as they happen.

### 4.5 Progression and streaks
- Progression rules per exercise (for example: add weight when every set hits its reps, move up a
  rep range, add time). The app suggests the next target and shows the reason; the user confirms.
- Missed reps never add load; repeated stalls suggest a lighter week.
- Streaks count planned sessions completed and daily habit completions, with rest days in the
  plan not breaking a streak.

### 4.6 Nutrition
- Depth is chosen by the user: Simple (calories), Standard (calories plus protein, carbs, fat),
  Detailed (adds water and selected micronutrients).
- Log a meal by adding foods with their macros manually, from saved "usual foods" (with
  quantities and multiples), or by AI estimate from a food name.
- Daily calorie target calculated from the user's details and goal, with a manual override.
- A calendar where each day is coloured against the target using soft tones only: on target,
  close, or well off. No red.

### 4.7 Progress and celebrations
- Charts for body weight, training volume, strength per exercise, calories and macros, and
  consistency. The user picks which charts show and the range (week, month, 3 months, year).
- Wins are celebrated with personal-record badges, streak milestones and short messages.

### 4.8 Community (online only)
- Public profiles (photo, name, goal, short bio) that a user can keep private.
- Share a plan or a single workout to the community; anyone can copy it into their own plans.
  A copy is independent: later edits by the author never change it.
- Follow people and like shared workouts.

### 4.9 AI coach (free in v1)
- Answer training and nutrition questions, grounded in the user's own data.
- Build a full plan from a chat, using only exercises in the library.
- Review what was logged and propose plan changes, each with the reason taken from the log.
- Estimate macros from a food name.
- Daily check-in message and a weekly summary.
- The user picks the coach's tone.
- The user approves every change before it is applied. The app works fully with the coach off.
- Provider: the cheapest that works, behind one adapter so it can be swapped (decided in Phase 10).

### 4.10 Reminders
- Workout reminder at a chosen time, meal logging reminder, streak at risk, weekly summary, coach
  check-in. Normal notifications, each switchable.

## 5. Not in v1 (planned for v2)

- Comments on shared workouts
- Leaderboards and challenges
- Groups and gym buddies
- Meal photo logging
- Barcode scanning
- Payments and premium tier (mobile money, Google Play billing, card, bank)
- Moderation tools (report button, review queue). Must exist before community opens beyond the
  founding gym.
- Languages other than English

## 6. Platform

- Android and iOS from one Expo React Native codebase. Android is the first test target.
- Backend: Node with Express and PostgreSQL, hosted on Peter's Oracle Cloud free-tier server.
- Target launch: 2 to 3 months from October 2026.
- Working name ProFit. Final name and Android package id are locked before the first Play Store
  upload.
