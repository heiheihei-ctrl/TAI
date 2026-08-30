/**
 * Brain 抽象 —— 会话的"推理引擎"。
 * - PiBrain：pi SDK + DeepSeek（真实，W1-① 后启用）
 * - ScriptedBrain：无 LLM 的确定性脚本（全链路联调/冒烟测试）
 * 两者对 gateway 完全等价，切换零成本。
 */

import type { MsgSend } from "../shared/protocol.js";
import type { DesignBriefPatch } from "../shared/brief.js";
import type { ToolContext } from "./tools/context.js";
import { createTools } from "./tools/index.js";

export interface Brain {
  handleUserMessage(msg: MsgSend): Promise<void>;
  steer(text: string): Promise<void>;
  interrupt(): Promise<void>;
  dispose(): Promise<void>;
}

export class ScriptedBrain implements Brain {
  private msgCount = 0;
  private lastImageAssetId?: string;
  private pendingRegion = false;
  private readonly tools: ReturnType<typeof createTools>;

  constructor(private readonly ctx: ToolContext) {
    this.tools = createTools(ctx);
  }

  async handleUserMessage(msg: MsgSend): Promise<void> {
    this.msgCount++;
    const text = msg.text.trim();
    const renderTool = this.tools.find((t) => t.name === "generate_rendering")!;
    const videoTool = this.tools.find((t) => t.name === "generate_video")!;

    // 意图：视频（须已有底图）
    if (/视频|动起来|动画|转视频/.test(text)) {
      if (!this.lastImageAssetId) {
        await this.reply("画布上还没有可用的效果图作为首帧，先生成一版效果图吧。");
        return;
      }
      const res = await videoTool.execute(
        "scripted",
        {
          baseFrameAssetId: this.lastImageAssetId,
          motionPreset: "orbit-left" as const,
          durationSec: 10,
        },
        undefined,
        undefined,
        {} as never,
      );
      await this.reply(this.textContent(res));
      return;
    }

    // 意图：出图（关键词命中，或第二轮起信息足够即行动——「先看到东西再调」）
    const wantsImage = /出图|生成|效果图|画|渲染|方案/.test(text);
    if (wantsImage || this.msgCount >= 2) {
      if (this.ctx.getBrief().completeness !== "ready") {
        const patch: DesignBriefPatch = {
          projectType: /办公/.test(text)
            ? "办公楼"
            : /住宅|公寓/.test(text)
              ? "住宅"
              : /文化|美术馆|博物馆/.test(text)
                ? "文化建筑"
                : undefined,
          styleKeywords: /极简|现代/.test(text) ? ["现代极简"] : [],
          lighting: /黄昏|夕/.test(text)
            ? "黄昏"
            : /夜/.test(text)
              ? "夜景"
              : /清晨|晨/.test(text)
                ? "清晨"
                : undefined,
          completeness: "ready",
        };
        this.ctx.applyBriefPatch(patch, "脚本大脑：从用户输入提取关键槽位");
      } else {
        this.ctx.applyBriefPatch({ freeText: text }, "脚本大脑：补充需求");
      }
      const selectionAsset = this.ctx.currentSelection()[0];
      const res = await renderTool.execute(
        "scripted",
        {
          directives: text,
          candidateCount: 2,
          useRegion: this.pendingRegion,
          ...(selectionAsset ? { inheritFromAssetId: selectionAsset.assetId } : {}),
        },
        undefined,
        undefined,
        {} as never,
      );
      const details = (res as { details?: { candidateAssetIds?: string[] } }).details;
      const ids = details?.candidateAssetIds;
      if (ids?.length) this.lastImageAssetId = ids[ids.length - 1]!;
      this.pendingRegion = false;
      await this.reply(
        this.textContent(res) +
          "\n\n（脚本大脑演示：接入 DeepSeek 后，此处替换为带追问方法论与迭代建议的真实对话。）",
      );
      return;
    }

    // 意图：需求补充 → 落档 + 追问一个最关键缺口
    this.ctx.applyBriefPatch({ freeText: text }, "脚本大脑：需求补充");
    const b = this.ctx.getBrief();
    const gap = !b.camera
      ? "希望什么视角？人视入口、鸟瞰还是室内？"
      : !b.lighting
        ? "光照偏好黄昏暖光还是夜景蓝调？"
        : "还有材质或氛围上的偏好吗？";
    await this.reply(`已记录：「${text}」。${gap}`);
  }

  async steer(text: string): Promise<void> {
    this.ctx.applyBriefPatch({ freeText: `（插话）${text}` }, "脚本大脑：steer");
  }

  async interrupt(): Promise<void> {
    /* 脚本大脑瞬时完成，无需中断 */
  }

  async dispose(): Promise<void> {
    /* nothing */
  }

  private textContent(res: { content: { type: string; text?: string }[] }): string {
    return res.content
      .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
      .join("")
      .trim();
  }

  /** 模拟流式输出：切片推送，验证前端打字机链路 */
  private async reply(text: string): Promise<void> {
    const chunkSize = 24;
    for (let i = 0; i < text.length; i += chunkSize) {
      this.ctx.emit({
        type: "conversation.delta",
        sessionId: this.ctx.sessionId,
        delta: text.slice(i, i + chunkSize),
      });
      await new Promise((r) => setTimeout(r, 30));
    }
  }
}
