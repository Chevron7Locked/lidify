-- Migration: Add missing columns that may not exist in older databases
-- Uses IF NOT EXISTS to be safe for both new and existing installs

-- Add exclusionMonths to UserDiscoverConfig (was missing from init)
ALTER TABLE "UserDiscoverConfig" ADD COLUMN IF NOT EXISTS "exclusionMonths" INTEGER DEFAULT 6;

-- Add searchVector columns (were added to init after some databases were created)
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;
ALTER TABLE "Album" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- Add artistName/albumTitle to DiscoverExclusion if missing
ALTER TABLE "DiscoverExclusion" ADD COLUMN IF NOT EXISTS "artistName" TEXT;
ALTER TABLE "DiscoverExclusion" ADD COLUMN IF NOT EXISTS "albumTitle" TEXT;

-- Create indexes if they don't exist (safe for both cases)
CREATE INDEX IF NOT EXISTS "Artist_searchVector_idx" ON "Artist" USING gin("searchVector");
CREATE INDEX IF NOT EXISTS "Album_searchVector_idx" ON "Album" USING gin("searchVector");
CREATE INDEX IF NOT EXISTS "Track_searchVector_idx" ON "Track" USING gin("searchVector");

