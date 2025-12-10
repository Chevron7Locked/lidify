-- CreateTable
CREATE TABLE "DeviceLinkCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "deviceName" TEXT,
    "apiKeyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceLinkCode_code_key" ON "DeviceLinkCode"("code");

-- CreateIndex
CREATE INDEX "DeviceLinkCode_code_expiresAt_idx" ON "DeviceLinkCode"("code", "expiresAt");

-- CreateIndex
CREATE INDEX "DeviceLinkCode_userId_idx" ON "DeviceLinkCode"("userId");

-- AddForeignKey
ALTER TABLE "DeviceLinkCode" ADD CONSTRAINT "DeviceLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;









