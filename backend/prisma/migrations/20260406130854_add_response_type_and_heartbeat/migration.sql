-- CreateEnum
CREATE TYPE "ResponseType" AS ENUM ('EARLY', 'LATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestStatus" ADD VALUE 'active';
ALTER TYPE "RequestStatus" ADD VALUE 'awaiting_assignment';

-- AlterEnum
ALTER TYPE "TokenStatus" ADD VALUE 'responded';

-- AlterTable
ALTER TABLE "donor_assignments" ADD COLUMN     "expected_arrival_at" TIMESTAMP(3),
ADD COLUMN     "last_heartbeat_at" TIMESTAMP(3),
ADD COLUMN     "response_type" "ResponseType" NOT NULL DEFAULT 'EARLY';

-- AlterTable
ALTER TABLE "notification_tokens" ADD COLUMN     "response_type" "ResponseType" NOT NULL DEFAULT 'EARLY';
