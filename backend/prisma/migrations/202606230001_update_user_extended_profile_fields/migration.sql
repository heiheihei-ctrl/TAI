-- Rename real name -> nickname, age -> birthday, add profile email
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'profileRealName'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'profileNickname'
  ) THEN
    ALTER TABLE "User" RENAME COLUMN "profileRealName" TO "profileNickname";
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileBirthday" DATE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileEmail" TEXT;

ALTER TABLE "User" DROP COLUMN IF EXISTS "profileAge";
