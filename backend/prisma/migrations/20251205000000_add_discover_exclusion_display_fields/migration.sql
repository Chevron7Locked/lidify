-- AddColumn: Add display fields to DiscoverExclusion for UI purposes
ALTER TABLE "DiscoverExclusion" ADD COLUMN "artistName" TEXT;
ALTER TABLE "DiscoverExclusion" ADD COLUMN "albumTitle" TEXT;
