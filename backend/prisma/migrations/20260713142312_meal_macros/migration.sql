-- AlterTable
ALTER TABLE "meal_logs" ADD COLUMN     "calories" DOUBLE PRECISION,
ADD COLUMN     "carbs_g" DOUBLE PRECISION,
ADD COLUMN     "estimated_fields" TEXT[],
ADD COLUMN     "fat_g" DOUBLE PRECISION,
ADD COLUMN     "protein_g" DOUBLE PRECISION;
