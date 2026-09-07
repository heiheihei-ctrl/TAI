-- Invalidate all sessions for phone 13632775688
UPDATE "User"
SET "sessionsInvalidatedAt" = NOW()
WHERE phone = '13632775688';

UPDATE "RefreshToken" AS rt
SET "isRevoked" = true
FROM "User" AS u
WHERE rt."userId" = u.id
  AND u.phone = '13632775688'
  AND rt."isRevoked" = false;
