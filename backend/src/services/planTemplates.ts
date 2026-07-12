// Static split templates — Phase 3 is template-driven, no AI.
// A slot asks for a muscle target (strength) or a fixed exercise pick
// (crossfit/cardio, where the movement IS the prescription).

export type Category = "bodybuilding" | "powerlifting" | "crossfit" | "cardio";

export interface Slot {
  /** exercises qualify if any primaryMuscle matches one of these */
  muscles: string[];
  /** exact exercise ids to prefer, tried in order before muscle matching */
  prefer?: string[];
  sets: number;
  reps: string;
  restSeconds: number;
}

export interface DayTemplate {
  name: string;
  category: Category;
  slots: Slot[];
}

// Hypertrophy rest 60–90s, strength 180–300s per PROJECT.md.
const bb = (muscles: string[], sets = 3, reps = "8-12", rest = 90): Slot => ({
  muscles,
  sets,
  reps,
  restSeconds: rest,
});
const pl = (prefer: string[], muscles: string[], sets = 5, reps = "5", rest = 240): Slot => ({
  prefer,
  muscles,
  sets,
  reps,
  restSeconds: rest,
});

const BACK = ["lats", "middle back"];
const LEGS_ANT = ["quadriceps"];
const LEGS_POST = ["hamstrings", "glutes"];

// --- Bodybuilding day templates ---
const PUSH: DayTemplate = {
  name: "Push",
  category: "bodybuilding",
  slots: [
    bb(["chest"], 4),
    bb(["chest"]),
    bb(["shoulders"]),
    bb(["shoulders"], 3, "12-15", 60),
    bb(["triceps"]),
    bb(["triceps"], 3, "10-15", 60),
  ],
};
const PULL: DayTemplate = {
  name: "Pull",
  category: "bodybuilding",
  slots: [
    bb(BACK, 4),
    bb(BACK),
    bb(BACK, 3, "10-12", 75),
    bb(["biceps"]),
    bb(["biceps"], 3, "10-15", 60),
    bb(["abdominals"], 3, "12-20", 60),
  ],
};
const LEGS: DayTemplate = {
  name: "Legs",
  category: "bodybuilding",
  slots: [
    bb(LEGS_ANT, 4),
    bb(LEGS_POST, 4),
    bb(LEGS_ANT, 3, "10-15", 75),
    bb(LEGS_POST, 3, "10-15", 75),
    bb(["calves"], 4, "12-20", 45),
  ],
};
const UPPER: DayTemplate = {
  name: "Upper",
  category: "bodybuilding",
  slots: [
    bb(["chest"], 4),
    bb(BACK, 4),
    bb(["shoulders"]),
    bb(["biceps"], 3, "10-12", 60),
    bb(["triceps"], 3, "10-12", 60),
  ],
};
const LOWER: DayTemplate = {
  name: "Lower",
  category: "bodybuilding",
  slots: [
    bb(LEGS_ANT, 4),
    bb(LEGS_POST, 4),
    bb(LEGS_ANT, 3, "10-15", 75),
    bb(["calves"], 4, "12-20", 45),
    bb(["abdominals"], 3, "12-20", 60),
  ],
};
const FULL_BODY: DayTemplate = {
  name: "Full Body",
  category: "bodybuilding",
  slots: [
    bb(LEGS_ANT, 4),
    bb(["chest"], 4),
    bb(BACK, 4),
    bb(["shoulders"]),
    bb(LEGS_POST),
    bb(["abdominals"], 3, "12-20", 60),
  ],
};

// --- Powerlifting day templates (SBD focus, %1RM programming later) ---
const SQUAT_DAY: DayTemplate = {
  name: "Squat Day",
  category: "powerlifting",
  slots: [
    pl(["barbell-squat"], LEGS_ANT),
    pl(["box-squat"], LEGS_ANT, 3, "3", 240),
    bb(LEGS_POST, 3, "8-10", 120),
    bb(["abdominals"], 3, "10-15", 90),
  ],
};
const BENCH_DAY: DayTemplate = {
  name: "Bench Day",
  category: "powerlifting",
  slots: [
    pl(["bench-press-powerlifting"], ["chest"]),
    pl(["close-grip-barbell-bench-press"], ["triceps"], 3, "6-8", 180),
    bb(["shoulders"], 3, "8-10", 120),
    bb(BACK, 3, "8-12", 120),
  ],
};
const DEADLIFT_DAY: DayTemplate = {
  name: "Deadlift Day",
  category: "powerlifting",
  slots: [
    pl(["barbell-deadlift"], LEGS_POST),
    pl(["clean-deadlift"], LEGS_POST, 3, "3-5", 240),
    bb(BACK, 3, "8-10", 120),
    bb(["abdominals"], 3, "10-15", 90),
  ],
};
const SBD_DAY: DayTemplate = {
  name: "Full SBD",
  category: "powerlifting",
  slots: [
    pl(["barbell-squat"], LEGS_ANT, 3, "5", 240),
    pl(["bench-press-powerlifting"], ["chest"], 3, "5", 240),
    pl(["barbell-deadlift"], LEGS_POST, 3, "5", 300),
  ],
};

// --- CrossFit WOD templates ---
const WOD_A: DayTemplate = {
  name: "WOD — Barbell + Box",
  category: "crossfit",
  slots: [
    { prefer: ["clean-and-jerk"], muscles: LEGS_POST, sets: 5, reps: "3", restSeconds: 120 },
    { prefer: ["front-box-jump"], muscles: LEGS_ANT, sets: 4, reps: "AMRAP 60 s", restSeconds: 90 },
    { prefer: ["mountain-climbers"], muscles: ["quadriceps"], sets: 4, reps: "EMOM 45 s", restSeconds: 60 },
  ],
};
const WOD_B: DayTemplate = {
  name: "WOD — Kettlebell",
  category: "crossfit",
  slots: [
    { prefer: ["one-arm-kettlebell-swings"], muscles: LEGS_POST, sets: 5, reps: "15/side", restSeconds: 75 },
    { prefer: ["kettlebell-thruster"], muscles: ["shoulders"], sets: 4, reps: "RFT 10", restSeconds: 90 },
    { prefer: ["kettlebell-turkish-get-up-lunge-style"], muscles: ["shoulders"], sets: 3, reps: "3/side", restSeconds: 120 },
  ],
};
const WOD_C: DayTemplate = {
  name: "WOD — Gymnastic",
  category: "crossfit",
  slots: [
    { prefer: ["power-snatch"], muscles: LEGS_POST, sets: 5, reps: "2", restSeconds: 150 },
    { prefer: ["ring-dips"], muscles: ["triceps"], sets: 4, reps: "AMRAP", restSeconds: 90 },
    { prefer: ["mountain-climbers"], muscles: ["quadriceps"], sets: 4, reps: "Tabata 20/10", restSeconds: 60 },
  ],
};

// --- Cardio day templates ---
const STEADY: DayTemplate = {
  name: "Steady State",
  category: "cardio",
  slots: [
    { muscles: ["quadriceps", "hamstrings", "calves"], sets: 1, reps: "25-40 min zone 2", restSeconds: 0 },
  ],
};
const INTERVALS: DayTemplate = {
  name: "Intervals",
  category: "cardio",
  slots: [
    { muscles: ["quadriceps", "hamstrings", "calves"], sets: 8, reps: "1 min hard / 2 min easy", restSeconds: 120 },
  ],
};

/** Split rotations per category, keyed by how many days of that category. */
const ROTATIONS: Record<Category, Record<number, DayTemplate[]>> = {
  bodybuilding: {
    1: [FULL_BODY],
    2: [UPPER, LOWER],
    3: [PUSH, PULL, LEGS],
    4: [UPPER, LOWER, UPPER, LOWER],
    5: [PUSH, PULL, LEGS, UPPER, LOWER],
    6: [PUSH, PULL, LEGS, PUSH, PULL, LEGS],
    7: [PUSH, PULL, LEGS, UPPER, LOWER, FULL_BODY, FULL_BODY],
  },
  powerlifting: {
    1: [SBD_DAY],
    2: [SQUAT_DAY, BENCH_DAY],
    3: [SQUAT_DAY, BENCH_DAY, DEADLIFT_DAY],
    4: [SQUAT_DAY, BENCH_DAY, DEADLIFT_DAY, SBD_DAY],
    5: [SQUAT_DAY, BENCH_DAY, DEADLIFT_DAY, SQUAT_DAY, BENCH_DAY],
    6: [SQUAT_DAY, BENCH_DAY, DEADLIFT_DAY, SQUAT_DAY, BENCH_DAY, DEADLIFT_DAY],
    7: [SQUAT_DAY, BENCH_DAY, DEADLIFT_DAY, SQUAT_DAY, BENCH_DAY, DEADLIFT_DAY, SBD_DAY],
  },
  crossfit: {
    1: [WOD_A], 2: [WOD_A, WOD_B], 3: [WOD_A, WOD_B, WOD_C],
    4: [WOD_A, WOD_B, WOD_C, WOD_A], 5: [WOD_A, WOD_B, WOD_C, WOD_A, WOD_B],
    6: [WOD_A, WOD_B, WOD_C, WOD_A, WOD_B, WOD_C],
    7: [WOD_A, WOD_B, WOD_C, WOD_A, WOD_B, WOD_C, WOD_A],
  },
  cardio: {
    1: [STEADY], 2: [STEADY, INTERVALS], 3: [STEADY, INTERVALS, STEADY],
    4: [STEADY, INTERVALS, STEADY, INTERVALS],
    5: [STEADY, INTERVALS, STEADY, INTERVALS, STEADY],
    6: [STEADY, INTERVALS, STEADY, INTERVALS, STEADY, INTERVALS],
    7: [STEADY, INTERVALS, STEADY, INTERVALS, STEADY, INTERVALS, STEADY],
  },
};

/**
 * Resolve day templates for a requested category sequence, e.g.
 * [bb, bb, bb, cardio] → [Push, Pull, Legs, Steady State].
 * Within each category the split is chosen by that category's day count,
 * so a custom mix still gets a coherent split per discipline.
 */
export function resolveDayTemplates(categories: Category[]): DayTemplate[] {
  const counts = new Map<Category, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);

  const cursors = new Map<Category, number>();
  return categories.map((c) => {
    const rotation = ROTATIONS[c][counts.get(c)!];
    const i = cursors.get(c) ?? 0;
    cursors.set(c, i + 1);
    return rotation[i];
  });
}

/** Major muscle groups a weekly strength plan must not leave at zero. */
export const MAJOR_GROUPS: string[][] = [
  ["chest"],
  ["lats", "middle back"],
  ["shoulders"],
  ["quadriceps"],
  ["hamstrings", "glutes"],
];
