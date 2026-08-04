-- 纠正企业口径：企业账户独立成表；误标的协同 Team 不再当作企业

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) 误标回滚：无 displayName 的非个人 Team 多半是历史协同/项目壳，取消企业标记
UPDATE "Team"
SET "enterpriseEnabled" = false
WHERE "isPersonal" = false
  AND ("displayName" IS NULL OR btrim("displayName") = '');

-- 2) Enterprise 表
CREATE TABLE IF NOT EXISTS "Enterprise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "logoUrl" TEXT,
    "ownerId" TEXT NOT NULL,
    "workspaceTeamId" TEXT NOT NULL,
    "maxSeats" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Enterprise_workspaceTeamId_key" ON "Enterprise"("workspaceTeamId");
CREATE INDEX IF NOT EXISTS "Enterprise_ownerId_idx" ON "Enterprise"("ownerId");
CREATE INDEX IF NOT EXISTS "Enterprise_status_createdAt_idx" ON "Enterprise"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Enterprise" ADD CONSTRAINT "Enterprise_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Enterprise" ADD CONSTRAINT "Enterprise_workspaceTeamId_fkey"
    FOREIGN KEY ("workspaceTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) 从仍标记为企业的 Team（有 displayName，多为平台派发）回填 Enterprise
INSERT INTO "Enterprise" (
  "id", "name", "displayName", "logoUrl", "ownerId", "workspaceTeamId", "maxSeats", "status", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  t."name",
  COALESCE(t."displayName", t."name"),
  t."logoUrl",
  t."ownerId",
  t."id",
  t."maxSeats",
  t."status",
  t."createdAt",
  t."updatedAt"
FROM "Team" t
WHERE t."isPersonal" = false
  AND t."enterpriseEnabled" = true
  AND t."displayName" IS NOT NULL
  AND btrim(t."displayName") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "Enterprise" e WHERE e."workspaceTeamId" = t."id"
  );

-- 4) Project.enterpriseId
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "enterpriseId" TEXT;

CREATE INDEX IF NOT EXISTS "Project_enterpriseId_updatedAt_idx"
  ON "Project"("enterpriseId", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_enterpriseId_fkey"
    FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 挂到企业工作区 Team 下的项目，补齐 enterpriseId
UPDATE "Project" p
SET "enterpriseId" = e."id"
FROM "Enterprise" e
WHERE p."teamId" = e."workspaceTeamId"
  AND (p."enterpriseId" IS NULL OR p."enterpriseId" <> e."id");
