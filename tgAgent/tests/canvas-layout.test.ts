import { layoutCandidates, CARD_W, CARD_H } from "../src/canvas/layout.js";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const GAP = 40;

async function main(): Promise<void> {
  // ================================================================
  // Basic placement
  // ================================================================
  {
    // viewport center placement (no centering offset — the position IS the card top-left)
    const r1 = layoutCandidates({ candidateCount: 1, viewportCenter: { x: 500, y: 300 } });
    assert(r1.length === 1, "should place 1 card");
    assert(r1[0]!.pos.x === 500, "x = viewportCenter.x");
    assert(r1[0]!.pos.y === 300, "y = viewportCenter.y");

    // no anchor/center → defaults to (0, 90)
    const r2 = layoutCandidates({ candidateCount: 1 });
    assert(r2[0]!.pos.x === 0, "default x = 0");
    assert(r2[0]!.pos.y === 90, "default y = 90");

    // multiple in a row
    const r3 = layoutCandidates({ candidateCount: 3, viewportCenter: { x: 0, y: 0 } });
    assert(r3.length === 3);
    assert(r3[0]!.pos.x === 0);
    assert(r3[1]!.pos.x === CARD_W + GAP);
    assert(r3[2]!.pos.x === 2 * (CARD_W + GAP));
    for (let i = 0; i < 3; i++) assert(r3[i]!.pos.y === 0, "same row");

    console.log("✓ Basic placement");
  }

  // ================================================================
  // Anchor placement
  // ================================================================
  {
    const result = layoutCandidates({
      candidateCount: 2,
      anchor: { x: 100, y: 50, width: 300 },
      viewportCenter: { x: 0, y: 0 },
    });
    // startX = 100 + 300 + 40 = 440
    assert(result[0]!.pos.x === 440, `startX expected 440, got ${result[0]!.pos.x}`);
    assert(result[1]!.pos.x === 440 + CARD_W + GAP, "second card gap");
    assert(result[0]!.pos.y === 50, "anchor y = anchor.y");
    console.log("✓ Anchor placement");
  }

  // ================================================================
  // Collision avoidance
  // ================================================================
  {
    // Downward shift when anchor row occupied
    const occupied1 = [{ x: 440, y: 50, w: CARD_W, h: CARD_H }];
    const r1 = layoutCandidates(
      { candidateCount: 1, anchor: { x: 100, y: 50, width: 300 }, viewportCenter: { x: 0, y: 0 } },
      occupied1,
    );
    assert(r1[0]!.pos.y === 310, `shift down, expected 310 got ${r1[0]!.pos.y}`);

    // Upward fold when all downward rows are occupied
    const occupied2: { x: number; y: number; w: number; h: number }[] = [];
    for (let row = 0; row < 60; row++) {
      occupied2.push({ x: 0, y: row * (CARD_H + GAP), w: CARD_W * 3, h: CARD_H });
    }
    const r2 = layoutCandidates(
      { candidateCount: 1, viewportCenter: { x: 0, y: 0 } },
      occupied2,
    );
    // All downward rows occupied → falls back to anchor row (y=0)
    assert(r2[0]!.pos.y === 0, `fallback, expected 0 got ${r2[0]!.pos.y}`);

    console.log("✓ Collision avoidance");
  }

  // ================================================================
  // Multi-card consistency
  // ================================================================
  {
    const r = layoutCandidates({ candidateCount: 5 });
    for (let i = 0; i < r.length - 1; i++) {
      const gap = r[i + 1]!.pos.x - r[i]!.pos.x;
      assert(gap === CARD_W + 40, `gap between cards ${i} and ${i + 1} should be ${CARD_W + 40}`);
    }
    console.log("✓ Multi-card consistency");
  }

  console.log("\nALL PASS ✅");
}

main().catch((err) => {
  console.error("FAIL ❌", err);
  process.exit(1);
});
