-- CreateTable
CREATE TABLE IF NOT EXISTS "TeamJoinRequest" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "inviteId" TEXT,
    "applicantUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TeamJoinRequest_teamId_status_createdAt_idx" ON "TeamJoinRequest"("teamId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TeamJoinRequest_applicantUserId_status_idx" ON "TeamJoinRequest"("applicantUserId", "status");
CREATE INDEX IF NOT EXISTS "TeamJoinRequest_inviteId_idx" ON "TeamJoinRequest"("inviteId");

DO $$ BEGIN
  ALTER TABLE "TeamJoinRequest" ADD CONSTRAINT "TeamJoinRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamJoinRequest" ADD CONSTRAINT "TeamJoinRequest_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "TeamInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamJoinRequest" ADD CONSTRAINT "TeamJoinRequest_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
