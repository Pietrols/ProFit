// Piece 3: conversational plan builder inside the AI coach. The model can
// ONLY ask onboarding-category questions or propose a plan assembled from the
// starter-template set (Piece 1) or the existing exercise library — the Zod
// schema rejects any invented exercise or template id, and aiJson's
// validate→retry→fallback loop turns persistent invention into a clean
// AI_UNAVAILABLE, never invented content. The server NEVER writes a plan from
// here: the client must confirm explicitly and call the normal plan-creation
// endpoints.
import { z } from "zod";
import { prisma } from "../db";
import { aiJson, AiTransport } from "../lib/aiJson";
import { ApiError } from "../lib/errors";
import { buildContext, checkRateLimit } from "./chat.service";
import {
  STARTER_TEMPLATES,
  TEMPLATE_DISCLAIMER,
} from "./starterTemplates";

export interface BuilderMessage {
  role: "user" | "assistant";
  content: string;
}

const TEMPLATE_IDS = STARTER_TEMPLATES.map((t) => t.id) as [string, ...string[]];

/** Schema is built per-request so exercise ids validate against the live library. */
function buildSchema(knownExerciseIds: Set<string>) {
  const exerciseId = z
    .string()
    .refine((id) => knownExerciseIds.has(id), "not an exercise in the library");

  return z.discriminatedUnion("action", [
    z.object({
      action: z.literal("ask"),
      question: z.string().min(1).max(500),
    }),
    z.object({
      action: z.literal("propose"),
      summary: z.string().min(1).max(500),
      proposal: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("template"),
          templateId: z.enum(TEMPLATE_IDS),
          context: z.enum(["home", "gym"]),
          experience: z.enum(["beginner", "intermediate", "advanced"]),
        }),
        z.object({
          kind: z.literal("custom"),
          name: z.string().min(1).max(60),
          context: z.enum(["home", "gym"]),
          days: z
            .array(
              z.object({
                name: z.string().min(1).max(40),
                category: z.enum([
                  "bodybuilding",
                  "powerlifting",
                  "crossfit",
                  "cardio",
                ]),
                exercises: z
                  .array(
                    z.object({
                      exerciseId,
                      sets: z.int().min(1).max(6),
                      reps: z.string().min(1).max(30),
                      restSeconds: z.int().min(0).max(300),
                      durationSeconds: z
                        .int()
                        .min(0)
                        .max(3600)
                        .nullable()
                        .default(null),
                    }),
                  )
                  .min(1)
                  .max(8),
              }),
            )
            .min(1)
            .max(6),
        }),
      ]),
    }),
  ]);
}

export type BuilderReply = z.infer<ReturnType<typeof buildSchema>>;

// Grounded in Piece 1's verified programming rationale (see the RATIONALE
// comment in starterTemplates.ts): template set + library are the knowledge
// boundary; ladder logic and disclaimer language come from there too.
function buildSystemPrompt(
  exercises: {
    id: string;
    name: string;
    movementPattern: string | null;
    difficultyTier: number | null;
    equipment: string[];
  }[],
): string {
  const templateCatalog = STARTER_TEMPLATES.map(
    (t) =>
      `- ${t.id}: "${t.title}" (goal: ${t.goal}${t.gentle ? ", gentle" : ""}; contexts: ${t.contexts.join("/")}) — ${t.description}`,
  ).join("\n");
  const exerciseCatalog = exercises
    .map(
      (e) =>
        `${e.id} | ${e.name} | ${e.movementPattern ?? "-"}${e.difficultyTier ? ` t${e.difficultyTier}` : ""} | ${e.equipment.join(",")}`,
    )
    .join("\n");

  return `You are the ProFit coach helping a user build a workout plan through a short conversation.

RULES
- Ask AT MOST one short question per turn, covering only these areas (skip any already answered in the conversation or known from the context JSON): training experience, whether they'd prefer a gentler pace, home or gym, their goal, and any joints/injuries to work around.
- The user's goal is whatever THEY say it is. Never infer or assume a goal from age, sex, or anything else.
- Once you know enough, propose ONE plan. Strongly prefer a starter template from the catalog below — they follow evidence-based beginner programming (2-3 full-body days/week, 8-15 reps leaving 2-3 in reserve, load added only when controlled; gentle variants use supported, low-strain movements). Only assemble a custom arrangement when no template fits the user's stated needs, and then only from the exercise catalog below, using its ids verbatim.
- Progression ladders: exercises tagged with the same movement pattern and adjacent tiers (t1 easiest → t4 hardest) are interchangeable rungs — pick lower tiers for newer or injury-cautious users.
- Never invent exercises, coaching cues, or medical claims. You are not a medical professional; if injuries come up, keep intensity modest and mention: "${TEMPLATE_DISCLAIMER}"
- Respond with ONLY a JSON object, no prose outside it:
  {"action":"ask","question":"..."}
  or {"action":"propose","summary":"1-3 sentences on why this fits","proposal":{"kind":"template","templateId":"...","context":"home|gym","experience":"beginner|intermediate|advanced"}}
  or {"action":"propose","summary":"...","proposal":{"kind":"custom","name":"...","context":"home|gym","days":[{"name":"...","category":"bodybuilding|powerlifting|crossfit|cardio","exercises":[{"exerciseId":"...","sets":3,"reps":"8-12","restSeconds":90,"durationSeconds":null}]}]}}

STARTER TEMPLATES
${templateCatalog}

EXERCISE LIBRARY (id | name | pattern tier | equipment)
${exerciseCatalog}`;
}

const FALLBACK: BuilderReply = { action: "ask", question: "" };

/**
 * One turn of the builder conversation. Stateless on the server: the client
 * sends the builder transcript each turn. Nothing is persisted or written.
 */
export async function planBuilderTurn(
  userId: string,
  messages: BuilderMessage[],
  transport?: AiTransport,
) {
  checkRateLimit(userId);

  const exercises = await prisma.exercise.findMany({
    select: {
      id: true,
      name: true,
      movementPattern: true,
      difficultyTier: true,
      equipment: true,
    },
    orderBy: { id: "asc" },
  });
  const schema = buildSchema(new Set(exercises.map((e) => e.id)));
  const context = await buildContext(userId);

  const prompt = [
    `<context>\n${context}\n</context>`,
    ...messages.map(
      (m) => `${m.role === "user" ? "User" : "Coach"}: ${m.content}`,
    ),
    "Coach (JSON only):",
  ].join("\n\n");

  const { value, source } = await aiJson({
    prompt,
    system: buildSystemPrompt(exercises),
    schema,
    fallback: () => FALLBACK,
    transport,
  });

  if (source === "fallback") {
    // AI off, model error, or persistent schema violations (e.g. invented
    // exercises) — same clean degrade as the chat companion.
    throw new ApiError(
      503,
      "AI_UNAVAILABLE",
      "The coach is unavailable right now — your data and workouts are unaffected.",
    );
  }
  return value;
}
