/*
  Warnings:

  - The values [pending,in_progress] on the enum `RequestStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `ranking_weight_reliability` on the `system_configurations` table. All the data in the column will be lost.
  - You are about to drop the column `ranking_weight_response_time` on the `system_configurations` table. All the data in the column will be lost.
  - Added the required column `name` to the `donors` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('pending', 'confirmed', 'expired', 'cancelled');

-- AlterEnum
ALTER TYPE "AssignmentStatus" ADD VALUE 'failed';

-- AlterEnum
BEGIN;
CREATE TYPE "RequestStatus_new" AS ENUM ('created', 'donor_search', 'awaiting_confirmation', 'assigned', 'in_transit', 'completed', 'closed', 'failed', 'cancelled', 'expired');
ALTER TABLE "emergency_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "emergency_requests" ALTER COLUMN "status" TYPE "RequestStatus_new" USING ("status"::text::"RequestStatus_new");
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
DROP TYPE "RequestStatus_old";
ALTER TABLE "emergency_requests" ALTER COLUMN "status" SET DEFAULT 'created';
COMMIT;

-- AlterTable
ALTER TABLE "donation_history" ADD COLUMN     "points_earned" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "donor_assignments" ADD COLUMN     "distance_km" DOUBLE PRECISION,
ADD COLUMN     "score" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "donors" ADD COLUMN     "donation_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "emergency_requests" ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'created';

-- AlterTable
ALTER TABLE "system_configurations" DROP COLUMN "ranking_weight_reliability",
DROP COLUMN "ranking_weight_response_time",
ADD COLUMN     "gps_timeout_minutes" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "notification_expiry_minutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "ranking_weight_history" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
ADD COLUMN     "ranking_weight_response" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ALTER COLUMN "ranking_weight_distance" SET DEFAULT 0.3;

-- CreateTable
CREATE TABLE "notification_tokens" (
    "id" TEXT NOT NULL,
    "donor_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "TokenStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_locations" (
    "id" TEXT NOT NULL,
    "donor_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_tokens_token_key" ON "notification_tokens"("token");

-- AddForeignKey
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "emergency_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_locations" ADD CONSTRAINT "donor_locations_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_locations" ADD CONSTRAINT "donor_locations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "emergency_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
