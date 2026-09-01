/** 依次运行 tgagent 测试套件 */
import { spawn } from "node:child_process";

const tests = [
  "tests/asset-store.test.ts",
  "tests/bff-chat.test.ts",
  "tests/brief.test.ts",
  "tests/canvas-layout.test.ts",
  "tests/region.test.ts",
  "tests/session-store.test.ts",
  "tests/sessions.test.ts",
  "tests/tai-protocol.test.ts",
  "tests/w4-backend.test.ts",
];

let failed = 0;
for (const t of tests) {
  console.log(`\n━━━ ${t} ━━━`);
  await new Promise<void>((resolve) => {
    const child = spawn("npx", ["tsx", t], { stdio: "inherit", shell: true });
    child.on("close", (code) => {
      if (code !== 0) failed++;
      resolve();
    });
  });
}

if (failed > 0) {
  console.error(`\n${failed} 个测试文件失败`);
  process.exit(1);
}
console.log("\nALL PASS ✅");
process.exit(0);
