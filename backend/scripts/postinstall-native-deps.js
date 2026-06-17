/**
 * 安装后检查 sharp 是否可加载。
 */
function isSharpAvailable() {
  for (const spec of ['sharp', '@img/sharp-wasm32']) {
    try {
      require(spec);
      console.log(`[postinstall] ${spec} ok`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[postinstall] ${spec} FAILED: ${message}`);
    }
  }
  return false;
}

const sharpOk = isSharpAvailable();

if (!sharpOk) {
  console.warn(
    '[postinstall] sharp 未就绪。请在后端目录执行：\n' +
      '  rm -rf node_modules && pnpm install\n' +
      '（.npmrc 已配置 @img 从 npmjs 官方拉取预编译包）\n' +
      '或配置 backend/.env 的 REMOVE_BG_API_KEY 使用 remove.bg 云端抠图（不依赖 sharp）。'
  );
}

if (sharpOk) {
  try {
    require('@imgly/background-removal-node');
    console.log('[postinstall] @imgly/background-removal-node ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[postinstall] @imgly/background-removal-node FAILED: ${message}`);
  }
}
