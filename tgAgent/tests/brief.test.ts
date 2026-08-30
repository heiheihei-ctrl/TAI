import { emptyBrief, mergeBrief } from "../src/shared/brief.js";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  // ================================================================
  // emptyBrief
  // ================================================================
  {
    const b = emptyBrief();
    assert(b.styleKeywords.length === 0, "empty styleKeywords");
    assert(b.materials.length === 0, "empty materials");
    assert(b.negative.length === 0, "empty negative");
    assert(b.freeText === "", "empty freeText");
    assert(b.completeness === "needMoreInfo", "default completeness");
    assert(b.projectType === undefined, "projectType should be undefined");
    assert(b.updatedAt !== "", "updatedAt should be set");
    console.log("✓ emptyBrief");
  }

  // ================================================================
  // mergeBrief
  // ================================================================
  {
    const base = emptyBrief();
    base.projectType = "住宅";
    base.styleKeywords = ["现代极简"];
    base.massing = "3层";
    base.materials = ["玻璃幕墙"];
    base.context = "滨海";
    base.camera = "人视";
    base.lighting = "黄昏";
    base.mood = "宁静";
    base.negative = ["高饱和"];
    base.freeText = "大面积落地窗";
    base.completeness = "ready";

    // immutability
    const next = mergeBrief(base, { projectType: "办公" } as never);
    assert(next !== base, "should return new object");

    // scalar overrides
    assert(mergeBrief(base, { projectType: "文化" }).projectType === "文化");
    assert(mergeBrief(base, { massing: "10层" }).massing === "10层");
    assert(mergeBrief(base, { context: "山地" }).context === "山地");
    assert(mergeBrief(base, { camera: "鸟瞰" }).camera === "鸟瞰");
    assert(mergeBrief(base, { lighting: "夜景" }).lighting === "夜景");
    assert(mergeBrief(base, { mood: "未来感" }).mood === "未来感");
    assert(mergeBrief(base, { freeText: "新增文本" }).freeText === "新增文本");

    // array replacement (not concat)
    assert(mergeBrief(base, { styleKeywords: ["侘寂"] }).styleKeywords.join(",") === "侘寂");
    assert(mergeBrief(base, { materials: ["清水混凝土"] }).materials.join(",") === "清水混凝土");
    assert(mergeBrief(base, { negative: ["低分辨率", "模糊"] }).negative.join(",") === "低分辨率,模糊");

    // completeness
    const b2 = emptyBrief();
    b2.completeness = "needMoreInfo";
    assert(mergeBrief(b2, { completeness: "ready" }).completeness === "ready");
    assert(mergeBrief(base, { styleKeywords: ["其他"] }).completeness === "ready");

    // completeness transitions

    console.log("✓ mergeBrief");
  }

  console.log("\nALL PASS ✅");
}

main().catch((err) => {
  console.error("FAIL ❌", err);
  process.exit(1);
});
