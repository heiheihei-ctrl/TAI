import { getBillingTeamId } from '@/stores/teamStore';
import { useProjectStore } from '@/stores/projectStore';

/** 为 AI 请求附加团队/项目计费上下文（body + header 双通道） */
export function attachBillingContext<T extends Record<string, unknown>>(
  payload: T,
): T & { billingTeamId?: string; projectId?: string } {
  const billingTeamId = getBillingTeamId();
  const projectId = useProjectStore.getState().currentProjectId ?? undefined;
  return {
    ...payload,
    ...(billingTeamId ? { billingTeamId } : {}),
    ...(projectId ? { projectId } : {}),
  };
}
