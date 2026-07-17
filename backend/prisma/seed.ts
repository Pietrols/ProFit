import "dotenv/config";
import seedData from "./seed-data.json";
import { prisma } from "../src/db";

// Idempotent: upserts by stable slug id, safe to re-run.
async function main() {
  // Two passes so cross-references (home alternatives, ladder links) resolve
  // regardless of order.
  for (const e of seedData) {
    const fields = {
      name: e.name,
      category: e.category as never,
      primaryMuscles: e.primaryMuscles,
      secondaryMuscles: e.secondaryMuscles,
      equipment: e.equipment,
      demoUrl: e.demoUrl,
      instructions: e.instructions,
      movementPattern: (e.movementPattern ?? null) as never,
      difficultyTier: e.difficultyTier ?? null,
    };
    await prisma.exercise.upsert({
      where: { id: e.id },
      create: { id: e.id, ...fields },
      update: fields,
    });
  }
  for (const e of seedData) {
    await prisma.exercise.update({
      where: { id: e.id },
      data: {
        homeAlternativeId: e.homeAlternativeId,
        easierVariantId: e.easierVariantId ?? null,
        harderVariantId: e.harderVariantId ?? null,
      },
    });
  }
  console.log(`Seeded ${seedData.length} exercises`);
}

main().finally(() => prisma.$disconnect());
