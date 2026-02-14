-- Add version field to DiscoveryBatch for optimistic locking
ALTER TABLE "DiscoveryBatch" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
