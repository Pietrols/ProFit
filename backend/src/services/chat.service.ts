// Phase 8: context-aware chat over the user's own plan, logs, and goal.
// Server-proxied (the key never reaches the device), rate-limited, history
// persisted. Free-text answers are allowed here — nowhere else.
import { prisma } from "../db";
import { ApiError } from "../lib/errors";
import { AiTransport, aiText } from "../lib/aiJson";

// ---- simple in-memory per-user rate limit (single-instance deployment) ----
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const sendTimes = new Map<string, number[]>();

/** Shared with the plan builder (Piece 3) so both draw one hourly budget. */
export function checkRateLimit(userId: string) {
  const now = Date.now();
  const times = (sendTimes.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) {
    throw new ApiError(429, "CHAT_RATE_LIMITED", "Coach chat limit reached — try again in a bit.");
  }
  times.push(now);
  sendTimes.set(userId, times);
}

/** Test hook — clears the in-memory limiter. */
export function resetRateLimit() {
  sendTimes.clear();
}

// ---- context assembly: only the user's own data ----
export async function buildContext(userId: string): Promise<string> {
  const [user, plan, sessions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.plan.findFirst({
      where: { userId, isActive: true },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            exercises: {
              orderBy: { order: "asc" },
              include: {
                exercise: {
                  select: {
                    name: true,
                    equipment: true,
                    primaryMuscles: true,
                    homeAlternative: { select: { name: true, equipment: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.workoutSession.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: { startedAt: true, dayName: true, delta: true },
    }),
  ]);

  return JSON.stringify({
    profile: {
      goal: user?.goal,
      trainingContext: user?.defaultContext,
      units: user?.units,
      abilityLevel: user?.abilityLevel,
      trainingDaysPerWeek: user?.trainingDays,
    },
    activePlan: plan
      ? {
          name: plan.name,
          context: plan.context,
          days: plan.days.map((d) => ({
            name: d.name,
            category: d.category,
            exercises: d.exercises.map((pe) => ({
              name: pe.exercise.name,
              sets: pe.sets,
              reps: pe.reps,
              equipment: pe.exercise.equipment,
              primaryMuscles: pe.exercise.primaryMuscles,
              homeAlternative: pe.exercise.homeAlternative
                ? {
                    name: pe.exercise.homeAlternative.name,
                    equipment: pe.exercise.homeAlternative.equipment,
                  }
                : null,
            })),
          })),
        }
      : null,
    recentSessions: sessions.map((s) => ({
      startedAt: s.startedAt.toISOString(),
      dayName: s.dayName,
      delta: s.delta,
    })),
  });
}

const SYSTEM_PROMPT = `You are the ProFit coach — a knowledgeable, encouraging strength and fitness companion inside the user's workout app.
You can see the user's profile, active plan (with equipment tags and curated home alternatives), and recent planned-vs-actual session summaries in the context JSON.
Ground every answer in that context: respect their training context (home/gym) and equipment when suggesting swaps, reference their actual numbers when asked about progress, and match their goal.
Keep answers short and practical (2-5 sentences). Never invent data that is not in the context. You are not a medical professional — for pain or injury, suggest easing off and seeing a professional.`;

export async function sendMessage(
  userId: string,
  message: string,
  transport?: AiTransport,
) {
  checkRateLimit(userId);

  const history = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const context = await buildContext(userId);

  const prompt = [
    `<context>\n${context}\n</context>`,
    ...history
      .reverse()
      .map((m) => `${m.role === "user" ? "User" : "Coach"}: ${m.content}`),
    `User: ${message}`,
    "Coach:",
  ].join("\n\n");

  const reply = await aiText({ prompt, system: SYSTEM_PROMPT, transport });
  if (reply === null) {
    // AI off or model error — clear unavailable state, never a crash.
    // The user's message is intentionally NOT persisted: nothing answered it.
    throw new ApiError(
      503,
      "AI_UNAVAILABLE",
      "The coach is unavailable right now — your data and workouts are unaffected.",
    );
  }

  const [, assistantMessage] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { userId, role: "user", content: message },
    }),
    prisma.chatMessage.create({
      data: { userId, role: "assistant", content: reply },
    }),
  ]);
  return { reply: assistantMessage };
}

export async function getHistory(userId: string) {
  return prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}
