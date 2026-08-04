-- AlterTable
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "enterpriseEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

-- Enable enterprise for existing non-personal teams
UPDATE "Team" SET "enterpriseEnabled" = true WHERE "isPersonal" = false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Team_enterpriseEnabled_status_idx" ON "Team"("enterpriseEnabled", "status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeamAssetFolder" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamAssetFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeamAsset" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ossKey" TEXT,
    "mime" TEXT,
    "size" INTEGER,
    "thumbnail" TEXT,
    "assetType" TEXT NOT NULL DEFAULT '2d',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeamAssetFolder_teamId_parentId_idx" ON "TeamAssetFolder"("teamId", "parentId");
CREATE INDEX IF NOT EXISTS "TeamAsset_teamId_createdAt_idx" ON "TeamAsset"("teamId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TeamAsset_teamId_folderId_idx" ON "TeamAsset"("teamId", "folderId");
CREATE INDEX IF NOT EXISTS "TeamAsset_uploaderId_idx" ON "TeamAsset"("uploaderId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TeamAssetFolder" ADD CONSTRAINT "TeamAssetFolder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamAssetFolder" ADD CONSTRAINT "TeamAssetFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TeamAssetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamAsset" ADD CONSTRAINT "TeamAsset_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamAsset" ADD CONSTRAINT "TeamAsset_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamAsset" ADD CONSTRAINT "TeamAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "TeamAssetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
