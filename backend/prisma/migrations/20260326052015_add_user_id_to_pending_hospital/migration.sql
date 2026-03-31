/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `pending_hospitals` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AssignmentRole" ADD VALUE 'reserve';

-- AlterTable
ALTER TABLE "pending_hospitals" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pending_hospitals_user_id_key" ON "pending_hospitals"("user_id");
