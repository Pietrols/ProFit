-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- CreateTable
CREATE TABLE "meal_profile_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typical_portion" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meal_profile_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portion" TEXT NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_profile_items_user_id_idx" ON "meal_profile_items"("user_id");

-- CreateIndex
CREATE INDEX "meal_logs_user_id_logged_at_idx" ON "meal_logs"("user_id", "logged_at");

-- AddForeignKey
ALTER TABLE "meal_profile_items" ADD CONSTRAINT "meal_profile_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
