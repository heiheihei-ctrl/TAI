-- 用户来源渠道奖励字段（代码早已使用，此前仅靠 db push，migrate deploy 环境会缺列导致 500）
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sourceChannel" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sourceChannelRewardClaimed" BOOLEAN NOT NULL DEFAULT false;
