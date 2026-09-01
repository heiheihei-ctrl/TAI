/**
 * 会话/资产持久化测试：gateway/sessionStore.ts + GatewaySessions.init/restore。
 *
 * 覆盖：
 *  - off 模式（enabled=false）静默无操作
 *  - 快照与资产的文件 round-trip
 *  - 跨"进程重启"（新建 GatewaySessions + AssetStore + init）恢复会话状态
 *  - 恢复后 emit 的 seq 继续单调递增（断线补发语义不被重置）
 *  - markDirty debounce 真的会落盘
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyBrief, mergeBrief } from "../src/shared/brief.js";
import { AssetStore } from "../src/assets/store.js";
import { MockTaskSource } from "../src/tasks/mockSource.js";
import { GatewaySessions } from "../src/gateway/sessions.js";
import { SessionStore } from "../src/gateway/sessionStore.js";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`✓ ${msg}`);
  } else {
    failed++;
    console.error(`✗ ${msg}`);
  }
}

const fakeCfg = { deepseek: { apiKey: "", baseUrl: "http://localhost" } } as never;

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "tgagent-store-"));

  try {
    // ---- ① off 模式 ----
    {
      const off = new SessionStore("off", () => undefined);
      assert(off.enabled === false, "① off 模式不启用");
      await off.saveSession({
        version: 1, key: "a/b/c", projectId: "a", sessionId: "c", userId: "b",
        seq: 1, ring: [], brief: emptyBrief(), selection: [], mode: "chat",
        placedRects: [], pendingVideoJobs: [], updatedAt: new Date().toISOString(),
      });
      const loaded = await off.loadSessions();
      assert(loaded.length === 0, "① off 模式 load 为空");
    }

    // ---- ② 文件 round-trip ----
    {
      const store = new SessionStore(dir, () => undefined);
      await store.saveSession({
        version: 1, key: "p1/u1/s1", projectId: "p1", sessionId: "s1", userId: "u1",
        seq: 42, ring: [{ seq: 42, body: { type: "conversation.delta", sessionId: "s1", delta: "hi" } }],
        brief: mergeBrief(emptyBrief(), { projectType: "办公楼" }),
        selection: [{ assetId: "as_1", kind: "image" }],
        mode: "design",
        placedRects: [{ x: 10, y: 20, w: 200, h: 120 }],
        pendingVideoJobs: [],
        updatedAt: new Date().toISOString(),
      });
      await store.saveAssets("p1", [
        {
          id: "as_1", projectId: "p1", kind: "image", url: "https://x/1.png",
          parentIds: [], operation: "newVariant", meta: {}, deleted: false,
          createdAt: new Date().toISOString(),
        },
      ]);

      const store2 = new SessionStore(dir, () => undefined);
      const snaps = await store2.loadSessions();
      const assets = await store2.loadAssets();
      assert(snaps.length === 1 && snaps[0]!.key === "p1/u1/s1", "② 会话快照 round-trip");
      assert(snaps[0]!.seq === 42 && snaps[0]!.mode === "design", "② 快照字段完整");
      assert(assets.length === 1 && assets[0]!.id === "as_1", "② 资产表 round-trip");
      // ①落盘的会话 ring 截断：PERSIST_RING_LIMIT=250，保存时 slice
      assert(snaps[0]!.ring.length === 1, "② ring 保留事件");
    }

    // ---- ③ 跨重启恢复会话状态 ----
    {
      const assets = new AssetStore();
      const sessions = new GatewaySessions(fakeCfg, assets, new MockTaskSource(), () => undefined);
      const store = new SessionStore(join(dir, "reboot"), () => undefined);
      await sessions.init(store);

      const rec = sessions.getOrCreate("pA", "sessA", "userA");
      rec.emit({ type: "brief.updated", sessionId: "sessA", brief: mergeBrief(emptyBrief(), { projectType: "会展中心" }) });
      rec.emit({ type: "conversation.delta", sessionId: "sessA", delta: "方案初稿" });
      rec.setSelection([{ assetId: "as_keep", kind: "image", x: 5, y: 6, width: 100 }]);
      const asset = assets.register({
        projectId: "pA", kind: "image", url: "https://x/a.png", parentIds: [], operation: "newVariant",
      });
      // 手动推进占用（视频卡落位路径之外的直接写入）
      rec.emit({ type: "canvas.place", sessionId: "sessA", cards: [{ assetId: asset.id, url: asset.url, pos: { x: 0, y: 0 }, parentIds: [], operation: "newVariant", style: "candidate" }] });
      await sessions.persistNow();
      await sessions.disposeAll();

      // 模拟"进程重启"：全新的 sessions + AssetStore + 同一存储
      const assets2 = new AssetStore();
      const sessions2 = new GatewaySessions(fakeCfg, assets2, new MockTaskSource(), () => undefined);
      await sessions2.init(store);
      const rec2 = sessions2.getOrCreate("pA", "sessA", "userA");

      assert(rec2 !== rec, "③ 重启后是新实例");
      const recoveredAssets = assets2.serialize("pA");
      assert(recoveredAssets.some((a) => a.id === asset.id), "③ 资产跨重启恢复");
      const batch = rec2.resync(0);
      assert(
        batch.messages.some((m) => m.body.type === "canvas.place"),
        "③ ring 事件跨重启恢复（resync 可见）",
      );
      assert(
        batch.messages.some((m) => m.body.type === "brief.updated" && m.body.brief?.projectType === "会展中心"),
        "③ brief 跨重启恢复",
      );

      // 恢复后 emit 的 seq 必须接着旧值递增，否则前端 lastSeq 会误判"历史消息"
      const before = batch.messages[batch.messages.length - 1]!.seq;
      rec2.emit({ type: "conversation.delta", sessionId: "sessA", delta: "重启后继续" });
      const after = rec2.resync(before).messages[0]?.seq;
      assert(after === before + 1, `③ 恢复后 seq 继续递增（${before} → ${after}）`);

      await sessions2.disposeAll();
    }

    // ---- ④ markDirty debounce 落盘 ----
    {
      const dirDebounce = join(dir, "debounce");
      const sessions = new GatewaySessions(fakeCfg, new AssetStore(), new MockTaskSource(), () => undefined);
      await sessions.init(new SessionStore(dirDebounce, () => undefined));
      const rec = sessions.getOrCreate("pD", "sessD", "userD");
      rec.emit({ type: "conversation.delta", sessionId: "sessD", delta: "x" });
      // debounce 500ms：立即查文件应不存在
      const storeProbe = new SessionStore(dirDebounce, () => undefined);
      const tooEarly = (await storeProbe.loadSessions()).length;
      assert(tooEarly === 0, "④ debounce 未到期时快照尚未落盘");
      await new Promise((r) => setTimeout(r, 700));
      const persisted = (await storeProbe.loadSessions()).length;
      assert(persisted === 1, "④ debounce 到期后快照已落盘");
      await sessions.disposeAll();
    }

    // ---- ⑤ 文件名不可预测（hash），key 含路径分隔符也不穿越 ----
    {
      const tricky = new SessionStore(join(dir, "tricky"), () => undefined);
      await tricky.saveSession({
        version: 1, key: "../evil/x", projectId: "../evil", sessionId: "x", userId: "u",
        seq: 1, ring: [], brief: emptyBrief(), selection: [], mode: "chat",
        placedRects: [], pendingVideoJobs: [], updatedAt: new Date().toISOString(),
      });
      const sessionsDir = join(dir, "tricky", "sessions");
      const { readdir } = await import("node:fs/promises");
      const names = await readdir(sessionsDir);
      assert(
        names.every((n) => /^[0-9a-f]{24}\.json$/.test(n) && !n.includes("/") && !n.includes("..")),
        "⑤ 文件名是纯 hash，键中的 ../ 不进路径",
      );
      // 目录本身仍应存在（mkdir 已建）
      assert(await stat(sessionsDir).then(() => true).catch(() => false), "⑤ 存储目录已创建");
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (failed > 0) {
    console.error(`\n${failed} 项失败`);
    process.exit(1);
  }
  console.log("\nSESSION STORE TEST PASS ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error("SESSION STORE TEST FAIL ❌", err);
  process.exit(1);
});
