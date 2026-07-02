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

function validateLinuxOnnxLib() {
  if (process.platform !== 'linux') return null;

  const matches = [];
  const pnpmDir = path.join(root, 'node_modules/.pnpm');
  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (!entry.startsWith('onnxruntime-node@')) continue;
      const lib = path.join(
        pnpmDir,
        entry,
        'node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1.17.3',
      );
      if (fs.existsSync(lib)) matches.push(lib);
    }
  }

  if (matches.length === 0) return null;

  const minBytes = 10 * 1024 * 1024;
  for (const lib of matches) {
    const size = fs.statSync(lib).size;
    const mb = (size / 1024 / 1024).toFixed(2);
    if (size < minBytes) {
      return {
        ok: false,
        detail: `${mb} MB（损坏，正常约 15MB+）— 执行 node scripts/fix-onnxruntime-install.js`,
      };
    }
    return { ok: true, detail: `${mb} MB` };
  }
  return null;
}

function readOnnxInfo() {
  const candidates = [
    path.join(root, 'node_modules/onnxruntime-node/package.json'),
    path.join(
      root,
      'node_modules/@imgly/background-removal-node/node_modules/onnxruntime-node/package.json',
    ),
  ];
  for (const pkgPath of candidates) {
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return { version: pkg.version, dir: path.dirname(pkgPath) };
    } catch {
      // ignore
    }
  }
  return null;
}

function runOnnxLoadTest() {
  return new Promise((resolve) => {
    let imglyDir;
    try {
      const entry = require.resolve('@imgly/background-removal-node', { paths: [root] });
      imglyDir = path.dirname(entry);
    } catch (error) {
      resolve({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const script =
      `process.chdir(${JSON.stringify(imglyDir)});` +
      `require('onnxruntime-node'); console.log('ok');`;

    const child = spawn(process.execPath, ['-e', script], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c;
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });
    child.on('close', (code, signal) => {
      if (code === 0 && stdout.includes('ok')) {
        resolve({ ok: true });
        return;
      }
      resolve({
        ok: false,
        error:
          stderr.trim() ||
          stdout.trim() ||
          `exit=${code ?? 'null'} signal=${signal ?? 'null'}`,
        signal: signal ?? undefined,
      });
    });
    child.on('error', (error) => resolve({ ok: false, error: error.message }));
  });
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

    child.on('close', (code, signal) => {
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
        const detail =
          stderr.trim() || trimmed || `exit=${code ?? 'null'} signal=${signal ?? 'null'}`;
        resolve({
          ok: false,
          error: detail,
          signal: signal ?? undefined,
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

  const libCheck = validateLinuxOnnxLib();
  if (libCheck) {
    allOk =
      check('libonnxruntime.so 完整性', libCheck.ok, libCheck.detail) && allOk;
  }

  const onnxInfo = readOnnxInfo();
  if (onnxInfo) {
    const versionOk = onnxInfo.version === '1.17.3';
    allOk =
      check(
        'onnxruntime-node 版本',
        versionOk,
        `${onnxInfo.version} (${onnxInfo.dir})${versionOk ? '' : ' — 应为 1.17.3，npm 可能 hoist 到了 1.26'}`,
      ) && allOk;
  } else {
    allOk = check('onnxruntime-node', false, '未安装') && allOk;
  }

  const memMb = Math.round(require('os').freemem() / 1024 / 1024);
  console.log(`ℹ️ 可用内存约 ${memMb} MB（ONNX 建议 ≥ 1500 MB）`);

  if (!workerPath || !sharpOk) {
    console.log('\n=== 修复建议（与本地开发相同栈）===');
    console.log('1. cd backend && rm -rf node_modules && pnpm install');
    console.log('2. node scripts/fix-sharp-install.js   # Linux 上 sharp 失败时');
    console.log('3. npm run build');
    console.log('4. node scripts/diagnose-background-removal.js');
    console.log('5. pm2 restart <后端进程>');
    process.exit(1);
  }

  console.log('\n测试 onnxruntime-node 加载…');
  const onnxLoad = await runOnnxLoadTest();
  allOk =
    check(
      'onnxruntime-node 加载',
      onnxLoad.ok,
      onnxLoad.ok
        ? '通过'
        : onnxLoad.signal === 'SIGBUS'
          ? `SIGBUS — 原生库与系统不兼容，执行 node scripts/fix-onnxruntime-install.js`
          : onnxLoad.error,
    ) && allOk;

  console.log('\n运行 worker 冒烟测试（1×1 PNG，首次可能需下载/加载模型）...');
  const smoke = await runWorkerSmokeTest(workerPath);
  allOk = check('worker 冒烟测试', smoke.ok, smoke.ok ? '通过' : smoke.error) && allOk;

  if (!allOk) {
    console.log('\n=== 修复建议 ===');
    console.log('1. node scripts/fix-onnxruntime-install.js');
    console.log('2. 若仍 SIGBUS：升级 Node 到 v22（与本地一致），再 rm -rf node_modules && pnpm install');
    console.log('3. 检查内存: free -h（建议 ECS ≥ 2GB）');
    process.exit(1);
  }

  console.log('\n✅ 本地 ONNX 抠图链路正常，与本地开发环境一致。');
}

void main();
