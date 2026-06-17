#!/usr/bin/env node
/**
 * sharp 安装诊断（兼容 pnpm 虚拟 store，不依赖 node_modules/@img 目录存在）
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function detectLibc() {
  try {
    const report = process.report.getReport();
    if (report?.header?.glibcVersionRuntime) {
      return `glibc ${report.header.glibcVersionRuntime}`;
    }
  } catch {
    // ignore
  }
  const osRelease = readText('/etc/os-release');
  if (/alpine/i.test(osRelease)) return 'musl (Alpine)';
  if (/ID=openwrt/i.test(osRelease)) return 'musl (OpenWrt)';
  return 'unknown (assume glibc on Linux)';
}

function findImgSharpPackages() {
  const found = [];
  const dirs = [
    path.join(root, 'node_modules', '@img'),
    path.join(root, 'node_modules', '.pnpm'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    if (dir.endsWith('@img')) {
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith('sharp-')) found.push(path.join(dir, name));
      }
      continue;
    }
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('@img+sharp-')) {
        found.push(path.join(dir, entry));
      }
    }
  }

  return [...new Set(found)];
}

function tryRequireSharp() {
  try {
    const sharp = require(path.join(root, 'node_modules', 'sharp'));
    return { ok: true, version: sharp.versions?.sharp ?? 'unknown' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function main() {
  console.log('=== sharp 诊断 ===');
  console.log(`目录: ${root}`);
  console.log(`Node: ${process.version}`);
  console.log(`平台: ${process.platform} ${process.arch}`);
  console.log(`libc: ${detectLibc()}`);

  let pm = 'unknown';
  try {
    pm = execSync('pnpm --version', { encoding: 'utf8' }).trim();
    console.log(`包管理器: pnpm ${pm}`);
  } catch {
    try {
      pm = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`包管理器: npm ${pm}`);
    } catch {
      console.log('包管理器: unknown');
    }
  }

  const npmrc = readText(path.join(root, '.npmrc'));
  const hasHoist = /public-hoist-pattern.*sharp/i.test(npmrc);
  console.log(`pnpm hoist 配置: ${hasHoist ? '已配置' : '缺失（需 public-hoist-pattern[]=*sharp*）'}`);

  const imgPackages = findImgSharpPackages();
  console.log(`\n@img/sharp 包 (${imgPackages.length}):`);
  if (imgPackages.length === 0) {
    console.log('  (未找到 — 可能未安装或无法访问 registry.npmjs.org)');
  } else {
    for (const pkg of imgPackages.slice(0, 8)) {
      console.log(`  - ${path.relative(root, pkg)}`);
    }
    if (imgPackages.length > 8) {
      console.log(`  ... 另有 ${imgPackages.length - 8} 个`);
    }
  }

  const sharpResult = tryRequireSharp();
  console.log('\nrequire("sharp"):');
  if (sharpResult.ok) {
    console.log(`  ✅ OK (sharp ${sharpResult.version})`);
    process.exit(0);
  }

  console.log(`  ❌ FAILED\n  ${sharpResult.error}`);

  const isLinuxX64 = process.platform === 'linux' && process.arch === 'x64';
  const libc = detectLibc();
  const musl = /musl/i.test(libc);
  const platformPkg = musl ? '@img/sharp-linuxmusl-x64@0.34.5' : '@img/sharp-linux-x64@0.34.5';

  console.log('\n=== 建议修复（在生产 Linux 服务器 backend 目录执行）===');
  console.log('1. 拉取最新代码（含 .npmrc hoist 配置）');
  console.log('2. rm -rf node_modules');
  console.log('3. pnpm install');
  if (isLinuxX64) {
    console.log(`4. pnpm add ${platformPkg}`);
  }
  console.log('5. pnpm run diagnose:sharp   # 应显示 ✅ OK');
  console.log('\n若第 4 步访问 npmjs 超时，可先试：');
  console.log('  export npm_config_registry=https://registry.npmjs.org/');
  console.log(`  pnpm add ${platformPkg}`);
  console.log('\n抠图可不依赖 sharp：在 backend/.env 配置 REMOVE_BG_API_KEY');

  process.exit(1);
}

main();
