# Codex task: generate exercise images

You are generating ProFit's exercise images. Work through `images/jobs.json` in order.

## Before you start

1. Read `docs/IMAGE_RULES.md` in full. Every image must follow it. It overrides anything else.
2. Read `images/anchors.json` (approved style anchors) and the last lines of `images/log.jsonl`
   (what was done before). Skip every job whose id already has a line in the log with status
   `kept`, or a file in `mobile/assets/exercises/`.
3. Do only the number of jobs you were asked for (for example "the next 10", or "orders 11 to 91").
   Stop when that many are done.

## For each job

1. **Look back.** Open the anchor images and the three most recently kept images (from the log,
   files in `images/incoming/`). Use them as style references for the new image.
2. **Generate** one image from the job's `prompt`. Read the job's `steps` to get the movement
   and key moment right. Use the job's `figure` and `view`.
3. **Check** it with the five questions in "Consistency check" in `docs/IMAGE_RULES.md`, comparing
   it side by side with the anchors and the last three kept images.
4. **Retry** up to two more times if any answer is no, changing only what failed.
5. **Save** the kept image (moved from Codex's generated images folder) to exactly the path in the
   job's `file` (`images/incoming/<id>.png`). Never rename ids.
6. **Log** one line to `images/log.jsonl`, appended, as JSON:
   `{"id":"<id>","status":"kept"|"needs-review","tries":<1-3>,"note":"<what failed, if anything>","at":"<ISO time>"}`

## When the batch is done

1. Run `node scripts/finish-images.mjs` (shrinks kept images into the app and updates its image list).
2. Run `node scripts/build-image-review.mjs` and tell the user to open `images/review.html`.
3. Report: how many kept, how many needs-review (with ids), and anything in the rules that seemed
   to cause trouble.

Do not edit any other files in the repo. Do not change `docs/IMAGE_RULES.md` unless the user asks.
