const normalize = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

// Product route groups, not the physical upstream vendor names.
const channelGroup = (value: unknown): string | undefined => {
  const channel = normalize(value);
  if (["toapis", "apimart", "nano2", "normal"].includes(channel)) return "ToAPIs";
  if (["tencent", "tencent_vod", "stable", "seedance_api", "doubao", "volcengine"].includes(channel)) return "Tencent";
  return undefined;
};

export function getRecordChannelLabel(record: {
  provider?: string;
  requestParams?: Record<string, unknown> | null;
}): string {
  const params = record.requestParams ?? {};
  // Task identity and execution metadata take precedence over request hints.
  const taskId = normalize(params.taskId);
  if (/^seedance(?:20|25)-toapis:/.test(taskId) || taskId.startsWith("omni-flash-ext:")) return "ToAPIs";
  for (const value of [params.executionChannel, params.providerChannel, params.channel]) {
    const group = channelGroup(value);
    if (group) return group;
  }
  const options = params.providerOptions as { bananaImageRoute?: unknown; banana?: { imageRoute?: unknown } } | undefined;
  for (const value of [params.bananaImageRoute, options?.banana?.imageRoute, options?.bananaImageRoute,
    params.platformKey, params.vendorKey, params.channelHint, record.provider]) {
    const group = channelGroup(value);
    if (group) return group;
  }
  return "-";
}