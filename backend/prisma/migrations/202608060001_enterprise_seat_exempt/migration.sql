-- 企业管理员席位豁免 + 企业专用账号标记
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isEnterpriseAccount" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TeamMembership" ADD COLUMN IF NOT EXISTS "seatExempt" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "TeamMembership_teamId_seatExempt_idx" ON "TeamMembership"("teamId", "seatExempt");

-- 存量：企业工作区的 owner 不计席
UPDATE "TeamMembership" AS m
SET "seatExempt" = true
FROM "Team" AS t
WHERE m."teamId" = t."id"
  AND t."isPersonal" = false
  AND t."enterpriseEnabled" = true
  AND m."role" = 'owner'
  AND m."seatExempt" = false;
