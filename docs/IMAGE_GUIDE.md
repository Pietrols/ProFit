# Exercise image guide

ProFit's exercise images are our own, generated with Codex (included with ChatGPT) on a local copy
of the repo. No image from another app, site or dataset goes in (D4). Until an exercise has an
image the app shows a placeholder, so images can arrive in batches.

The rules every image follows are in `docs/IMAGE_RULES.md`. Codex's step-by-step task is in
`images/CODEX_TASK.md`.

## Files

| File | What it is |
|---|---|
| `images/jobs.json` | One job per exercise, most looked-for first: prompt, figure, view, steps, target file. Rebuild with `node scripts/build-image-jobs.mjs`. |
| `images/anchors.json` | Ids of approved images every new image is compared with. Filled after the pilot. |
| `images/log.jsonl` | One line per image made: kept, needs-review or rejected. Codex uses it to resume and to find the last three kept images. |
| `images/incoming/` | Full-size images from Codex (not committed). |
| `mobile/assets/exercises/` | The finished 512 px WebP files the app ships. |

## One-time setup (your computer)

1. `git pull`, then from the repo root: `npm install --prefix scripts` (installs the image shrinker).
2. Open Codex in the repo folder.

## Running a batch

1. Tell Codex: **"Follow images/CODEX_TASK.md for the next 10 jobs."** (Pilot: 10. Then
   "orders 11 to 91", then chunks of about 200.)
2. When it finishes, open `images/review.html` in a browser.
3. Tick any bad image. The page builds a line to paste back to Codex, which redoes just those.
4. Commit: `feat(mobile): exercise images, orders N to M`.

## After the pilot

Pick the 3 to 5 best pilot images (mix of female, male, side and front view) and put their ids in
`images/anchors.json`: `{ "anchors": ["Barbell_Squat", "Pullups"] }`. From then on every image is
compared with them, which is what keeps 880 images looking like one set. If the pilot shows a rule
is wrong, change `docs/IMAGE_RULES.md` (and the style text in `scripts/build-image-jobs.mjs`), rebuild
the jobs, and redo the pilot.

## Licensing note

Images we generate are ours to ship. Never prompt with another product's name, an artist's name or
a reference image we do not own.
