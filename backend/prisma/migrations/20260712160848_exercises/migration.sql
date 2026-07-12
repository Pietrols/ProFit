-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('bodybuilding', 'powerlifting', 'crossfit', 'cardio');

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ExerciseCategory" NOT NULL,
    "primary_muscles" TEXT[],
    "secondary_muscles" TEXT[],
    "equipment" TEXT[],
    "demo_url" TEXT NOT NULL,
    "instructions" TEXT[],
    "home_alternative_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_home_alternative_id_fkey" FOREIGN KEY ("home_alternative_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
