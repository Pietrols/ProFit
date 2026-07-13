-- AlterTable
ALTER TABLE "plan_exercises" ADD COLUMN     "duration_seconds" INTEGER;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "auto_advance_timers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "default_rest_seconds" INTEGER,
ADD COLUMN     "is_custom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "work_interval_seconds" INTEGER;
