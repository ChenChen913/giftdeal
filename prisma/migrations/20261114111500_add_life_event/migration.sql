-- CreateTable
CREATE TABLE "life_event" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "title" VARCHAR(50) NOT NULL,
    "scene" "gift_scene" NOT NULL DEFAULT 'OTHER',
    "occurred_at" DATE NOT NULL,
    "location" VARCHAR(100),
    "note" VARCHAR(200),
    "hosted" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "life_event_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "record" ADD COLUMN "event_id" TEXT;

-- CreateIndex
CREATE INDEX "life_event_ledger_id_occurred_at_idx" ON "life_event"("ledger_id", "occurred_at");

-- CreateIndex
CREATE INDEX "life_event_ledger_id_deleted_at_idx" ON "life_event"("ledger_id", "deleted_at");

-- CreateIndex
CREATE INDEX "record_ledger_id_event_id_idx" ON "record"("ledger_id", "event_id");

-- AddForeignKey
ALTER TABLE "life_event" ADD CONSTRAINT "life_event_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "life_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
