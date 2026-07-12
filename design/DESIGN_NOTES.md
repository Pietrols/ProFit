# ProFit — Design Notes

Design tokens extracted from the Claude Design reference (`design/ProFit.html`).
This is the source of truth for colors, type, and spacing. When building a
screen in React Native, pull values from here (or from `mobile/theme.ts`,
generated from this) rather than eyeballing the HTML preview.

**Theme:** dark-first, near-black base, three neon accents used sparingly
(green = positive/progress, red = intensity/alert, blue = informational/AI).
Full light-mode variant included. Every token below lists **dark / light**.

---

## 1. Color Tokens

Claude Design defined these as CSS custom properties with paired
dark/light values. Names preserved so the HTML and RN theme stay in sync.

### Backgrounds & surfaces
| Token | Dark | Light | Use |
|---|---|---|---|
| `pagebg` | `#050506` | `#E7E7E2` | Deepest page background |
| `bg` | `#0A0A0B` | `#F1F1EE` | Main app background |
| `deep` | `#000000` | `#DBDBD5` | Deepest layer / true-black accents |
| `s1` | `#131316` | `#FFFFFF` | Surface level 1 (cards) |
| `s2` | `#1B1B20` | `#FBFBF8` | Surface level 2 (raised) |
| `s3` | `#27272E` | `#EFEFE9` | Surface level 3 (highest) |
| `tab` | `#0C0C0F` | `#FFFFFF` | Tab bar background |

### Text
| Token | Dark | Light | Use |
|---|---|---|---|
| `tx`  | `#F4F4F6` | `#161619` | Primary text |
| `tx2` | `#9A9AA4` | `#5E5E66` | Secondary text |
| `tx3` | `#9C9CA4` | `#5A5A64` | Tertiary / muted |

### Accents — GREEN (positive, progress, primary CTA)
| Token | Dark | Light |
|---|---|---|
| `green` | `#5CF77B` | `#0FA152` |
| `gdim` (tint bg) | `rgba(92,247,123,.13)` | `rgba(15,161,82,.11)` |
| `gglow` (glow shadow) | `0 0 20px rgba(92,247,123,.45)` | `0 0 15px rgba(15,161,82,.26)` |
| `ong` (text on green) | `#06140B` | `#FFFFFF` |

### Accents — RED (intensity, alert, missed)
| Token | Dark | Light |
|---|---|---|
| `red` | `#FF4B5C` | `#E02B44` |
| `rdim` | `rgba(255,75,92,.13)` | `rgba(224,43,68,.1)` |
| `rglow` | `0 0 20px rgba(255,75,92,.5)` | `0 0 15px rgba(224,43,68,.26)` |
| `onr` (text on red) | `#20040A` | `#FFFFFF` |

### Accents — BLUE (informational, AI coach)
| Token | Dark | Light |
|---|---|---|
| `blue` | `#4CB4FF` | `#1A7CE0` |
| `bdim` | `rgba(76,180,255,.13)` | `rgba(26,124,224,.1)` |
| `bglow` | `0 0 18px rgba(76,180,255,.42)` | `0 0 14px rgba(26,124,224,.24)` |
| `onb` (text on blue) | `#04121F` | `#FFFFFF` |

### Lines & tracks
| Token | Dark | Light | Use |
|---|---|---|---|
| `line`  | `rgba(255,255,255,.08)` | `rgba(0,0,0,.09)` | Hairline dividers |
| `line2` | `rgba(255,255,255,.15)` | `rgba(0,0,0,.16)` | Stronger borders |
| `track` | `rgba(255,255,255,.09)` | `rgba(0,0,0,.08)` | Progress-bar tracks |

**The `*glow` tokens are the neon effect.** They're box-shadows, applied
only to active/emphasis elements (active tab, running timer, completed set,
primary CTA). This is what makes the accents look like they emit light.
Use them sparingly — one glowing element per screen region.

---

## 2. Typography

- **Display / headers / numbers:** `Saira Condensed` (athletic, condensed —
  weights, reps, timers). Falls back to `Saira`, then `sans-serif`.
- **Body / UI:** `Saira` (regular width), fallback `system-ui, sans-serif`.
- **Icons:** `Material Symbols Rounded`.
- (`Inter` appears as a minor fallback in a couple of spots.)

**Weights in use:** 400 (body), 500, 600 (labels/UI), 700 (emphasis),
800 (big numbers & headers). Lean on 700–800 for anything glanceable
mid-workout.

**RN note:** Saira Condensed and Saira are Google Fonts. Load them via
`expo-font` / `@expo-google-fonts/saira` and
`@expo-google-fonts/saira-condensed`. Material Symbols → use an icon lib
(e.g. `@expo/vector-icons` MaterialCommunityIcons) rather than the web font.

---

## 3. Shape & Elevation

- **Border radius:** cards/large surfaces `16–20px`; medium controls
  `10–14px`; small chips/pills `5–8px`. Default to `16px` for cards.
- **Elevation:** dark mode leans on surface-color steps (s1→s2→s3) plus the
  neon glow for emphasis, not heavy drop shadows. Reserve real shadows
  (`0 40px 90px rgba(0,0,0,.5)`) for modals/overlays.
- **Neon accent line motif:** thin luminous strips (e.g. the logo underline
  `#5CF77B` bar) — use as active-state underlines and single accent rules.

---

## 4. Usage Rules (keep the neon disciplined)

1. ~90% of every screen is neutral (bg + surfaces + text). Accents are rare.
2. One accent meaning per context — green=progress/CTA, red=alert/intensity,
   blue=AI/info. Don't mix meanings.
3. Category color-coding (bodybuilding/powerlifting/etc.) is **undecided** —
   see PROJECT.md open question. If categories reuse the three neons, they
   compete with state colors. Leaning toward: state keeps the neons,
   categories get icons/labels only.
4. `*dim` tokens are for tinted backgrounds behind an accent (e.g. a green
   pill); `*glow` is for the light-emitting effect on active elements.
5. Light mode is a real deliverable, not an afterthought — every token has
   its light value above; wire a single theme switch.

---

## 5. How this connects to the build

- `design/ProFit.html` — visual reference (bundled preview, ~1.1MB). Do NOT
  import into the app; it's HTML, the app is React Native.
- `mobile/theme.ts` — the token object the app actually imports. Generated
  from this file (see companion `theme.ts`).
- When a screen is built, its colors/fonts/spacing must trace back to a
  token here. If a value isn't here, add it here first, then use it.
