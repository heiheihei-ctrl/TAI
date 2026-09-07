-- Force-logout support: JWT iat earlier than this timestamp is rejected
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsInvalidatedAt" TIMESTAMP(3);
