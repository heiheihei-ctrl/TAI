import { GatewaySessions } from "../src/gateway/sessions.js";
import { AssetStore } from "../src/assets/store.js";
import { MockTaskSource } from "../src/tasks/mockSource.js";
import { emptyBrief } from "../src/shared/brief.js";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  // ================================================================
  // 1. Session lifecycle
  // ================================================================
  {
    const assets = new AssetStore();
    const source = new MockTaskSource();
    const sessions = new GatewaySessions(
      { deepseek: { apiKey: "", baseUrl: "http://localhost" } } as never,
      assets, source, () => undefined,
    );

    const s1 = sessions.getOrCreate("p1", "s1");
    assert(s1.sessionId === "s1");
    assert(s1.projectId === "p1");

    const s2 = sessions.getOrCreate("p1", "s1");
    assert(s1 === s2, "idempotent");

    assert(sessions.get("p1", "ghost") === undefined);

    const auto = sessions.getOrCreate("auto_proj");
    assert(auto.sessionId.startsWith("sess_"));

    const pa = sessions.getOrCreate("A", "s1");
    const pb = sessions.getOrCreate("B", "s1");
    assert(pa !== pb);

    const sa = sessions.getOrCreate("p1", "sa");
    const sb = sessions.getOrCreate("p1", "sb");
    assert(sa !== sb);

    await sessions.disposeAll();
    assert(sessions.get("p1", "s1") === undefined);

    console.log("✓ Session lifecycle");
  }

  // ================================================================
  // 2. Seq ring buffer & resync
  // ================================================================
  {
    const { sessions, assets } = makeSessions2();
    const s = sessions.getOrCreate("p1", "s1");
    const msgs: { seq: number }[] = [];
    (s as unknown as { attach: (fn: (m: unknown) => void) => () => void }).attach((m) => {
      msgs.push(m as { seq: number });
    });

    s.emit({ type: "brief.updated", sessionId: "s1", brief: emptyBrief() });
    s.emit({ type: "brief.updated", sessionId: "s1", brief: emptyBrief() });
    s.emit({ type: "brief.updated", sessionId: "s1", brief: emptyBrief() });
    assert(msgs.map((m) => m.seq).join(",") === "1,2,3", "seq monotonic");

    const empty = resync(s, undefined);
    assert(empty.messages.length === 0);
    assert(empty.truncated === false);

    const batch = resync(s, 1);
    assert(batch.messages.length === 2, `missed 2, got ${batch.messages.length}`);
    assert(batch.messages[0]!.seq === 2);
    assert(batch.messages[1]!.seq === 3);

    // Overflow: emit 600 > RING_SIZE(500)
    for (let i = 0; i < 600; i++) s.emit({ type: "brief.updated", sessionId: "s1", brief: emptyBrief() });
    const overflow = resync(s, 0);
    assert(overflow.messages.length <= 500, `ring cap: ${overflow.messages.length}`);
    console.log("✓ Seq ring & resync");
  }

  // ================================================================
  // 3. Broadcast & sender lifecycle
  // ================================================================
  {
    const { sessions } = makeSessions2();
    const s = sessions.getOrCreate("p1", "s1");

    const good: unknown[] = [];
    const detach = (s as unknown as { attach: (fn: (m: unknown) => void) => () => void }).attach((m) => good.push(m));
    s.emit({ type: "brief.updated", sessionId: "s1", brief: emptyBrief() });
    assert(good.length === 1);
    detach();
    s.emit({ type: "brief.updated", sessionId: "s1", brief: emptyBrief() });
    assert(good.length === 1);
    console.log("✓ Broadcast & detach");
  }

  // ================================================================
  // 4. patchBrief
  // ================================================================
  {
    const { sessions } = makeSessions2();
    const s = sessions.getOrCreate("p1", "s1");
    const caps: { body: { type: string } }[] = [];
    (s as unknown as { attach: (fn: (m: unknown) => void) => () => void }).attach((m) => caps.push(m as { body: { type: string } }));

    (s as unknown as { patchBrief: (p: Record<string, unknown>) => unknown }).patchBrief({ projectType: "办公楼" });
    assert(caps.some((m) => m.body.type === "brief.updated"), "should broadcast");
    console.log("✓ patchBrief");
  }

  // ================================================================
  // 5. markCards
  // ================================================================
  {
    const { sessions, assets } = makeSessions2();
    const s = sessions.getOrCreate("p1", "s1");
    const caps: { body: { type: string; updates?: { assetId: string; patch: { pick?: string } }[] } }[] = [];
    (s as unknown as { attach: (fn: (m: unknown) => void) => () => void }).attach((m) => caps.push(m as { body: { type: string; updates?: { assetId: string }[] } }));

    const card = assets.register({ projectId: "p1", kind: "image", url: "https://ex.com/1.png", operation: "newVariant" });
    (s as unknown as { markCards: (marks: { assetId: string; pick: string }[]) => void }).markCards([{ assetId: card.id, pick: "final" }]);

    assert(caps.some((m) => m.body.type === "canvas.update"));
    console.log("✓ markCards");
  }

  // ================================================================
  // 6. ScriptedBrain round-trip
  // ================================================================
  {
    const { sessions, assets, source } = makeSessions2();
    const s = sessions.getOrCreate("p1", "s1");
    const msgs: { body: { type: string } }[] = [];
    (s as unknown as { attach: (fn: (m: unknown) => void) => () => void }).attach((m) => msgs.push(m as { body: { type: string } }));

    await (s as unknown as { handleSend: (m: { clientId: string; text: string }) => Promise<void> }).handleSend({
      type: "message.send", projectId: "p1", sessionId: "s1", text: "做一个办公楼", clientId: "ic-1",
    });
    assert(msgs.some((m) => m.body.type === "brief.updated"));

    msgs.length = 0;
    await (s as unknown as { handleSend: (m: { clientId: string; text: string }) => Promise<void> }).handleSend({
      type: "message.send", projectId: "p1", sessionId: "s1", text: "黄昏出图", clientId: "ic-2",
    });
    assert(msgs.some((m) => m.body.type === "canvas.place"), "should produce canvas.place");
    console.log("✓ ScriptedBrain round-trip");
  }

  // ================================================================
  // 7. userId isolation (P0 安全修复：会话键含用户身份)
  // ================================================================
  {
    const sessions = new GatewaySessions(
      { deepseek: { apiKey: "", baseUrl: "http://localhost" } } as never,
      new AssetStore(), new MockTaskSource(), () => undefined,
    );

    // 同 projectId+sessionId，不同 userId → 不同 record
    const sA = sessions.getOrCreate("p1", "s1", "userA");
    const sB = sessions.getOrCreate("p1", "s1", "userB");
    assert(sA !== sB, "different userId → different session");
    assert(sA.userId === "userA");
    assert(sB.userId === "userB");

    // 同 userId → 幂等
    const sA2 = sessions.getOrCreate("p1", "s1", "userA");
    assert(sA === sA2, "same userId idempotent");

    // 默认 userId = "anon"
    const sAnon = sessions.getOrCreate("p1", "s1");
    assert(sAnon.userId === "anon");
    assert(sAnon !== sA, "anon ≠ userA");

    // get() 也接受 userId
    assert(sessions.get("p1", "s1", "userA") === sA);
    assert(sessions.get("p1", "s1", "userB") === sB);
    assert(sessions.get("p1", "s1", "ghost") === undefined);

    await sessions.disposeAll();
    console.log("✓ userId isolation");
  }

  console.log("\nALL PASS ✅");
}

// ========== helpers ==========

function makeSessions2(): { sessions: GatewaySessions; assets: AssetStore; source: MockTaskSource } {
  const assets = new AssetStore();
  const source = new MockTaskSource();
  const sessions = new GatewaySessions(
    { deepseek: { apiKey: "", baseUrl: "http://localhost" } } as never,
    assets, source, () => undefined,
  );
  return { sessions, assets, source };
}

function resync(session: ReturnType<GatewaySessions["getOrCreate"]>, lastSeq: number | undefined): { messages: { seq: number }[]; truncated: boolean } {
  return (session as any).resync(lastSeq) as { messages: { seq: number }[]; truncated: boolean };
}

main().catch((err) => { console.error("FAIL ❌", err); process.exit(1); });
