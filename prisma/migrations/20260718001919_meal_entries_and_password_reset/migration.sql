-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- AlterTable
ALTER TABLE "otp_codes" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'register',
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "meal_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "log_date" DATE NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "name" TEXT,
    "calories" DECIMAL(7,2),
    "proteins_g" DECIMAL(7,2),
    "carbs_g" DECIMAL(7,2),
    "fats_g" DECIMAL(7,2),
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_entries_user_id_log_date_idx" ON "meal_entries"("user_id", "log_date");

-- AddForeignKey
ALTER TABLE "meal_entries" ADD CONSTRAINT "meal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
