// Piece 1: starter plan templates, built on the movement-pattern progression
// ladders. Templates reference library exercises by slug only — resolution
// validates every slug against the DB, so a template can never invent an
// exercise.
//
// RATIONALE (internal, not user-facing): programming here follows widely
// published beginner guidance rather than invented prescriptions —
// - Frequency: full-body strength 2–3 non-consecutive days/week (CDC/WHO
//   physical-activity guidelines; ACSM position stands for novice trainees).
// - Older/deconditioned starts: chair- and wall-supported movements plus
//   balance work (marches, seated rotations), mirroring NHS "strength and
//   balance" and fall-prevention programming; effort kept sub-maximal with a
//   per-exercise "stop if a joint hurts" cue.
// - Novice loading: 1–2 rounds (gentle) to 3 sets of 8–15 reps, leaving 2–3
//   reps in reserve (RIR), progressing load only after all sets feel
//   controlled for two consecutive sessions (standard NSCA/ACSM novice
//   double-progression).
// - Fat-loss starter: strength base + low-impact walk/jog intervals; jump-
//   heavy/plyometric work deliberately excluded at this level. Daily walking
//   noted as the cheapest adherence lever.
// - Emphasis templates ("chest/arms/shoulders", "glutes/legs") stay full-body
//   with extra volume on the emphasized patterns — novices respond to
//   balanced full-body work; emphasis is volume, not exclusion.

export type TemplateContext = "home" | "gym";
export type TemplateExperience = "beginner" | "intermediate" | "advanced";
export type TemplateGoal =
  | "general"
  | "fat_loss"
  | "chest_arms_shoulders"
  | "glutes_legs";

export const TEMPLATE_DISCLAIMER =
  "ProFit offers general fitness information, not medical advice. Check with " +
  "your doctor before starting a new exercise program — especially if you " +
  "have joint, heart, or other existing health conditions.";

interface TemplateExercise {
  ex: string; // canonical slug (gym/standard form)
  home?: string; // context override
  beginner?: string; // experience override (applied after context)
  sets: number;
  reps: string;
  restSeconds: number;
  durationSeconds?: number | null;
  note?: string;
}

interface TemplateDay {
  name: string;
  category: "bodybuilding" | "cardio";
  exercises: TemplateExercise[];
}

export interface StarterTemplate {
  id: string;
  title: string;
  description: string; // user-facing
  disclaimer: string; // user-facing
  goal: TemplateGoal;
  gentle: boolean; // suited to older / fully deconditioned starters
  contexts: TemplateContext[]; // which contexts this template supports
  defaultRestSeconds: number;
  days: TemplateDay[];
}

const STOP_CUE = "Stop if a joint hurts — gentle effort only.";
const RIR_CUE = "Leave 2–3 reps in reserve.";
const LOAD_CUE =
  "Add a little weight once all sets feel controlled two sessions in a row.";

const gentleEx = (
  ex: string,
  reps = "6-10, slow",
  durationSeconds: number | null = null,
): TemplateExercise => ({
  ex,
  sets: 2,
  reps,
  restSeconds: 75,
  durationSeconds,
  note: STOP_CUE,
});

// Foundations day structures are shared with Fat Loss (its strength days).
const FOUNDATIONS_HOME_DAYS: TemplateDay[] = [
  {
    name: "Full Body A",
    category: "bodybuilding",
    exercises: [
      { ex: "bodyweight-squat", beginner: "partial-bodyweight-squat", sets: 3, reps: "10-15", restSeconds: 75, note: RIR_CUE },
      { ex: "pushups", beginner: "incline-push-up", sets: 3, reps: "10-15", restSeconds: 75, note: RIR_CUE },
      { ex: "band-pull-apart", sets: 3, reps: "12-15", restSeconds: 60, note: RIR_CUE },
      { ex: "plank", beginner: "dead-bug", sets: 3, reps: "hold", restSeconds: 60, durationSeconds: 30 },
    ],
  },
  {
    name: "Full Body B",
    category: "bodybuilding",
    exercises: [
      { ex: "butt-lift-bridge", sets: 3, reps: "10-15", restSeconds: 75, note: RIR_CUE },
      { ex: "bent-over-two-dumbbell-row", sets: 3, reps: "10-15", restSeconds: 75, note: RIR_CUE },
      { ex: "bodyweight-walking-lunge", beginner: "dumbbell-step-ups", sets: 3, reps: "10-12/side", restSeconds: 75, note: RIR_CUE },
      { ex: "dead-bug", sets: 3, reps: "8-10/side", restSeconds: 60 },
    ],
  },
  {
    name: "Full Body C",
    category: "bodybuilding",
    exercises: [
      { ex: "bodyweight-squat", beginner: "partial-bodyweight-squat", sets: 3, reps: "10-15", restSeconds: 75, note: RIR_CUE },
      { ex: "incline-push-up", sets: 3, reps: "10-15", restSeconds: 75, note: RIR_CUE },
      { ex: "single-leg-glute-bridge", beginner: "butt-lift-bridge", sets: 3, reps: "8-12/side", restSeconds: 75, note: RIR_CUE },
      { ex: "bird-dog", sets: 3, reps: "8/side", restSeconds: 60 },
    ],
  },
];

const FOUNDATIONS_GYM_DAYS: TemplateDay[] = [
  {
    name: "Full Body A",
    category: "bodybuilding",
    exercises: [
      { ex: "leg-press", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "dumbbell-bench-press", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "seated-cable-rows", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "plank", sets: 3, reps: "hold", restSeconds: 60, durationSeconds: 30 },
    ],
  },
  {
    name: "Full Body B",
    category: "bodybuilding",
    exercises: [
      { ex: "barbell-hip-thrust", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "dumbbell-shoulder-press", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "wide-grip-lat-pulldown", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "dead-bug", sets: 3, reps: "8-10/side", restSeconds: 60 },
    ],
  },
  {
    name: "Full Body C",
    category: "bodybuilding",
    exercises: [
      { ex: "goblet-squat", beginner: "leg-press", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "stiff-legged-dumbbell-deadlift", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "dumbbell-bench-press", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
      { ex: "seated-cable-rows", sets: 3, reps: "8-12", restSeconds: 120, note: LOAD_CUE },
    ],
  },
];

const INTERVAL_DAY = (n: string): TemplateDay => ({
  name: n,
  category: "cardio",
  exercises: [
    {
      ex: "running-treadmill",
      home: "trail-running-walking",
      sets: 8,
      reps: "1 min brisk / 2 min easy",
      restSeconds: 0,
      note: "Low-impact — walk the easy minutes. No jumping needed.",
    },
  ],
});

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "gentle-start",
    title: "Gentle Start",
    description:
      "For anyone new to movement, returning after a long break, or wanting a " +
      "kinder pace — supported, low-strain versions of every movement, three " +
      "short sessions a week with rest days between.",
    disclaimer: TEMPLATE_DISCLAIMER,
    goal: "general",
    gentle: true,
    contexts: ["home", "gym"],
    defaultRestSeconds: 75,
    days: [
      {
        name: "Gentle Session A",
        category: "bodybuilding",
        exercises: [
          gentleEx("chair-squat"),
          gentleEx("wall-push-up"),
          gentleEx("standing-march", "10/side"),
          gentleEx("bird-dog", "6/side"),
        ],
      },
      {
        name: "Gentle Session B",
        category: "bodybuilding",
        exercises: [
          gentleEx("pelvic-tilt-into-bridge"),
          gentleEx("band-pull-apart", "10-12"),
          gentleEx("seated-torso-rotation", "8/side"),
          gentleEx("standing-march", "10/side"),
        ],
      },
      {
        name: "Gentle Session C",
        category: "bodybuilding",
        exercises: [
          gentleEx("chair-squat"),
          gentleEx("wall-push-up"),
          gentleEx("pelvic-tilt-into-bridge"),
          gentleEx("seated-torso-rotation", "8/side"),
        ],
      },
    ],
  },
  {
    id: "foundations-home",
    title: "Beginner Foundations — Home",
    description:
      "Full-body basics three times a week with just your bodyweight, a " +
      "band, and a pair of dumbbells. Three rounds of 10–15, always leaving " +
      "a couple of reps in the tank.",
    disclaimer: TEMPLATE_DISCLAIMER,
    goal: "general",
    gentle: false,
    contexts: ["home"],
    defaultRestSeconds: 75,
    days: FOUNDATIONS_HOME_DAYS,
  },
  {
    id: "foundations-gym",
    title: "Beginner Foundations — Gym",
    description:
      "Full-body compound basics three non-consecutive days a week — a " +
      "squat, hinge, push, and pull pattern every session, 3×8–12, adding " +
      "weight only when it feels controlled.",
    disclaimer: TEMPLATE_DISCLAIMER,
    goal: "general",
    gentle: false,
    contexts: ["gym"],
    defaultRestSeconds: 120,
    days: FOUNDATIONS_GYM_DAYS,
  },
  {
    id: "fat-loss",
    title: "Fat Loss Focus",
    description:
      "Three full-body strength sessions plus two low-impact walk/jog " +
      "interval sessions a week. Daily walking on top is the quiet " +
      "difference-maker.",
    disclaimer: TEMPLATE_DISCLAIMER,
    goal: "fat_loss",
    gentle: false,
    contexts: ["home", "gym"],
    defaultRestSeconds: 90,
    // days resolved per-context below (strength days mirror Foundations)
    days: [], // placeholder — filled by resolveTemplate
  },
  {
    id: "chest-arms-shoulders",
    title: "Build Chest, Arms & Shoulders",
    description:
      "Full-body training with extra pushing and pulling volume — chest, " +
      "shoulders, and arms get the emphasis while legs and core keep pace.",
    disclaimer: TEMPLATE_DISCLAIMER,
    goal: "chest_arms_shoulders",
    gentle: false,
    contexts: ["home", "gym"],
    defaultRestSeconds: 90,
    days: [
      {
        name: "Push Focus A",
        category: "bodybuilding",
        exercises: [
          { ex: "pushups", beginner: "incline-push-up", sets: 3, reps: "10-15", restSeconds: 90, note: RIR_CUE },
          { ex: "dumbbell-shoulder-press", sets: 3, reps: "8-12", restSeconds: 90, note: RIR_CUE },
          { ex: "side-lateral-raise", sets: 3, reps: "12-15", restSeconds: 60, note: RIR_CUE },
          { ex: "bench-dips", sets: 3, reps: "8-12", restSeconds: 75, note: RIR_CUE },
          { ex: "bodyweight-squat", sets: 3, reps: "10-15", restSeconds: 75, note: RIR_CUE },
        ],
      },
      {
        name: "Push & Pull B",
        category: "bodybuilding",
        exercises: [
          { ex: "dumbbell-bench-press", home: "pushups", beginner: "incline-push-up", sets: 3, reps: "8-12", restSeconds: 90, note: RIR_CUE },
          { ex: "bent-over-two-dumbbell-row", sets: 3, reps: "8-12", restSeconds: 90, note: RIR_CUE },
          { ex: "alternate-hammer-curl", sets: 3, reps: "10-12", restSeconds: 60, note: RIR_CUE },
          { ex: "triceps-pushdown", home: "bench-dips", sets: 3, reps: "10-12", restSeconds: 60, note: RIR_CUE },
          { ex: "plank", sets: 3, reps: "hold", restSeconds: 60, durationSeconds: 30 },
        ],
      },
      {
        name: "Push Focus C",
        category: "bodybuilding",
        exercises: [
          { ex: "pushups", beginner: "incline-push-up", sets: 3, reps: "10-15", restSeconds: 90, note: RIR_CUE },
          { ex: "side-lateral-raise", sets: 3, reps: "12-15", restSeconds: 60, note: RIR_CUE },
          { ex: "band-pull-apart", sets: 3, reps: "12-15", restSeconds: 60, note: RIR_CUE },
          { ex: "bench-dips", sets: 3, reps: "8-12", restSeconds: 75, note: RIR_CUE },
          { ex: "dumbbell-lunges", sets: 3, reps: "8-10/side", restSeconds: 75, note: RIR_CUE },
        ],
      },
    ],
  },
  {
    id: "glutes-legs",
    title: "Build Glutes & Legs",
    description:
      "Full-body training weighted toward hinges and squats — bridges, " +
      "lunges, and squats carry the volume while the upper body keeps pace.",
    disclaimer: TEMPLATE_DISCLAIMER,
    goal: "glutes_legs",
    gentle: false,
    contexts: ["home", "gym"],
    defaultRestSeconds: 90,
    days: [
      {
        name: "Glutes & Legs A",
        category: "bodybuilding",
        exercises: [
          { ex: "bodyweight-squat", beginner: "partial-bodyweight-squat", sets: 3, reps: "10-15", restSeconds: 90, note: RIR_CUE },
          { ex: "butt-lift-bridge", sets: 3, reps: "12-15", restSeconds: 75, note: RIR_CUE },
          { ex: "dumbbell-lunges", sets: 3, reps: "8-10/side", restSeconds: 90, note: RIR_CUE },
          { ex: "glute-kickback", sets: 3, reps: "10-12/side", restSeconds: 60, note: RIR_CUE },
          { ex: "pushups", beginner: "incline-push-up", sets: 3, reps: "10-15", restSeconds: 75, note: RIR_CUE },
        ],
      },
      {
        name: "Glutes & Legs B",
        category: "bodybuilding",
        exercises: [
          { ex: "single-leg-glute-bridge", beginner: "butt-lift-bridge", sets: 3, reps: "8-12/side", restSeconds: 90, note: RIR_CUE },
          { ex: "split-squats", sets: 3, reps: "8-10/side", restSeconds: 90, note: RIR_CUE },
          { ex: "dumbbell-step-ups", sets: 3, reps: "8-10/side", restSeconds: 75, note: RIR_CUE },
          { ex: "bent-over-two-dumbbell-row", sets: 3, reps: "10-12", restSeconds: 75, note: RIR_CUE },
        ],
      },
      {
        name: "Glutes & Legs C",
        category: "bodybuilding",
        exercises: [
          { ex: "goblet-squat", beginner: "bodyweight-squat", sets: 3, reps: "8-12", restSeconds: 90, note: RIR_CUE },
          { ex: "stiff-legged-dumbbell-deadlift", beginner: "butt-lift-bridge", sets: 3, reps: "8-12", restSeconds: 90, note: RIR_CUE },
          { ex: "bodyweight-walking-lunge", sets: 3, reps: "10-12/side", restSeconds: 75, note: RIR_CUE },
          { ex: "glute-kickback", sets: 3, reps: "10-12/side", restSeconds: 60, note: RIR_CUE },
          { ex: "plank", sets: 3, reps: "hold", restSeconds: 60, durationSeconds: 30 },
        ],
      },
    ],
  },
];

export interface ResolvedTemplateDay {
  name: string;
  category: "bodybuilding" | "cardio";
  exercises: {
    exerciseId: string;
    sets: number;
    reps: string;
    restSeconds: number;
    durationSeconds: number | null;
    note: string | null;
  }[];
}

/** Resolve a template's day structure for a context + experience. */
export function resolveTemplateDays(
  template: StarterTemplate,
  context: TemplateContext,
  experience: TemplateExperience,
): ResolvedTemplateDay[] {
  // Fat Loss composes the matching Foundations strength days + 2 interval days.
  const days =
    template.id === "fat-loss"
      ? [
          ...(context === "home" ? FOUNDATIONS_HOME_DAYS : FOUNDATIONS_GYM_DAYS),
          INTERVAL_DAY("Intervals 1"),
          INTERVAL_DAY("Intervals 2"),
        ]
      : template.days;

  return days.map((d) => ({
    name: d.name,
    category: d.category,
    exercises: d.exercises.map((e) => {
      let id = context === "home" && e.home ? e.home : e.ex;
      if (experience === "beginner" && e.beginner) id = e.beginner;
      return {
        exerciseId: id,
        sets: e.sets,
        reps: e.reps,
        restSeconds: e.restSeconds,
        durationSeconds: e.durationSeconds ?? null,
        note: e.note ?? null,
      };
    }),
  }));
}
