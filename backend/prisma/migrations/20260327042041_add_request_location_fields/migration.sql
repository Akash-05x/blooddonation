-- AlterTable
ALTER TABLE "emergency_requests" ADD COLUMN     "request_district" TEXT,
ADD COLUMN     "request_lat" DOUBLE PRECISION,
ADD COLUMN     "request_lng" DOUBLE PRECISION;
