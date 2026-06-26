-- User extended profile fields (includes company)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileRealName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileGender" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileAge" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileOccupation" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileCompany" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileRegion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileCompletedAt" TIMESTAMPTZ(6);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileRewardClaimed" BOOLEAN NOT NULL DEFAULT false;

-- Illustration library feature removed; drop table if a partial migration created it
DROP TABLE IF EXISTS "IllustrationLibraryItem";
