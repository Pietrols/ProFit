# ProFit Build Roadmap

Each phase is a vertical slice: it works end to end, has tests for its logic, and leaves the app in
a usable state. A phase is not started until the previous one passes its checks and Peter has
reviewed it. Each phase is built on a `feat/...` branch off `rebuild` and merged when green.

| Phase | What ships | Done when |
|---|---|---|
| 0 | Foundation: spec and rules, design tokens, backend and app skeletons, CI | Backend health test passes, app opens with the four tabs in both themes, CI green |
| 1 | Accounts: Google sign-in, profile, onboarding (under a minute, skippable) | Sign in on Android, skip onboarding, reopen the app offline and still be signed in |
| 2 | Local store and sync engine, proven on the body-weight log | Log weight offline, reconnect, it syncs once with no duplicates; a second device merges |
| 3 | Exercise library: seeded data, search and filters, custom exercises, image pipeline | Offline search finds an exercise with its image or placeholder; a custom exercise syncs |
| 4 | Plans: cycle or weekday plans, starter plans, per-exercise log fields, difficulty, daily habit | Build a 3-day cycle with custom fields, see it on Home, edit and delete a day |
| 5 | Guided workout and all timers, background rest alert, wake lock | Complete a logged session in airplane mode; rest alert fires with the app in the background |
| 6 | Progression suggestions and streaks, reminders | A full session suggests a heavier next target with its reason; a missed day breaks only a real streak |
| 7 | Nutrition: depth levels, foods and usual foods, calorie target, soft calendar | Log a day of meals, see totals against the target and the day's colour on the calendar |
| 8 | Progress charts and celebrations | Charts render real logged data in each range; a PR shows its badge |
| 9 | Community: profiles, share and copy, follow, likes | A second account finds a shared plan, copies it, and the copy stays unchanged when the author edits |
| 10 | AI coach: provider adapter, Q&A, plan from chat, review and propose, macro estimate | A coach plan uses only library exercises, applies only after approval, and the app runs with the coach off |
| 11 | Hardening and release: privacy policy, store listing, closed testing builds | Release build installed by testers from Google Play closed testing |

## Working rhythm

- Small commits, one logical change each.
- Every phase ends with a short summary: what was built, how it was tested, what needs checking on
  a real phone, and any decisions logged.
