-- CreateEnum
CREATE TYPE "MovementPattern" AS ENUM ('squat', 'hinge', 'push', 'pull', 'core', 'carry', 'cardio', 'balance');

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "difficulty_tier" INTEGER,
ADD COLUMN     "easier_variant_id" TEXT,
ADD COLUMN     "harder_variant_id" TEXT,
ADD COLUMN     "movement_pattern" "MovementPattern";

-- AlterTable
ALTER TABLE "plan_exercises" ADD COLUMN     "note" TEXT;
