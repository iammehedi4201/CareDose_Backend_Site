# PostgreSQL Pre-Execution Backup & Rollback Procedure

## 1. Pre-Execution Full Database Backup (`pg_dump`)

Before running `--execute`, create and verify a full PostgreSQL dump using `DIRECT_URL` from `backend/.env`:

```powershell
# Custom-format dump (recommended for pg_restore verification)
pg_dump --format=custom --no-owner --no-acl --file="caredose_pre_sync.dump" "<DIRECT_URL>"
pg_restore --list "caredose_pre_sync.dump" | Select-Object -First 20

# Or plain SQL dump
pg_dump --no-owner --no-acl --file="caredose_pre_sync.sql" "<DIRECT_URL>"
```

> Alternatively, create a manual snapshot/backup in the Supabase Dashboard (Database -> Backups) before running `--execute`.

## 2. Batch-Level Surgical Rollback (By `importBatchId`)

Every inserted `MedicineBrand` and `MedicineGeneric` is tagged with the `CatalogueImportBatch.id` (`<BATCH_ID>`). `MedicinePack` cascades on brand deletion (`onDelete: Cascade`).

```sql
BEGIN;
-- 1. Verify no PatientMedication links depend on this batch first:
SELECT COUNT(*) FROM "PatientMedication" pm
JOIN "MedicineBrand" mb ON mb."id" = pm."catalogueBrandId"
WHERE mb."importBatchId" = '<BATCH_ID>';

-- 2. Remove only brands/packs/generics created by this specific batch:
DELETE FROM "MedicineBrand" WHERE "importBatchId" = '<BATCH_ID>';
DELETE FROM "MedicineGeneric" WHERE "importBatchId" = '<BATCH_ID>';
UPDATE "CatalogueImportBatch" SET "status" = 'ROLLED_BACK' WHERE "id" = '<BATCH_ID>';
COMMIT;
```

## 3. Full Database Restore (If Needed)

```powershell
pg_restore --clean --if-exists --no-owner --no-acl --dbname="<DIRECT_URL>" "caredose_pre_sync.dump"
```

JSON pre-execution snapshot is also preserved at `F:\My Projects\CareDose\backend\reports\reconciliation\pre_execution_snapshot.json`.
