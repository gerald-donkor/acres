-- Post-review tenant integrity hardening for Phase 7A ingestion tables.

CREATE UNIQUE INDEX IF NOT EXISTS "StoredObject_organizationId_id_key"
  ON "StoredObject"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "Upload_organizationId_id_key"
  ON "Upload"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "Dataset_organizationId_id_key"
  ON "Dataset"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "ColumnMapping_organizationId_id_key"
  ON "ColumnMapping"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "DatasetVersion_organizationId_id_key"
  ON "DatasetVersion"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "IngestionRun_organizationId_id_key"
  ON "IngestionRun"("organizationId", "id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ColumnMapping_org_dataset_fkey') THEN
    ALTER TABLE "ColumnMapping" ADD CONSTRAINT "ColumnMapping_org_dataset_fkey"
      FOREIGN KEY ("organizationId", "datasetId")
      REFERENCES "Dataset"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ColumnMapping_org_upload_fkey') THEN
    ALTER TABLE "ColumnMapping" ADD CONSTRAINT "ColumnMapping_org_upload_fkey"
      FOREIGN KEY ("organizationId", "uploadId")
      REFERENCES "Upload"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DatasetVersion_org_dataset_fkey') THEN
    ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_org_dataset_fkey"
      FOREIGN KEY ("organizationId", "datasetId")
      REFERENCES "Dataset"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DatasetVersion_org_upload_fkey') THEN
    ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_org_upload_fkey"
      FOREIGN KEY ("organizationId", "sourceUploadId")
      REFERENCES "Upload"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DatasetVersion_org_storedObject_fkey') THEN
    ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_org_storedObject_fkey"
      FOREIGN KEY ("organizationId", "storedObjectId")
      REFERENCES "StoredObject"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DatasetVersion_org_mapping_fkey') THEN
    ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_org_mapping_fkey"
      FOREIGN KEY ("organizationId", "mappingId")
      REFERENCES "ColumnMapping"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IngestionRun_org_dataset_fkey') THEN
    ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_org_dataset_fkey"
      FOREIGN KEY ("organizationId", "datasetId")
      REFERENCES "Dataset"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IngestionRun_org_upload_fkey') THEN
    ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_org_upload_fkey"
      FOREIGN KEY ("organizationId", "uploadId")
      REFERENCES "Upload"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IngestionRun_org_mapping_fkey') THEN
    ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_org_mapping_fkey"
      FOREIGN KEY ("organizationId", "mappingId")
      REFERENCES "ColumnMapping"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IngestionRun_org_datasetVersion_fkey') THEN
    ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_org_datasetVersion_fkey"
      FOREIGN KEY ("organizationId", "datasetVersionId")
      REFERENCES "DatasetVersion"("organizationId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ValidationIssue_org_run_fkey') THEN
    ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_org_run_fkey"
      FOREIGN KEY ("organizationId", "ingestionRunId")
      REFERENCES "IngestionRun"("organizationId", "id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StagedSourceSummary_org_run_fkey') THEN
    ALTER TABLE "StagedSourceSummary" ADD CONSTRAINT "StagedSourceSummary_org_run_fkey"
      FOREIGN KEY ("organizationId", "ingestionRunId")
      REFERENCES "IngestionRun"("organizationId", "id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
