export type NodeConfigTitleSource = {
  title?: unknown;
  label?: unknown;
  nodeConfigNameZh?: unknown;
  nodeConfigNameEn?: unknown;
  nodeTitle?: unknown;
};

const asTrimmed = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : '';

/**
 * 解析画布节点展示名：优先用户自定义 title/label，其次节点管理配置名，最后硬编码兜底。
 * 画布节点标题统一展示英文；若 title 仅为后台中文配置名的同步副本，则回退到英文名。
 */
export function resolveFlowNodeConfigTitle(
  data: NodeConfigTitleSource | null | undefined,
  fallbackZh: string,
  fallbackEn: string = fallbackZh,
): { zh: string; en: string } {
  const custom = asTrimmed(data?.title) || asTrimmed(data?.label) || asTrimmed(data?.nodeTitle);
  const configZh = asTrimmed(data?.nodeConfigNameZh);
  const configEn = asTrimmed(data?.nodeConfigNameEn);
  const effectiveCustom = custom && custom !== configZh ? custom : '';
  return {
    zh: effectiveCustom || configZh || fallbackZh,
    en: effectiveCustom || configEn || fallbackEn || configZh || fallbackZh,
  };
}

/** 画布节点标题：始终返回英文 */
export function useFlowNodeConfigTitle(
  data: NodeConfigTitleSource | Record<string, unknown> | null | undefined,
  fallbackZh: string,
  fallbackEn: string = fallbackZh,
): string {
  const { en } = resolveFlowNodeConfigTitle(data as NodeConfigTitleSource, fallbackZh, fallbackEn);
  return en;
}
