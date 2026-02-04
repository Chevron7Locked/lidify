-- Add vibe analysis status columns to Track table
ALTER TABLE "Track" ADD COLUMN "vibeAnalysisStatus" TEXT DEFAULT 'pending';
ALTER TABLE "Track" ADD COLUMN "vibeAnalysisStartedAt" TIMESTAMP(3);
ALTER TABLE "Track" ADD COLUMN "vibeAnalysisError" TEXT;
ALTER TABLE "Track" ADD COLUMN "vibeAnalysisRetryCount" INTEGER DEFAULT 0;
ALTER TABLE "Track" ADD COLUMN "vibeAnalysisStatusUpdatedAt" TIMESTAMP(3);

-- Set existing tracks with embeddings to completed
UPDATE "Track"
SET "vibeAnalysisStatus" = 'completed',
    "vibeAnalysisStartedAt" = NOW(),
    "vibeAnalysisStatusUpdatedAt" = NOW()
WHERE EXISTS (
    SELECT 1 FROM track_embeddings te WHERE te.track_id = "Track".id
);
