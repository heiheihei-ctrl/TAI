-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isCsAgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "csAgentLastAssignedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_isCsAgent_status_idx" ON "User"("isCsAgent", "status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "CsAgentPresence" (
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsAgentPresence_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX IF NOT EXISTS "CsAgentPresence_status_updatedAt_idx" ON "CsAgentPresence"("status", "updatedAt");

ALTER TABLE "CsAgentPresence"
  DROP CONSTRAINT IF EXISTS "CsAgentPresence_userId_fkey";
ALTER TABLE "CsAgentPresence"
  ADD CONSTRAINT "CsAgentPresence_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
