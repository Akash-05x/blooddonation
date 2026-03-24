-- CreateTable
CREATE TABLE "pending_hospitals" (
    "id" TEXT NOT NULL,
    "hospital_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "district" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "telephone" TEXT NOT NULL DEFAULT '',
    "official_email" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "longitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hospital_type" "HospitalType" NOT NULL DEFAULT 'Govt',
    "controlling_dept" "ControllingDept",
    "hospital_category" "HospitalCategory",
    "clinical_reg_no" TEXT,
    "issue_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "issuing_authority" TEXT,
    "nabh_accreditation_no" TEXT,
    "abdm_facility_id" TEXT,
    "authorized_person_name" TEXT NOT NULL DEFAULT '',
    "authorized_designation" TEXT NOT NULL DEFAULT '',
    "authorized_email" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_hospitals_pkey" PRIMARY KEY ("id")
);
