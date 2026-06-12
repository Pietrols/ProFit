-- CreateEnum
CREATE TYPE "GoalMode" AS ENUM ('BULKING', 'CUTTING', 'MAINTAINING');

-- CreateEnum
CREATE TYPE "Equipment" AS ENUM ('FULL_GYM', 'HOME_BASIC', 'BODYWEIGHT');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "PortionModifier" AS ENUM ('SMALLER', 'USUAL', 'BIGGER');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('CALIBRATION', 'SPLIT_PROPOSAL', 'SESSION_DEBRIEF', 'VARIATION_INJECTION', 'DIET_POINTERS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goalMode" "GoalMode" NOT NULL DEFAULT 'MAINTAINING',
    "units" TEXT NOT NULL DEFAULT 'kg',
    "equipment" "Equipment" NOT NULL DEFAULT 'FULL_GYM',
    "bodyweightKg" DOUBLE PRECISION,
    "calibrated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbilityProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "muscleGroup" TEXT NOT NULL,
    "levelScore" INTEGER NOT NULL,
    "rationale" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbilityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryMuscles" TEXT[],
    "secondaryMuscles" TEXT[],
    "equipment" "Equipment" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "demoAssetUrl" TEXT,
    "cues" TEXT[],
    "mistakes" TEXT[],

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Split" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Split_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitDay" (
    "id" TEXT NOT NULL,
    "splitId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "SplitDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedExercise" (
    "id" TEXT NOT NULL,
    "splitDayId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "targetSets" INTEGER NOT NULL,
    "repRangeLow" INTEGER NOT NULL,
    "repRangeHigh" INTEGER NOT NULL,

    CONSTRAINT "PlannedExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "splitDayId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "wasInjected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExerciseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetLog" (
    "id" TEXT NOT NULL,
    "exerciseLogId" TEXT NOT NULL,
    "setIndex" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL,
    "restSecondsAfter" INTEGER,
    "rpe" INTEGER,

    CONSTRAINT "SetLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealProfileItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "portionUnit" TEXT NOT NULL,
    "estKcal" INTEGER,
    "estProteinG" INTEGER,
    "estCarbsG" INTEGER,
    "estFatG" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MealProfileItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "itemId" TEXT,
    "freeText" TEXT,
    "modifier" "PortionModifier" NOT NULL DEFAULT 'USUAL',
    "note" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "InsightType" NOT NULL,
    "payload" JSONB NOT NULL,
    "accepted" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AbilityProfile_userId_muscleGroup_key" ON "AbilityProfile"("userId", "muscleGroup");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SplitDay_splitId_dayIndex_key" ON "SplitDay"("splitId", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedExercise_splitDayId_order_key" ON "PlannedExercise"("splitDayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "SetLog_exerciseLogId_setIndex_key" ON "SetLog"("exerciseLogId", "setIndex");

-- CreateIndex
CREATE INDEX "MealLog_userId_date_idx" ON "MealLog"("userId", "date");

-- CreateIndex
CREATE INDEX "AiInsight_userId_type_createdAt_idx" ON "AiInsight"("userId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "AbilityProfile" ADD CONSTRAINT "AbilityProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Split" ADD CONSTRAINT "Split_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitDay" ADD CONSTRAINT "SplitDay_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "Split"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedExercise" ADD CONSTRAINT "PlannedExercise_splitDayId_fkey" FOREIGN KEY ("splitDayId") REFERENCES "SplitDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedExercise" ADD CONSTRAINT "PlannedExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_splitDayId_fkey" FOREIGN KEY ("splitDayId") REFERENCES "SplitDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetLog" ADD CONSTRAINT "SetLog_exerciseLogId_fkey" FOREIGN KEY ("exerciseLogId") REFERENCES "ExerciseLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealProfileItem" ADD CONSTRAINT "MealProfileItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MealProfileItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
