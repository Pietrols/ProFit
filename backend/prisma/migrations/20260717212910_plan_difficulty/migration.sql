-- CreateEnum
CREATE TYPE "PlanDifficulty" AS ENUM ('gentle', 'standard', 'challenging');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "difficulty" "PlanDifficulty" NOT NULL DEFAULT 'standard';
