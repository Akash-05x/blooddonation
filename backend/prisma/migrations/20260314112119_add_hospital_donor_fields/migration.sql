/*
  Warnings:

  - You are about to drop the column `registration_number` on the `hospitals` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phone]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "HospitalType" AS ENUM ('Govt', 'Private', 'Clinic', 'Diagnostic');

-- CreateEnum
CREATE TYPE "ControllingDept" AS ENUM ('DMRHS', 'DME');

-- CreateEnum
CREATE TYPE "HospitalCategory" AS ENUM ('PHC', 'CHC', 'District', 'MedicalCollege');

-- CreateEnum
CREATE TYPE "AvailableTime" AS ENUM ('Any', 'Day', 'Night');

-- DropIndex
DROP INDEX "hospitals_registration_number_key";

-- AlterTable
ALTER TABLE "donors" ADD COLUMN     "address" TEXT,
ADD COLUMN     "available_time" "AvailableTime" NOT NULL DEFAULT 'Any',
ADD COLUMN     "body_weight" DOUBLE PRECISION,
ADD COLUMN     "consent_declaration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT NOT NULL DEFAULT 'Male',
ADD COLUMN     "id_proof_no" TEXT,
ADD COLUMN     "id_proof_type" TEXT,
ADD COLUMN     "is_pregnant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_donation_date" TIMESTAMP(3),
ADD COLUMN     "major_illness" TEXT,
ADD COLUMN     "recent_surgery_date" TIMESTAMP(3),
ADD COLUMN     "taking_medication_date" TIMESTAMP(3),
ADD COLUMN     "willing_to_travel" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "hospitals" DROP COLUMN "registration_number",
ADD COLUMN     "abdm_facility_id" TEXT,
ADD COLUMN     "authorized_designation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "authorized_email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "authorized_person_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "clinical_reg_no" TEXT,
ADD COLUMN     "controlling_dept" "ControllingDept",
ADD COLUMN     "district" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "expiry_date" TIMESTAMP(3),
ADD COLUMN     "hospital_category" "HospitalCategory",
ADD COLUMN     "hospital_type" "HospitalType" NOT NULL DEFAULT 'Govt',
ADD COLUMN     "issue_date" TIMESTAMP(3),
ADD COLUMN     "issuing_authority" TEXT,
ADD COLUMN     "nabh_accreditation_no" TEXT,
ADD COLUMN     "official_email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "telephone" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
