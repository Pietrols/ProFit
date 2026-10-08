# Reference and Inspiration Rules

ProFit is written from scratch. Other apps are studied for ideas only.

## The rule

- **No code, prompt text, data files, images or copy are taken from any project ProFit does not own
  or that is not public domain.** Concepts are described here in our own words and implemented
  fresh.
- openGym (github.com/DuarteSantos8/openGym, forked at github.com/Pietrols/openGym) is licensed
  AGPL-3.0. Copying any of it would bind ProFit to that license. It is a source of ideas only.
- Before using any outside dataset or asset, record its license in `docs/DECISIONS.md`.

## Free sources ProFit may use directly

| Source | What | License | Use |
|---|---|---|---|
| free-exercise-db (github.com/yuhonas/free-exercise-db) | 800+ exercises: names, muscles, equipment, instructions | Unlicense (public domain) for the data | Seed text and metadata only. Its README does not state the image license, so its images are not used. |
| Own generated images | Exercise illustrations | Owned by ProFit | Generated in batches by Peter, see `docs/IMAGE_GUIDE.md` |
| Google Fonts: Bebas Neue, Barlow | Typefaces | SIL Open Font License | Bundled via `@expo-google-fonts` |

Nutrition data sources are chosen and recorded in Phase 7.

## Ideas worth applying (our own wording)

These are product and engineering ideas observed in other trackers. They describe behaviour, not
code.

**Training logic**
- Calculate the next target from the workout history every time it is needed, instead of storing
  counters that can drift.
- A small set of named progression rules, each explaining in one line why it picked a number.
- Read a session honestly: a set done with its target reps is a hit, fewer reps or an unticked set
  is a miss, and missing sets never count as success.
- Repeated misses lead to a lighter week rather than more of the same.
- Bodyweight exercises carry no load of their own; progress there is reps, then sets, then a
  harder variation.
- Single-side exercises are tracked consistently (decide once whether reps are per side or total).
- Starter plans are ordinary plans the user can edit, not a special locked mode.

**Workout screen**
- Today's session is one tap away and prefilled from last time.
- Personal records are recognised while training, not only afterwards.
- Keep the screen awake; keep the rest countdown alive in a notification when the app is in the
  background.

**AI coach**
- The coach may only use exercises from the app's library, referenced by id.
- Anything the user typed is treated as information about their training, never as instructions
  that change the coach's rules.
- The deterministic progression logic sets weights; the coach shapes the plan.
- Every proposed change carries a reason drawn from the user's own data. With no history, the
  reason cites their stated goal and situation instead of inventing evidence.
- Pain is never trained through: conservative choices and a suggestion to see a professional.
- Remember what the user declined and do not propose it again without new evidence.
- Show a consent screen listing exactly what data goes to the AI provider.
- Keep the provider behind one adapter so a free or self-hosted model can replace a paid one.

**Data and sync**
- Every record has a stable id created on the device, so a resend never duplicates.
- When two devices edit, merge by record rather than letting the newest copy overwrite everything.
- Never drop data that has not reached the server, including on sign-out.
- Show plainly when the app is working offline.

**Sharing**
- A shared plan is a small self-contained bundle: its days, exercises and any custom exercises it
  needs. Copying it adds new records with new ids and never touches the user's existing data.
