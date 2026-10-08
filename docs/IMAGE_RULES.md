# Exercise image rules

Every exercise image in ProFit follows these rules. Codex (or anyone) generating images reads this
file before each batch, and every image is checked against it before it is kept. If a rule needs to
change, change it here first, then regenerate what it affects.

## What an image is

One still image of one exercise, at the single moment that best explains the movement: the
position where someone glancing at it once understands what to do. Not a sequence, not a collage,
not a before-and-after.

## The figure

| Rule | Detail |
|---|---|
| Form | A realistic, anatomically proportioned human form, like a matte grey mannequin or 3D anatomy figure. Not a cartoon, not a stick figure. |
| Surface | Smooth matte mid-grey (around `#9A9A9A`), the same grey on every image. No clothing, no shoes, no hair, no tattoos, no skin texture. |
| Face | No face: a smooth head with no eyes, nose, mouth or ears. Nobody identifiable. |
| Body type | Athletic and natural, neither bodybuilder nor thin. Female or male as set in the job (`figure`), roughly half each across the library. Shown only through body shape, never explicitly. |
| Count | One figure only. A partner or spotter appears only if the exercise cannot be done without one. |

## The movement

| Rule | Detail |
|---|---|
| Key moment | The position that teaches the movement. Usually the hardest point: the bottom of a squat, the top of a pull-up, the lowest point of a push-up, the stretched end of a stretch, a hold for holds. |
| Technique | Correct, safe form: neutral spine on lifts, knees tracking over toes, controlled joint angles, correct grip and stance. If unsure, follow the steps in the job. |
| Camera | Side view (profile) by default. Front view when the movement happens side to side (lateral raise, jumping jacks, side lunge). Three-quarter view only when neither shows the movement clearly. Camera at about hip height, level, no tilt. |
| Framing | The whole figure and all equipment inside the frame, centred, filling about 75% of the height, with margin on every side. Nothing cropped. |

## Equipment and setting

| Rule | Detail |
|---|---|
| Equipment | Realistic and correct for the exercise (a barbell has plates and collars, a cable has its handle and visible cable line, a bench is a real gym bench). Dark charcoal metal and black rubber. No brand names or logos. |
| Background | Plain, seamless light grey studio backdrop (around `#E6E6E6`) with a soft floor shadow under the figure. No room, no gym, no scenery, no horizon line. |
| Lighting | Soft even studio light from the front left, the same on every image. No coloured light, no dramatic shadows. |

## Never

- Text, letters, numbers, labels, arrows, logos, watermarks or brand marks anywhere.
- Faces, real people, celebrities, or anything copied from another artwork, app or photo.
- More than one moment of the movement in one image.
- Colour accents on the figure (no highlighted muscles). The app adds colour around the image.

## Output

- Square, 1:1. Generate at the highest square size available; the finishing script shrinks it to
  512 x 512 WebP.
- File name is the exercise id exactly, as given in the job (case sensitive).

## Consistency check (done before keeping each image)

Compare the new image side by side with the **style anchors** (`images/anchors.json`) and the
**three most recently kept images**. Keep it only if every answer is yes:

1. Same grey figure surface, same faceless head, same background, same lighting?
2. Same camera height and similar figure size in the frame?
3. One figure, one moment, nothing cropped?
4. Correct exercise, correct equipment, safe technique?
5. No text, logos or faces anywhere?

If any answer is no, regenerate (at most two more tries). If it still fails, log it as
`needs-review` and move on.
