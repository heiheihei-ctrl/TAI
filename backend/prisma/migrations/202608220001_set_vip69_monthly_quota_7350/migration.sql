-- VIP 69 monthly quota: 8700 -> 7350
-- signupBonusCredits remains 0; UI total ≈ 7350 + check-in 1900 = 9250

UPDATE "MembershipPlan"
SET
  "monthlyQuotaCredits" = 7350,
  "signupBonusCredits" = 0,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  lower("code") LIKE '%69%'
  OR "name" LIKE '%日常%';

-- Keep active subscription snapshots in sync
UPDATE "UserMembershipSubscription" AS s
SET
  "snapshot" = jsonb_set(
    jsonb_set(
      COALESCE(s."snapshot", '{}'::jsonb),
      '{monthlyQuotaCredits}',
      to_jsonb(7350),
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
    OR p."name" LIKE '%日常%'
  );
