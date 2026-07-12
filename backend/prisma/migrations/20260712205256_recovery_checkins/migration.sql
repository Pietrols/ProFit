-- CreateTable
CREATE TABLE "recovery_checkins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "soreness" INTEGER NOT NULL,
    "sleep_quality" INTEGER NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovery_checkins_user_id_logged_at_idx" ON "recovery_checkins"("user_id", "logged_at");

-- AddForeignKey
ALTER TABLE "recovery_checkins" ADD CONSTRAINT "recovery_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
