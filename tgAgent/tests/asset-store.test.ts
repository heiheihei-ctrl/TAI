import { AssetStore } from "../src/assets/store.js";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function makeInput(overrides: Record<string, unknown> = {}): Parameters<typeof AssetStore.prototype.register>[0] {
  return {
    projectId: "proj_1",
    kind: "image",
    url: "https://example.com/img.png",
    operation: "newVariant",
    ...overrides,
  };
}

async function main(): Promise<void> {
  // ================================================================
  // register
  // ================================================================
  {
    const store = new AssetStore();
    const a = store.register(makeInput());
    assert(a.id.startsWith("as_"), "id prefix");
    assert(a.projectId === "proj_1");
    assert(a.kind === "image");
    assert(a.operation === "newVariant");
    assert(a.pick === undefined);
    assert(a.deleted === false);
    assert(a.parentIds.length === 0);
    assert(a.createdAt.length > 0);

    const b = store.register(makeInput({ parentIds: ["p1"], createdByJobId: "j1", meta: { model: "x" }, width: 1024, height: 768 }));
    assert(b.parentIds[0] === "p1");
    assert(b.createdByJobId === "j1");
    assert(b.meta.model === "x");

    const ids = [store.register(makeInput()).id, store.register(makeInput()).id];
    assert(new Set(ids).size === 2, "unique IDs");
    console.log("✓ register");
  }

  // ================================================================
  // get / require
  // ================================================================
  {
    const store = new AssetStore();
    const a = store.register(makeInput());
    assert(store.get(a.id) === a, "get returns same ref");
    assert(store.get("x") === undefined, "get unknown → undefined");
    assert(store.require(a.id) === a, "require returns asset");
    let threw = false;
    try { store.require("unknown"); } catch { threw = true; }
    assert(threw, "require throws for unknown");
    console.log("✓ get / require");
  }

  // ================================================================
  // patch
  // ================================================================
  {
    const store = new AssetStore();
    const a = store.register(makeInput());
    assert(store.patch(a.id, { url: "https://new" }).url === "https://new");
    assert(store.patch(a.id, { pick: "final" }).pick === "final");

    const c = store.register(makeInput({ meta: { m: 1 } }));
    store.patch(c.id, { url: "x" });
    assert(store.get(c.id)!.meta.m === 1, "patch preserves other fields");

    let threw = false;
    try { store.patch("x", { url: "y" }); } catch { threw = true; }
    assert(threw, "patch throws for unknown");
    console.log("✓ patch");
  }

  // ================================================================
  // listByJob
  // ================================================================
  {
    const store = new AssetStore();
    const a1 = store.register(makeInput({ createdByJobId: "j1" }));
    const a2 = store.register(makeInput({ createdByJobId: "j1" }));
    const a3 = store.register(makeInput({ createdByJobId: "j2" }));
    const list = store.listByJob("j1");
    assert(list.includes(a1) && list.includes(a2) && !list.includes(a3) && list.length === 2);
    assert(store.listByJob("x").length === 0);
    console.log("✓ listByJob");
  }

  // ================================================================
  // lineage
  // ================================================================
  {
    const store = new AssetStore();
    const ms = new Map<string, { id: string; parentIds: string[]; deleted: boolean }>();
    ms.set("c", { id: "c", parentIds: ["p"], deleted: false });
    ms.set("p", { id: "p", parentIds: ["gp"], deleted: false });
    ms.set("gp", { id: "gp", parentIds: [], deleted: false });
    const mapAccess = store as unknown as { byId: Map<string, unknown> };
    (mapAccess.byId as Map<string, { id: string; parentIds: string[]; deleted: boolean }>).clear();
    for (const [k, v] of ms) (mapAccess.byId as Map<string, unknown>).set(k, v);

    const line = store.lineage("c");
    assert(line.map((a) => a.id).join(",") === "c,p,gp", "lineage order");

    // cycle guard
    const cyc = new Map<string, { id: string; parentIds: string[]; deleted: boolean }>();
    cyc.set("a", { id: "a", parentIds: ["b"], deleted: false });
    cyc.set("b", { id: "b", parentIds: ["a"], deleted: false });
    (mapAccess.byId as Map<string, { id: string; parentIds: string[]; deleted: boolean }>).clear();
    for (const [k, v] of cyc) (mapAccess.byId as Map<string, unknown>).set(k, v);
    assert(store.lineage("a").length === 2, "cycle guard");

    // skip deleted
    const del = new Map<string, { id: string; parentIds: string[]; deleted: boolean }>();
    del.set("a", { id: "a", parentIds: [], deleted: true });
    del.set("b", { id: "b", parentIds: ["a"], deleted: false });
    (mapAccess.byId as Map<string, { id: string; parentIds: string[]; deleted: boolean }>).clear();
    for (const [k, v] of del) (mapAccess.byId as Map<string, unknown>).set(k, v);
    assert(store.lineage("b").map((a) => a.id).join(",") === "b", "skip deleted");
    console.log("✓ lineage");
  }

  // ================================================================
  // delete / isDeleted
  // ================================================================
  {
    const store = new AssetStore();
    const a = store.register(makeInput());
    assert(!store.isDeleted(a.id));
    const d = store.delete(a.id);
    assert(d!.deleted === true);
    assert(store.isDeleted(a.id));
    assert(store.delete(a.id) === undefined, "double delete");
    assert(store.get(a.id) !== undefined, "soft-deleted still gettable");
    assert(store.isDeleted("unknown") === true, "unknown treated as deleted");
    console.log("✓ delete / isDeleted");
  }

  // ================================================================
  // listRecent
  // ================================================================
  {
    const store = new AssetStore();
    const a1 = store.register(makeInput({ projectId: "p1" }));
    const a2 = store.register(makeInput({ projectId: "p1" }));
    const a3 = store.register(makeInput({ projectId: "p1" }));
    assert(store.listRecent("p1", 10).length === 3);
    assert(store.listRecent("p1", 10)[0]!.id === a3.id, "newest first");
    assert(store.listRecent("p2", 10).length === 0, "other project");

    store.delete(a1.id);
    const recent = store.listRecent("p1", 10);
    assert(!recent.some((a) => a.id === a1.id), "exclude deleted");

    for (let i = 0; i < 5; i++) store.register(makeInput({ projectId: "p3" }));
    assert(store.listRecent("p3", 2).length === 2);
    console.log("✓ listRecent");
  }

  console.log("\nALL PASS ✅");
}

main().catch((err) => {
  console.error("FAIL ❌", err);
  process.exit(1);
});
