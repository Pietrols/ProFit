-- AlterTable
ALTER TABLE "user_workouts" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "workout_reports" (
    "id" TEXT NOT NULL,
    "workout_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workout_reports_workout_id_reporter_id_key" ON "workout_reports"("workout_id", "reporter_id");

-- AddForeignKey
ALTER TABLE "workout_reports" ADD CONSTRAINT "workout_reports_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "user_workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
