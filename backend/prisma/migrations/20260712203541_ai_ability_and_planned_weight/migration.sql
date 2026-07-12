-- CreateEnum
CREATE TYPE "AbilityLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ability_level" "AbilityLevel";

-- AlterTable
ALTER TABLE "workout_sets" ADD COLUMN     "planned_weight_kg" DOUBLE PRECISION;
