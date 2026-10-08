# Phase 3: Exercise library

**Done when:** with no connection, search finds an exercise and shows its image or a placeholder;
a custom exercise made on one phone appears on another.

## Where the data comes from

- **Built-in exercises:** free-exercise-db (github.com/yuhonas/free-exercise-db, commit
  `f00c92c7`), released into the public domain (Unlicense, checked in its `LICENSE.md`, and so is
  the dataset it was built from, wrkout/exercises.json). 876 exercises with name, category,
  equipment, level, force, mechanic, primary and secondary muscles, and instructions. Its images
  are not used (D4).
- `scripts/build-exercise-library.mjs` turns that file into ProFit's library: tidy names, a
  `tracking` type per exercise (what a set records), a `common` flag and `popularity` rank on the
  exercises most people look for, and a library version number. The output is checked in, so
  builds never download it.
- **Images:** ProFit's own, generated with Codex from a job list (see `docs/IMAGE_GUIDE.md`). An exercise
  without an image shows a placeholder drawn from its category and main muscle.

## How the library is stored

```
built-in exercises   bundled with the app as JSON, read on first use, never synced
                     (the same for everyone; updates ship with app updates)
custom exercises     the user's own, a synced table (sync engine from Phase 2)
favourites           a synced table; one row per user per exercise, id derived from both
                     (like weigh-ins), so favouriting on two phones never makes two rows
photos               files on the phone; uploaded to the API and fetched by other phones
```

Plans and workouts (Phase 4 and later) refer to an exercise by id: the free-exercise-db slug for
built-ins (`Barbell_Squat`), a UUID for custom exercises.

## Search and filters (pure functions, tested)

```
search(query, filters, exercises):
  keep exercises matching every filter (category, muscle, equipment, favourites only)
  split the query into words; every word must appear in the name, muscles or equipment
    (gym shorthand is expanded first: db -> dumbbell, bb -> barbell, kb -> kettlebell, rdl ...)
  rank: every word in the name > popularity > name starts with the query > custom first
        > shorter name > A to Z
```

Everything runs on the phone over at most a thousand items, so search works offline and instantly.

## Tracking types

| Type | A set records | Assigned to |
|---|---|---|
| `weight_reps` | weight and reps | exercises with equipment that carries a load |
| `reps` | reps (optional added weight) | bodyweight strength exercises |
| `time` | duration | stretches and holds (planks, wall sits) |
| `distance_time` | distance and duration | cardio |

Phase 4 lets a plan override this per exercise.

## API additions

```
synced collections: custom_exercises, exercise_favourites (same push/pull as Phase 2)

PUT /media/:id    body = the image (JPEG, PNG or WebP, at most 5 MB)     needs sign-in
  id is a UUID made on the phone, so a retried upload replaces the same file
  stored on disk under MEDIA_DIR/<user>/<id>, with a row in the media table
GET /media/:id    the image; only its owner may read it for now (community sharing in Phase 9)
```

## Photos on the phone

```
pick (gallery) -> crop square, shrink to at most 1080 px, JPEG -> copy into the app's own folder
  -> row in media (uploaded = 0) -> custom exercise points at it by photo id
sync: upload media with uploaded = 0 before pushing records
another phone: a photo id with no local file is downloaded once, then kept
```

## Screens

- **Train** gets an "Exercise library" entry.
- **Library:** search box, filter buttons (favourites, muscle, equipment, type), results list
  with image or placeholder, star to favourite. "New" button.
- **Exercise detail:** image, muscles, equipment, level, numbered instructions, favourite;
  edit and delete for custom exercises.
- **Custom exercise form:** name, photo, type, equipment, main and other muscles, what each set
  records, instructions.

## Not in this phase

- Movement patterns and difficulty ladders (easier and harder versions) arrive with plan
  difficulty in Phase 4.
- Sharing custom exercises with others: Phase 9.
