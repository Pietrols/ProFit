# Exercise image guide

ProFit's exercise images are our own, made in batches with an image generator (ChatGPT). No image
from another app, site or dataset goes in, including free-exercise-db's photos (D4). Until an
exercise has an image, the app shows a placeholder (an icon for the kind of movement and its main
muscle), so images can arrive a batch at a time.

## One batch, step by step

1. **Get the list.** From the repo root: `node scripts/image-batch.mjs 10`. It prints the next 10
   exercises without an image, most looked-for first, each with its file name and a prompt.
2. **Make the images.** Paste each prompt into the generator. Keep one chat per batch and say "same
   style as before" after the first image, so the set stays consistent.
3. **Check each one** against the list below. Redo any that fail; a wrong image is worse than the
   placeholder.
4. **Save** as `mobile/assets/exercises/<id>.webp` using the file name the script printed (the id
   is case sensitive). Square, 512 x 512 px, WebP at about quality 80 (aim for under 60 KB).
5. **Register them:** `node scripts/build-image-manifest.mjs`. It fails if a file name is not an
   exercise id.
6. **Look at them in the app** (library list and detail), then commit:
   `feat(mobile): exercise images, batch N`.

## The style

| | |
|---|---|
| Format | Square 1:1, flat vector illustration |
| Background | Warm off-white `#F3EEE6`, nothing else in the scene |
| Figure | One gender-neutral athlete, plain dark-brown outfit, simple shapes, no face details |
| View | Side or three-quarter, at the hardest point of the movement (bottom of a squat, top of a curl) |
| Highlight | Working muscles in terracotta `#E57A52` |
| Equipment | Muted grey, drawn simply and correctly (a barbell has plates, a cable has a handle) |
| Never | Text, logos, brand marks, real people's likeness, copies of someone else's artwork |

## Checklist for each image

- The movement is right: correct joint angles, grip, stance and equipment for this exercise.
- The highlighted muscles match the exercise's main muscles.
- The figure is safe-looking (neutral spine on lifts, knees tracking over toes).
- Still readable at 56 px (the list size): one figure, strong silhouette.
- Matches the rest of the set in colour, line weight and framing.

## Licensing note

Images we generate are ours to ship. Do not prompt with another product's name, artist's name or
a reference image you do not own, so nothing in the set is derived from someone else's work.
