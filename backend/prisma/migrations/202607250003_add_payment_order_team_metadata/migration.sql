-- PaymentOrder 字段对齐（历史依赖 db push，migrate deploy 环境可能缺列）
ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
