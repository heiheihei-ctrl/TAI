-- Team collaboration models
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxSeats" INTEGER NOT NULL DEFAULT 2,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "creditQuotaMonthly" INTEGER,
    "creditQuotaTotal" INTEGER,
    "creditUsedThisCycle" INTEGER NOT NULL DEFAULT 0,
    "creditUsedTotal" INTEGER NOT NULL DEFAULT 0,
    "quotaCycleStart" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamInvite" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamCreditAccount" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamCreditAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamCreditLedger" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "taskId" TEXT,
    "taskKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamCreditLedger_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project" ADD COLUMN "teamId" TEXT;

CREATE INDEX "Team_ownerId_idx" ON "Team"("ownerId");
CREATE INDEX "Team_status_idx" ON "Team"("status");

CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

CREATE UNIQUE INDEX "TeamInvite_code_key" ON "TeamInvite"("code");
CREATE INDEX "TeamInvite_teamId_idx" ON "TeamInvite"("teamId");
CREATE INDEX "TeamInvite_expiresAt_idx" ON "TeamInvite"("expiresAt");

CREATE UNIQUE INDEX "TeamCreditAccount_teamId_key" ON "TeamCreditAccount"("teamId");

CREATE INDEX "TeamCreditLedger_accountId_createdAt_idx" ON "TeamCreditLedger"("accountId", "createdAt");

CREATE INDEX "Project_teamId_updatedAt_idx" ON "Project"("teamId", "updatedAt");

ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamCreditAccount" ADD CONSTRAINT "TeamCreditAccount_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamCreditLedger" ADD CONSTRAINT "TeamCreditLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TeamCreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
