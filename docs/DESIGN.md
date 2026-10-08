# ProFit Design System

Picked in the rebuild interview: Sandstone palette, Bebas Neue with Barlow, hub-tile Home, four
tabs, soft corners, dark by default with a light toggle. The code source of truth is
`mobile/src/theme/tokens.ts`; this file explains it. Components never hardcode a colour, font or
radius.

## Colour tokens

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `bg` | `#16120F` | `#F3EEE6` | Screen background |
| `surface` | `#211B17` | `#FFFCF7` | Cards, sheets, tab bar |
| `surface2` | `#2C241F` | `#E8E0D3` | Raised or pressed surfaces, tracks, inputs |
| `text` | `#F2EBE3` | `#231C16` | Primary text |
| `text2` | `#B0A497` | `#6B5E51` | Secondary text, labels, captions |
| `accent` | `#E57A52` | `#A84126` | Terracotta: primary actions, active tab, key numbers |
| `onAccent` | `#1C0D06` | `#FFFFFF` | Text and icons on `accent` |
| `accent2` | `#62B5A2` | `#2A6A5D` | Deep teal: progress, completion, "on target" |
| `onAccent2` | `#06201A` | `#FFFFFF` | Text and icons on `accent2` |
| `caution` | `#E0AE52` | `#83550E` | Amber: "close to target", gentle warnings |
| `line` | `rgba(242,235,227,0.10)` | `rgba(35,28,22,0.10)` | Hairline borders and dividers |

Rules:
- Terracotta and teal each have one job. Terracotta asks you to act; teal tells you something is
  done or on track.
- There is no red anywhere, including the nutrition calendar (on target uses teal, close uses
  amber, well off uses a muted neutral).
- Every text pairing above meets WCAG AA (4.5:1) on `bg`, `surface` and `surface2`. A unit test
  in `mobile/src/theme/__tests__/contrast.test.ts` enforces this.

### Changes from the interview pick
The light palette's terracotta was picked as `#C4522F`. On the Sandstone background it measured
3.96:1, below the 4.5:1 that small text needs, so it was deepened to `#A84126` with the same hue
(5.27:1 on the background, 4.65:1 on `surface2`). Teal, amber and secondary text were nudged
slightly for the same reason on `surface2`.
The dark palette is new: a warm charcoal version of Sandstone, since dark is the default theme.

## Type

| Role | Face | Size / line height | Use |
|---|---|---|---|
| `display` | Bebas Neue | 40 / 42 | Screen titles, the timer |
| `title` | Bebas Neue | 28 / 30 | Card and section titles |
| `stat` | Bebas Neue | 32 / 34 | Big numbers on tiles |
| `body` | Barlow Regular | 16 / 22 | Running text |
| `bodyStrong` | Barlow SemiBold | 16 / 22 | Emphasis, list item names |
| `label` | Barlow SemiBold | 12 / 16, uppercase, 0.8 letter spacing | Eyebrows and tile labels |
| `caption` | Barlow Regular | 13 / 18 | Helper text, metadata |

Bebas Neue has a single weight and only capitals, so it is used for short strings: titles,
numbers, timers. Anything longer than a short phrase is Barlow.

## Shape and spacing

- Radius: `sm` 8 (chips, inputs), `md` 14 (cards, the default), `lg` 22 (sheets, hub tiles), `pill` 999.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48. Screen side padding 16.
- Touch targets at least 44 by 44.

## Layout

- **Home:** greeting and date, a "Today" card with the next session and a Start button, then four
  hub tiles in a 2 by 2 grid: Workouts, Meals, Progress, Coach. Each tile shows one live figure.
- **Tabs:** Home, Train, Food, You. Library, community and settings open from these screens rather
  than taking a tab.
- **Theme:** dark by default; You lets the user pick Dark, Light, or Follow phone.
