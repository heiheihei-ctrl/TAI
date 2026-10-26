-- 登录凭证不再按时间失效；保留撤销状态和用户维度查询索引。
DROP INDEX IF EXISTS "RefreshToken_expiresAt_idx";
DROP INDEX IF EXISTS "RefreshToken_userId_expiresAt_isRevoked_idx";
ALTER TABLE "RefreshToken" DROP COLUMN "expiresAt";