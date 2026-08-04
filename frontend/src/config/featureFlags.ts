function readViteFlag(envKey: string, fallback: boolean): boolean {
  const raw = import.meta.env[envKey];
  if (raw === undefined || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

/**
 * 是否展示团队实时协同相关 UI（光标、协同条等）。
 * 默认关闭；可用 `VITE_SHOW_TEAM_COLLABORATION=true` 打开。
 */
export const SHOW_TEAM_COLLABORATION = readViteFlag(
  "VITE_SHOW_TEAM_COLLABORATION",
  false,
);

/**
 * 是否展示企业版（首页入口、/enterprise 路由、画布企业后台入口等）。
 * 默认关闭（与协同开关同款）；可用 `VITE_SHOW_ENTERPRISE=true` 打开。
 */
export const SHOW_ENTERPRISE_CONSOLE = readViteFlag("VITE_SHOW_ENTERPRISE", false);

/**
 * 画布顶栏是否展示「个人 / 企业」工作区切换。
 * 企业版开启时也应保留，避免从首页进画布后卡在企业工作区。
 */
export const SHOW_WORKSPACE_SWITCHER =
  SHOW_TEAM_COLLABORATION || SHOW_ENTERPRISE_CONSOLE;

/** 是否展示 Flow 新手引导工具栏入口 */
export const SHOW_FLOW_ONBOARDING_TOOLBAR = true;
