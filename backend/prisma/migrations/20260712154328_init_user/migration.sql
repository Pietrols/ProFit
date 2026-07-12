-- CreateEnum
CREATE TYPE "Goal" AS ENUM ('bulking', 'cutting', 'maintaining');

-- CreateEnum
CREATE TYPE "TrainingContext" AS ENUM ('home', 'gym');

-- CreateEnum
CREATE TYPE "Units" AS ENUM ('kg', 'lb');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "goal" "Goal" NOT NULL DEFAULT 'maintaining',
    "training_days" INTEGER NOT NULL DEFAULT 3,
    "default_context" "TrainingContext" NOT NULL DEFAULT 'gym',
    "units" "Units" NOT NULL DEFAULT 'kg',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
