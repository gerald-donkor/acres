-- Migration: 20260829200000_region_geometry_unique_key
-- Establish unique identity constraint for RegionGeometry(regionId, sourceId)

DROP INDEX IF EXISTS "RegionGeometry_regionId_sourceId_idx";

CREATE UNIQUE INDEX "RegionGeometry_regionId_sourceId_key"
  ON "RegionGeometry"("regionId", "sourceId");
