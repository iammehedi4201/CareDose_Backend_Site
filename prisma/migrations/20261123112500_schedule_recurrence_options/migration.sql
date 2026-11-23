-- Add intervalHours and weekdays columns for advanced schedule recurrence
ALTER TABLE "MedicationSchedule"
  ADD COLUMN "intervalHours" INTEGER,
  ADD COLUMN "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
