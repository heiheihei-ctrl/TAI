import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toTaiInviteCode(code: string): string | null {
  const normalizedCode = code.trim().toUpperCase();
  const separatorIndex = normalizedCode.indexOf('-');
  if (separatorIndex < 0) {
    return null;
  }

  const prefix = normalizedCode.slice(0, separatorIndex).trim();
  const suffix = normalizedCode.slice(separatorIndex + 1).trim();
  if (prefix !== 'TANVAS' || !suffix) {
    return null;
  }

  return `TAI-${suffix}`;
}

function withRandomSuffix(code: string): string {
  return `${code}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function main() {
  const inviteCodes = await prisma.invitationCode.findMany({
    select: {
      id: true,
      code: true,
      inviterUserId: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const candidates = inviteCodes
    .map((inviteCode) => ({
      ...inviteCode,
      nextCode: toTaiInviteCode(inviteCode.code),
    }))
    .filter(
      (inviteCode): inviteCode is typeof inviteCode & { nextCode: string } =>
        Boolean(inviteCode.nextCode) && inviteCode.code !== inviteCode.nextCode,
    );

  if (candidates.length === 0) {
    console.log('No TANVAS invite codes found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${candidates.length} TANVAS invite code(s) to migrate.`);

  const occupiedCodes = new Set(inviteCodes.map((inviteCode) => inviteCode.code.toUpperCase()));
  let migratedCount = 0;

  for (const candidate of candidates) {
    occupiedCodes.delete(candidate.code.toUpperCase());

    let finalCode = candidate.nextCode;
    while (occupiedCodes.has(finalCode.toUpperCase())) {
      finalCode = withRandomSuffix(candidate.nextCode);
    }

    await prisma.invitationCode.update({
      where: { id: candidate.id },
      data: { code: finalCode },
    });

    occupiedCodes.add(finalCode.toUpperCase());
    migratedCount += 1;

    console.log(
      `Migrated ${candidate.code} -> ${finalCode}${candidate.inviterUserId ? ` (user ${candidate.inviterUserId})` : ''}`,
    );
  }

  console.log(`Migration complete. Updated ${migratedCount} invite code(s).`);
}

main()
  .catch((error) => {
    console.error('Invite code migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
