# CLAUDE.md

Context for Claude Code sessions working on ProFit. Read this first, then the docs it points to.

## What ProFit is

A training and nutrition log for one gym community: plans, guided workouts, meals, streaks,
sharing programs, and an AI coach that compares the plan with what was actually logged. Offline
first. Full product scope: `docs/SPEC.md`. Build order: `docs/ROADMAP.md`.

## Layout

```
backend/   Node 22 + Express 5 + TypeScript (ES modules). src/app.ts builds the app, src/index.ts starts it.
mobile/    Expo SDK 57 + expo-router + TypeScript. app/ holds routes, src/ holds everything else.
docs/      SPEC, ROADMAP, DESIGN, DECISIONS, REFERENCE.
```

## Commands

```bash
# Backend
cd backend && npm install
npm run dev          # tsx watch on :4000
npm test             # vitest
npm run typecheck
docker compose up -d db   # from repo root: Postgres 16 on :5432

# Mobile
cd mobile && npm install
npx expo start       # needs a development build on the phone (Expo Go cannot run this app)
npm test             # vitest for pure logic
npm run typecheck
```

## Rules

1. **Small commits.** One logical change per commit, conventional prefixes: `feat:`, `fix:`,
   `test:`, `docs:`, `chore:`, `refactor:`. Commit as soon as a step works.
2. **Branches.** Work on `feat/<name>` off `rebuild`. Merge only when tests and typechecks pass.
3. **Logic that produces numbers lives in pure functions with tests beside them.** Progression,
   streaks, calorie targets, macro totals, timers, sync merging. These go in `src/domain/` (mobile)
   or `src/domain/` (backend) with a `*.test.ts` next to them. Screens call them; screens do not
   contain them.
4. **No borrowed code.** Never copy code, prompts, data or images from projects ProFit does not own
   unless they are public domain and logged in `docs/DECISIONS.md`. openGym is AGPL and is for ideas
   only. See `docs/REFERENCE.md`.
5. **Theme tokens only.** Colours, fonts, spacing and radii come from `mobile/src/theme`. No
   hardcoded hex values or font names in components.
6. **Every screen handles loading, empty and error states.**
7. **Offline first.** Writes go to the on-device SQLite store first, then sync. Records get their
   id on the device (UUID). Never drop unsynced data.
8. **AI output is untrusted input.** Validate it with Zod like user input, and the app must keep
   working with the AI switched off.
9. **Ask before adding a dependency** that is not implied by the stack in `docs/DECISIONS.md`.
10. **Log assumptions** in `docs/DECISIONS.md` instead of deciding silently.
11. **Writing style.** Never use em dashes in code comments, docs, commit messages or UI copy. Use
    commas, colons, parentheses or separate sentences. UI copy is plain and specific.
