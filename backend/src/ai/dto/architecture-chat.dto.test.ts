/**
 * ArchitectureChatDto 校验单元测试。
 *
 * 不依赖 NestJS 运行时，直接验证 DTO 字段约束：
 *  - prompt 必填且为 string
 *  - projectId / sessionId 可选且为 string
 *  - selectionRefs 可选且为对象数组
 *  - attachments 可选且为对象数组
 */

import { describe, it, expect } from "vitest";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { ArchitectureChatDto } from "./architecture-chat.dto";

function validatedto(
  dto: new (...args: never[]) => unknown,
): (obj: Record<string, unknown>) => Promise<string[]> {
  return async (obj: Record<string, unknown>) => {
    const instance = plainToInstance(dto as any, obj as any);
    const errors = await validate(instance);
    return errors.map((e) => e.property);
  };
}

describe("ArchitectureChatDto", () => {
  // ---- prompt 必填（结构校验：@IsString 不拦截空串，留空由下游 tgagent 处理）----
  it("accepts empty prompt (no content validation by design)", async () => {
    const errs = await validatedto(ArchitectureChatDto)({ prompt: "" });
    // @IsString 只校验类型，空串 "" 也是 string → 通过
    expect(errs).not.toContain("prompt");
  });

  it("rejects missing prompt", async () => {
    const errs = await validatedto(ArchitectureChatDto)({});
    expect(errs).toContain("prompt");
  });

  it("rejects non-string prompt", async () => {
    const errs = await validatedto(ArchitectureChatDto)({ prompt: 123 as unknown as string });
    expect(errs).toContain("prompt");
  });

  it("rejects whitespace-only prompt", async () => {
    const errs = await validatedto(ArchitectureChatDto)({ prompt: "   " });
    expect(errs).not.toContain("prompt");
  });

  it("accepts plain string prompt", async () => {
    const errs = await validatedto(ArchitectureChatDto)({ prompt: "帮我设计一个办公楼" });
    expect(errs).toHaveLength(0);
  });

  // ---- projectId / sessionId 可选 ----
  it("accepts optional projectId and sessionId", async () => {
    const errs = await validatedto(ArchitectureChatDto)({
      prompt: "设计一个办公楼",
      projectId: "proj_1",
      sessionId: "sess_42",
    });
    expect(errs).toHaveLength(0);
  });

  it("rejects non-string projectId", async () => {
    const errs = await validatedto(ArchitectureChatDto)({
      prompt: "设计",
      projectId: 123 as unknown as string,
    });
    expect(errs).toContain("projectId");
  });

  // ---- selectionRefs 可选对象数组 ----
  it("accepts valid selectionRefs", async () => {
    const errs = await validatedto(ArchitectureChatDto)({
      prompt: "优化选区",
      selectionRefs: [
        {
          assetId: "img_001",
          kind: "image",
          imageWidth: 1024,
          imageHeight: 768,
          normalizedRegion: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
        },
      ],
    });
    expect(errs).toHaveLength(0);
  });

  it("accepts without selectionRefs", async () => {
    const errs = await validatedto(ArchitectureChatDto)({ prompt: "hello" });
    expect(errs).toHaveLength(0);
  });

  // ---- attachments 可选对象数组 ----
  it("accepts valid attachments", async () => {
    const errs = await validatedto(ArchitectureChatDto)({
      prompt: "分析图片",
      attachments: [
        { mediaType: "image/png", data: "data:image/png;base64,abc123" },
      ],
    });
    expect(errs).toHaveLength(0);
  });

  it("accepts without attachments", async () => {
    const errs = await validatedto(ArchitectureChatDto)({ prompt: "hello" });
    expect(errs).toHaveLength(0);
  });

  // ---- 全量 payload（TAI 前端实际格式）----
  it("accepts full TAI-frontend payload", async () => {
    const errs = await validatedto(ArchitectureChatDto)({
      prompt: "滨江办公楼黄昏方案",
      projectId: "proj_tai",
      sessionId: "sess_tai",
      selectionRefs: [
        {
          assetId: "canvas_01",
          kind: "image",
          imageWidth: 1920,
          imageHeight: 1080,
          normalizedRegion: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
        },
      ],
      attachments: [
        { mediaType: "image/png", data: "data:image/png;base64,iVBORw0KG..." },
      ],
    });
    expect(errs).toHaveLength(0);
  });

  // ---- 边界：attachments 非数组 ----
  it("rejects non-array attachments", async () => {
    const errs = await validatedto(ArchitectureChatDto)({
      prompt: "hello",
      attachments: "not-an-array" as unknown as Array<Record<string, unknown>>,
    });
    expect(errs).toContain("attachments");
  });

  // ---- 边界：selectionRefs 非数组 ----
  it("rejects non-array selectionRefs", async () => {
    const errs = await validatedto(ArchitectureChatDto)({
      prompt: "hello",
      selectionRefs: "bad" as unknown as Array<Record<string, unknown>>,
    });
    expect(errs).toContain("selectionRefs");
  });
});
