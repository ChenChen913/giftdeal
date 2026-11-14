-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('PLANNED', 'DONE');

-- CreateTable
CREATE TABLE "gift_plan" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "direction" "record_direction" NOT NULL DEFAULT 'GIVEN',
    "scene" "gift_scene" NOT NULL DEFAULT 'OTHER',
    "planned_cents" INTEGER NOT NULL,
    "expected_at" DATE NOT NULL,
    "status" "plan_status" NOT NULL DEFAULT 'PLANNED',
    "note" VARCHAR(200),
    "record_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gift_plan_record_id_key" ON "gift_plan"("record_id");

-- CreateIndex
CREATE INDEX "gift_plan_ledger_id_status_expected_at_idx" ON "gift_plan"("ledger_id", "status", "expected_at");

-- CreateIndex
CREATE INDEX "gift_plan_ledger_id_contact_id_idx" ON "gift_plan"("ledger_id", "contact_id");

-- CreateIndex
CREATE INDEX "gift_plan_ledger_id_deleted_at_idx" ON "gift_plan"("ledger_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "gift_plan" ADD CONSTRAINT "gift_plan_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_plan" ADD CONSTRAINT "gift_plan_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_plan" ADD CONSTRAINT "gift_plan_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_plan" ADD CONSTRAINT "gift_plan_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

