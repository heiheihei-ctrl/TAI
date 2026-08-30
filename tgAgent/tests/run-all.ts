/**
 * 测试套件 runner — 按顺序执行所有 *.test.ts 脚本 (通过 tsx)
 * 任一失败即退出，输出汇总。
 */

import { spawn } from "node:child_process";

const TESTS = [
  "tests/brief.test.ts",
  "tests/asset-store.test.ts",
  "tests/canvas-layout.test.ts",
  "tests/sessions.test.ts",
  "tests/qianwen-source.test.ts",
  "tests/region.test.ts",
  "tests/tai-source.test.ts",
  "tests/bff-chat.test.ts",
  "tests/w4-backend.test.ts",
];

async function run(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", name], { stdio: "pipe", shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      const pass = code === 0;
      console.log(`\n[${pass ? "PASS" : "FAIL"}] ${name}`);
      if (stdout.trim()) console.log(stdout.trim());
      if (stderr.trim() && !pass) console.error(stderr.trim());
      resolve(pass);
    });
  });
}

async function main(): Promise<void> {
  console.log("Running test suite...\n");
  let passed = 0;
  let failed = 0;
  for (const t of TESTS) {
    const ok = await run(t);
    if (ok) passed++; else failed++;
  }
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${TESTS.length} total`);
  if (failed > 0) process.exit(1);
  console.log("ALL PASS ✅");
}

main();
