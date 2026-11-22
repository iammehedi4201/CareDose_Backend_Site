-- Add stripUnits to MedicinePack so tablet/capsule/suppository strip sizes are stored per pack
ALTER TABLE "MedicinePack" ADD COLUMN "stripUnits" INTEGER;
