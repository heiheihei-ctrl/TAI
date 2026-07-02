#!/usr/bin/env node
/**
 * 修复 Linux 上 onnxruntime-node 原生包损坏（SIGBUS / Bus error）
 * 常见原因：npmmirror 等镜像导致 libonnxruntime.so 只有 ~225KB（正常约 15MB+）
 * 在 backend 目录执行: node scripts/fix-onnxruntime-install.js
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const EXPECTED_VERSION = '1.17.3';
/** 1.17.3 linux x64 的 libonnxruntime.so 正常约 15–20MB；小于此视为损坏 */
const MIN_LIB_BYTES = 10 * 1024 * 1024;

const npmOfficialEnv = {
  ...process.env,
  npm_config_registry: 'https://registry.npmjs.org/',
};

function run(cmd, env = npmOfficialEnv) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env });
}

function findLinuxOnnxLib() {
  const matches = [];
  const pnpmOnnx = path.join(root, 'node_modules/.pnpm');
  if (fs.existsSync(pnpmOnnx)) {
    for (const entry of fs.readdirSync(pnpmOnnx)) {
      if (!entry.startsWith('onnxruntime-node@')) continue;
      const lib = path.join(
        pnpmOnnx,
        entry,
        'node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1.17.3',
      );
      if (fs.existsSync(lib)) matches.push(lib);
    }
  }
  const flat = path.join(
    root,
    'node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1.17.3',
  );
  if (fs.existsSync(flat)) matches.push(flat);
  return [...new Set(matches)];
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function validateLinuxLib() {
  if (process.platform !== 'linux') {
    console.log('非 Linux，跳过 libonnxruntime.so 大小检查');
    return true;
  }

  const libs = findLinuxOnnxLib();
  if (libs.length === 0) {
    console.log('⚠️ 未找到 linux/x64/libonnxruntime.so.1.17.3');
    return false;
  }

  let ok = true;
  for (const lib of libs) {
    const size = fs.statSync(lib).size;
    const good = size >= MIN_LIB_BYTES;
    console.log(
      `${good ? '✅' : '❌'} ${lib}\n   大小 ${formatBytes(size)}${good ? '' : ` — 损坏（应 ≥ ${formatBytes(MIN_LIB_BYTES)}）`}`,
    );
    ok = ok && good;
  }
  return ok;
}

function resolveImglyDir() {
  const entry = require.resolve('@imgly/background-removal-node', { paths: [root] });
  return path.dirname(entry);
}

function smokeRequireOnnx() {
  const imglyDir = resolveImglyDir();
  const script =
    `process.chdir(${JSON.stringify(imglyDir)});` +
    `require('onnxruntime-node'); console.log('onnx ok');`;

  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: 30000,
    env: npmOfficialEnv,
  });

  if (result.signal) {
    console.error(`❌ require 崩溃: signal=${result.signal}`);
    return false;
  }
  if (result.status !== 0) {
    console.error('❌ require 失败:', (result.stderr || result.stdout || '').trim());
    return false;
  }
  console.log(`✅ ${result.stdout.trim()}`);
  return true;
}

function hasPnpm() {
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function removeOnnxPackages() {
  const targets = [
    path.join(root, 'node_modules/onnxruntime-node'),
    path.join(root, 'node_modules/.pnpm'),
  ];
  if (fs.existsSync(targets[0])) {
    fs.rmSync(targets[0], { recursive: true, force: true });
  }
  const pnpmDir = targets[1];
  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (entry.startsWith('onnxruntime-node@') || entry.startsWith('onnxruntime-common@')) {
        fs.rmSync(path.join(pnpmDir, entry), { recursive: true, force: true });
      }
    }
  }
}

function main() {
  console.log('=== 修复 onnxruntime-node（官方 npm 源）===');
  console.log(`Node: ${process.version}, 平台: ${process.platform} ${process.arch}\n`);

  console.log('安装前检查:');
  const beforeOk = validateLinuxLib();
  if (!beforeOk && process.platform === 'linux') {
    console.log('\n⚠️ 检测到 libonnxruntime.so 损坏（常见于 npmmirror 下载不完整）');
  }

  console.log('\n删除旧包并从 registry.npmjs.org 重装…');
  removeOnnxPackages();

  if (hasPnpm()) {
    run(`pnpm add onnxruntime-node@${EXPECTED_VERSION} --force`);
    run('pnpm rebuild onnxruntime-node');
  } else {
    run(`npm install onnxruntime-node@${EXPECTED_VERSION} --save-exact --force`);
    run('npm rebuild onnxruntime-node');
  }

  console.log('\n安装后检查:');
  if (!validateLinuxLib()) {
    console.error('\n❌ libonnxruntime.so 仍然过小，请检查网络或手动下载：');
    console.error('   npm_config_registry=https://registry.npmjs.org pnpm add onnxruntime-node@1.17.3 --force');
    process.exit(1);
  }

  console.log('\n冒烟: require("onnxruntime-node") …');
  if (!smokeRequireOnnx()) {
    process.exit(1);
  }

  console.log('\n✅ 修复完成。请运行: node scripts/diagnose-background-removal.js && pm2 restart <后端>');
}

main();
