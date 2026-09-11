import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/pptImageService.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const storage = new Map();
let calls = 0;
let active = 0;
let maxActive = 0;
const requests = [];
function load() {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    require: () => ({ generateImageViaAPI: async (request) => {
      requests.push(request);
      const call = ++calls;
      maxActive = Math.max(maxActive, ++active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return call === 2 ? { success: false, error: { message: "mock failure" } } : { success: true, data: { imageUrl: `https://example.com/${call}.png` } };
    } }),
  });
  return exports;
}
const service = load();
const outline = [{ title: "封面", content: "" }, { title: "", content: "长内容".repeat(1000) }, { title: "结尾", content: "总结" }];
await Promise.all([service.runPptImageJob("test", outline), service.runPptImageJob("test", outline)]);
assert.equal(calls, 3, "duplicate triggers must not resubmit");
assert.equal(maxActive, 1, "requests must be sequential");
assert.equal(service.getPptImageJob("test", 3).pages.map((page) => page.status).join(","), "success,failed,success");
assert.ok(requests.every((request) => request.model === "gpt-image-2-official" && request.aspectRatio === "16:9"));
assert.ok(requests[1].prompt.includes(outline[1].content), "long content must not be silently truncated");
await service.runPptImageJob("test", outline, 1);
assert.equal(calls, 4, "retry only the failed page");
await service.runPptImageJob("test", outline, 0);
assert.equal(calls, 4, "successful pages must not regenerate");
const restored = load();
await restored.runPptImageJob("test", outline);
assert.equal(calls, 4, "completed snapshot must not regenerate on reload");
storage.set("tanva.ppt.images.interrupted", JSON.stringify([{ status: "generating" }]));
await restored.runPptImageJob("interrupted", outline.slice(0, 1));
assert.equal(restored.getPptImageJob("interrupted", 1).pages[0].status, "unknown");
assert.equal(calls, 4, "unknown requests must not automatically resubmit");
await restored.runPptImageJob("empty", []);
assert.equal(calls, 4, "empty outline must not submit");
console.log("PPT image service regression checks passed");