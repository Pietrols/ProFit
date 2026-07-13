-- CreateTable
CREATE TABLE "user_workouts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "cover_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_workout_exercises" (
    "id" TEXT NOT NULL,
    "workout_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "rest_seconds" INTEGER NOT NULL,
    "duration_seconds" INTEGER,

    CONSTRAINT "user_workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_workouts_is_public_created_at_idx" ON "user_workouts"("is_public", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_workout_exercises_workout_id_order_key" ON "user_workout_exercises"("workout_id", "order");

-- AddForeignKey
ALTER TABLE "user_workouts" ADD CONSTRAINT "user_workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workout_exercises" ADD CONSTRAINT "user_workout_exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "user_workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workout_exercises" ADD CONSTRAINT "user_workout_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
