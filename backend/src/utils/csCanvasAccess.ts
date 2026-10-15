import { PrismaService } from '../prisma/prisma.service';
import { getDeploymentBrand } from '../config/deployment-brand';

/** Customer consent is scoped to the assigned agent, project and active session. */
export async function hasCsCanvasAccess(
  prisma: PrismaService, userId: string,
  project: { id?: string; userId: string; teamId: string | null },
): Promise<boolean> {
  if (getDeploymentBrand() !== 'linglong' || !project.id || project.teamId) return false;
  const request = await prisma.csCollabRequest.findFirst({
    where: {
      projectId: project.id, agentId: userId, status: 'accepted', endedAt: null,
      agent: { isCsAgent: true },
      conversation: { userId: project.userId, agentId: userId, status: 'active' },
    },
    select: { id: true },
  });
  return Boolean(request);
}
