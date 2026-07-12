import "dotenv/config";
import seedData from "./seed-data.json";
import { prisma } from "../src/db";

// Idempotent: upserts by stable slug id, safe to re-run.
async function main() {
  // Two passes so homeAlternativeId FKs resolve regardless of order.
  for (const e of seedData) {
    await prisma.exercise.upsert({
      where: { id: e.id },
      create: {
        id: e.id,
        name: e.name,
        category: e.category as never,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles,
        equipment: e.equipment,
        demoUrl: e.demoUrl,
        instructions: e.instructions,
      },
      update: {
        name: e.name,
        category: e.category as never,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles,
        equipment: e.equipment,
        demoUrl: e.demoUrl,
        instructions: e.instructions,
      },
    });
  }
  for (const e of seedData) {
    await prisma.exercise.update({
      where: { id: e.id },
      data: { homeAlternativeId: e.homeAlternativeId },
    });
  }
  console.log(`Seeded ${seedData.length} exercises`);
}

main().finally(() => prisma.$disconnect());
