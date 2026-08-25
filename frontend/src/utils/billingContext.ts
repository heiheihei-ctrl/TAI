import { getBillingTeamId } from '@/stores/teamStore';
import { useProjectStore } from '@/stores/projectStore';

/** 为 AI 请求附加计费上下文：仅在「团队工作区」时带 billingTeamId；个人身份不带，走个人积分 */
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
