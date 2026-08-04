/** 是否展示团队实时协同相关 UI（光标、协同条等）。个人版默认关闭。 */
export const SHOW_TEAM_COLLABORATION = false;

/** 是否展示企业版控制台入口与 /enterprise 路由 */
export const SHOW_ENTERPRISE_CONSOLE = true;

/**
 * 画布顶栏是否展示「个人 / 企业」工作区切换。
 * 企业控制台开启时也应保留，避免从首页进画布后卡在企业工作区。
 */
export const SHOW_WORKSPACE_SWITCHER =
  SHOW_TEAM_COLLABORATION || SHOW_ENTERPRISE_CONSOLE;

/** 是否展示 Flow 新手引导工具栏入口 */
export const SHOW_FLOW_ONBOARDING_TOOLBAR = true;
