#!/usr/bin/env node
/**
 * 按当前平台显式安装 @img/sharp-* 并验证。
 * 在 Linux 生产环境执行: node scripts/fix-sharp-install.js
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function detectMusl() {
  try {
    const report = process.report.getReport();
    if (report?.header?.glibcVersionRuntime) return false;
  } catch {
    // ignore
  }
  try {
    const fs = require('fs');
    const release = fs.readFileSync('/etc/os-release', 'utf8');
    return /alpine|openwrt/i.test(release);
  } catch {
    return false;
  }
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env: process.env });
}

function resolvePlatformPackage() {
  const { platform, arch } = process;
  if (platform === 'linux' && arch === 'x64') {
    return detectMusl() ? '@img/sharp-linuxmusl-x64@0.34.5' : '@img/sharp-linux-x64@0.34.5';
  }
  if (platform === 'linux' && arch === 'arm64') {
    return detectMusl() ? '@img/sharp-linuxmusl-arm64@0.34.5' : '@img/sharp-linux-arm64@0.34.5';
  }
  if (platform === 'win32' && arch === 'x64') {
    return '@img/sharp-win32-x64@0.34.5';
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return '@img/sharp-darwin-arm64@0.34.5';
  }
  if (platform === 'darwin' && arch === 'x64') {
    return '@img/sharp-darwin-x64@0.34.5';
  }
  return null;
}

function main() {
  const pkg = resolvePlatformPackage();
  if (!pkg) {
    console.log(`跳过：未识别的平台 ${process.platform} ${process.arch}`);
    process.exit(0);
  }

  console.log(`安装平台 sharp 包: ${pkg}`);

  const hasPnpm = (() => {
    try {
      execSync('pnpm --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  if (hasPnpm) {
    run(`pnpm add sharp@0.34.5 ${pkg}`);
  } else {
    run(`npm install sharp@0.34.5 ${pkg} --save`);
  }

  run('node scripts/diagnose-sharp.js');
}

main();
