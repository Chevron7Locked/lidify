-- CreateTable
CREATE TABLE "HiddenPlaylist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenPlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiddenPlaylist_userId_idx" ON "HiddenPlaylist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenPlaylist_userId_playlistId_key" ON "HiddenPlaylist"("userId", "playlistId");

-- AddForeignKey
ALTER TABLE "HiddenPlaylist" ADD CONSTRAINT "HiddenPlaylist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenPlaylist" ADD CONSTRAINT "HiddenPlaylist_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
