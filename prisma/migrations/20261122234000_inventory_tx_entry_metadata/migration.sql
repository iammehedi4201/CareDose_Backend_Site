-- Additive opening-stock entry metadata on InventoryTransaction (preserves all existing patient records)
ALTER TABLE "InventoryTransaction"
  ADD COLUMN "cataloguePackId" TEXT,
  ADD COLUMN "enteredQuantity" DECIMAL(12,2),
  ADD COLUMN "enteredUnit" TEXT,
  ADD COLUMN "baseUnit" TEXT;

ALTER TABLE "InventoryTransaction"
  ADD CONSTRAINT "InventoryTransaction_cataloguePackId_fkey"
  FOREIGN KEY ("cataloguePackId") REFERENCES "MedicinePack"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
