-- CreateTable
CREATE TABLE "bodyweight_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bodyweight_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bodyweight_entries_user_id_logged_at_idx" ON "bodyweight_entries"("user_id", "logged_at");

-- AddForeignKey
ALTER TABLE "bodyweight_entries" ADD CONSTRAINT "bodyweight_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
