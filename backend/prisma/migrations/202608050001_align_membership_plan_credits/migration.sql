-- Align MembershipPlan credits with VIP modal marketing "立即到账":
-- Put the full immediate package into monthlyQuotaCredits; signupBonusCredits = 0.
-- - VIP 69:  8700 / day check-in 50
-- - VIP 199: 22000 / day check-in 100
-- - VIP 599: 69000 / day check-in 150

UPDATE "MembershipPlan"
SET
  "monthlyQuotaCredits" = 8700,
  "signupBonusCredits" = 0,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  lower("code") LIKE '%69%'
  OR "name" LIKE '%日常%';

UPDATE "MembershipPlan"
SET
  "monthlyQuotaCredits" = 22000,
  "signupBonusCredits" = 0,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  lower("code") LIKE '%199%'
  OR "name" LIKE '%专业%';

UPDATE "MembershipPlan"
SET
  "monthlyQuotaCredits" = 69000,
  "signupBonusCredits" = 0,
  "dailyGiftCredits" = 150,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  lower("code") LIKE '%599%'
  OR "name" LIKE '%旗舰%';

-- Keep active subscription snapshots in sync (check-in / monthly refresh read snapshot first)
UPDATE "UserMembershipSubscription" AS s
SET
  "snapshot" = jsonb_set(
    jsonb_set(
      COALESCE(s."snapshot", '{}'::jsonb),
      '{monthlyQuotaCredits}',
      to_jsonb(p."monthlyQuotaCredits"),
      true
    ),
    '{signupBonusCredits}',
    '0'::jsonb,
    true
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "MembershipPlan" AS p
WHERE
  s."membershipPlanId" = p."id"
  AND s."status" = 'active'
  AND (
    lower(p."code") LIKE '%69%'
    OR lower(p."code") LIKE '%199%'
    OR lower(p."code") LIKE '%599%'
    OR p."name" LIKE '%日常%'
    OR p."name" LIKE '%专业%'
    OR p."name" LIKE '%旗舰%'
  );

UPDATE "UserMembershipSubscription" AS s
SET
  "snapshot" = jsonb_set(
    COALESCE(s."snapshot", '{}'::jsonb),
    '{dailyGiftCredits}',
    '150'::jsonb,
    true
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "MembershipPlan" AS p
WHERE
  s."membershipPlanId" = p."id"
  AND s."status" = 'active'
  AND (
    lower(p."code") LIKE '%599%'
    OR p."name" LIKE '%旗舰%'
  );
