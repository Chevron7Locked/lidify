-- Add release iteration tracking fields to DownloadJob
-- These fields support exhaustive release retry before moving to a new album

-- Array of release GUIDs that have been tried for this album
ALTER TABLE "DownloadJob" ADD COLUMN "triedReleases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Current position in the release list (for logging/debugging)
ALTER TABLE "DownloadJob" ADD COLUMN "releaseIndex" INTEGER NOT NULL DEFAULT 0;

-- Artist MBID for same-artist album fallback
ALTER TABLE "DownloadJob" ADD COLUMN "artistMbid" TEXT;

-- Index for same-artist fallback queries
CREATE INDEX "DownloadJob_artistMbid_idx" ON "DownloadJob"("artistMbid");
