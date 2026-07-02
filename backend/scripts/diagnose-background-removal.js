#!/usr/bin/env node
/**
 * 本地 ONNX 抠图诊断（与线上一致：@imgly/background-removal-node + 隔离 worker）
 * 在 Linux 生产 backend 目录执行: node scripts/diagnose-background-removal.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function check(name, ok, detail) {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${name}${detail ? `: ${detail}` : ''}`);
  return ok;
}

function resolveWorkerPath() {
  const candidates = [
    path.join(root, 'dist/ai/workers/background-removal.worker.js'),
    path.join(root, 'src/ai/workers/background-removal.worker.ts'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function resolveResourcesJson() {
  try {
    const pkgJson = require.resolve('@imgly/background-removal-node/package.json', {
      paths: [root],
    });
    const resources = path.join(path.dirname(pkgJson), 'dist/resources.json');
    return fs.existsSync(resources) ? resources : null;
  } catch {
    return null;
  }
}

function runWorkerSmokeTest(workerPath) {
  return new Promise((resolve) => {
    const args = workerPath.endsWith('.ts')
      ? ['-r', 'ts-node/register/transpile-only', workerPath]
      : [workerPath];

    const child = spawn(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        OMP_NUM_THREADS: '1',
        ORT_DISABLE_CPU_AFFINITY: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timeoutMs = 120000;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: 'worker 超时 (>120s)' });
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = stdout.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.ok && parsed.imageData) {
          resolve({ ok: true });
          return;
        }
        resolve({ ok: false, error: parsed.error || `exit=${code}` });
      } catch {
        resolve({
          ok: false,
          error: stderr.trim() || trimmed || `exit=${code}, no JSON output`,
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });

    child.stdin.write(
      JSON.stringify({ imageBase64: TINY_PNG_BASE64, mimeType: 'image/png' }),
    );
    child.stdin.end();
  });
}

async function main() {
  console.log('=== 本地 ONNX 抠图诊断 ===');
  console.log(`目录: ${root}`);
  console.log(`Node: ${process.version}`);
  console.log(`平台: ${process.platform} ${process.arch}\n`);

  let allOk = true;

  let sharpOk = false;
  try {
    require('sharp');
    sharpOk = true;
  } catch (error) {
    allOk = check(
      'sharp',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
  if (sharpOk) {
    check('sharp', true);
  }

  const workerPath = resolveWorkerPath();
  allOk = check('worker 文件', Boolean(workerPath), workerPath ?? '未找到') && allOk;

  const resources = resolveResourcesJson();
  if (resources) {
    check('ONNX 模型资源', true, resources);
  } else {
    console.log('⚠️ ONNX 模型 resources.json 未在 node_modules 中找到（运行时可能从 CDN 拉取）');
  }

  try {
    require.resolve('@imgly/background-removal-node', { paths: [root] });
    check('@imgly/background-removal-node', true);
  } catch (error) {
    allOk =
      check(
        '@imgly/background-removal-node',
        false,
        error instanceof Error ? error.message : String(error),
      ) && allOk;
  }

  if (!workerPath || !sharpOk) {
    console.log('\n=== 修复建议（与本地开发相同栈）===');
    console.log('1. cd backend && rm -rf node_modules && pnpm install');
    console.log('2. node scripts/fix-sharp-install.js   # Linux 上 sharp 失败时');
    console.log('3. npm run build');
    console.log('4. node scripts/diagnose-background-removal.js');
    console.log('5. pm2 restart <后端进程>');
    process.exit(1);
  }

  console.log('\n运行 worker 冒烟测试（1×1 PNG，首次可能需下载/加载模型）...');
  const smoke = await runWorkerSmokeTest(workerPath);
  allOk = check('worker 冒烟测试', smoke.ok, smoke.ok ? '通过' : smoke.error) && allOk;

  if (!allOk) {
    console.log('\n=== 修复建议 ===');
    console.log('- 查看上方 worker 报错；常见为 onnxruntime-node 原生包未正确安装');
    console.log('- 在 backend 目录: rm -rf node_modules && pnpm install && npm run build');
    console.log('- 内存不足时增大 ECS 规格或 pm2 的 max_memory_restart');
    process.exit(1);
  }

  console.log('\n✅ 本地 ONNX 抠图链路正常，与本地开发环境一致。');
}

void main();
