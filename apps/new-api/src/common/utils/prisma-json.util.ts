import { Prisma } from '@prisma/client';

export function toPrismaJson(
  value: Record<string, unknown> | Array<unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}
