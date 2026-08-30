/**
 * PiBrain —— pi SDK + DeepSeek 的真实大脑。
 *
 * 以下用法均已在 pi 0.84.3 的类型定义与官方示例（examples/sdk）中核实：
 * - models.json schema：{providers:{<id>:{baseUrl,api,apiKey,models:[{id,name,reasoning,input,contextWindow,maxTokens,cost,compat}]}}}
 *   （node_modules/@earendil-works/pi-coding-agent/docs/models.md）
 * - DeepSeek 思考格式：compat.thinkingFormat:"deepseek"（发送 thinking:{type:enabled|disabled}）
 * - 系统提示词：DefaultResourceLoader({systemPromptOverride, appendSystemPromptOverride}) + reload()
 * - 工具：tools 白名单 + customTools（显式列出自定义工具名，内置编码工具不进白名单即关闭）
 * - 模型：ModelRuntime.create({modelsPath}) + setRuntimeApiKey（不落盘）+ getModel(provider,id)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { MsgSend } from "../shared/protocol.js";
import type { ToolContext } from "./tools/context.js";
import { createTools } from "./tools/index.js";
import { buildSystemPrompt, loadSystemPromptTemplate } from "./systemPrompt.js";
import type { Brain } from "./brain.js";

export const DEEPSEEK_PROVIDER_ID = "tai-deepseek";

export class PiSetupError extends Error {}

export interface PiBrainOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  dataDir: string;
}

export class PiBrain implements Brain {
  private constructor(
    private readonly ctx: ToolContext,
    private readonly session: AgentSession,
  ) {}

  static async create(ctx: ToolContext, opts: PiBrainOptions): Promise<PiBrain> {
    if (!opts.apiKey) throw new PiSetupError("DEEPSEEK_API_KEY 未配置");

    // ── 阶段1：注册自定义 provider（OpenAI 兼容端点 + DeepSeek 思考格式）──
    const modelsPath = await generateModelsJson(opts);
    const modelRuntime = await ModelRuntime.create({ modelsPath });
    modelRuntime.setRuntimeApiKey(DEEPSEEK_PROVIDER_ID, opts.apiKey);
    const model = modelRuntime.getModel(DEEPSEEK_PROVIDER_ID, opts.model);
    if (!model) {
      throw new PiSetupError(
        `模型 ${DEEPSEEK_PROVIDER_ID}/${opts.model} 未注册成功，检查 models.json（${modelsPath}）`,
      );
    }

    // ── 阶段2：资源加载器（建筑领域系统提示词，隔离 agentDir 防止读到本机全局配置）──
    const agentDir = join(opts.dataDir, "agent-dir");
    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir,
      systemPromptOverride: () => buildSystemPrompt(loadSystemPromptTemplate(), ctx.getBrief(), []),
      // 避免默认行为追加 ~/.pi 或 <cwd>/.pi 下的 APPEND_SYSTEM.md
      appendSystemPromptOverride: () => [],
    });
    await loader.reload();

    // ── 阶段3：创建会话（显式工具白名单：只有我们的领域工具）──
    const toolNames = ["update_design_brief", "generate_rendering", "generate_video", "analyze_reference", "create_presentation"];
    const { session } = await createAgentSession({
      model,
      thinkingLevel: "medium",
      modelRuntime,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
      customTools: createTools(ctx),
      tools: toolNames,
    });

    // ── 阶段4：事件流 → ws 协议映射 ──
    session.subscribe((event) => PiBrain.onPiEvent(ctx, event));

    return new PiBrain(ctx, session);
  }

  private static onPiEvent(ctx: ToolContext, event: unknown): void {
    // 防御式收窄：pi 事件结构以运行时为准（text_delta / tool_execution_* 为核心透传面）
    const ev = event as {
      type?: string;
      assistantMessageEvent?: { type?: string; delta?: string };
      toolCallId?: string;
      toolName?: string;
      isError?: boolean;
      errorMessage?: string;
    };
    if (process.env.PI_DEBUG) {
      console.log(
        `[pievent] ${ev.type}${ev.toolName ? `(${ev.toolName})` : ""}${ev.assistantMessageEvent?.type ? `/${ev.assistantMessageEvent.type}` : ""}${ev.isError ? ` ⚠ERROR: ${ev.errorMessage}` : ""}`,
      );
    }
    if (ev.type === "message_update") {
      const inner = ev.assistantMessageEvent;
      if (inner?.type === "text_delta" && typeof inner.delta === "string") {
        ctx.emit({ type: "conversation.delta", sessionId: ctx.sessionId, delta: inner.delta });
      }
      return;
    }
    if (ev.type === "tool_execution_start") {
      ctx.emit({
        type: "tool.status",
        sessionId: ctx.sessionId,
        callId: String(ev.toolCallId ?? "pi"),
        name: String(ev.toolName ?? "unknown"),
        state: "running",
      });
      return;
    }
    if (ev.type === "tool_execution_end") {
      ctx.emit({
        type: "tool.status",
        sessionId: ctx.sessionId,
        callId: String(ev.toolCallId ?? "pi"),
        name: String(ev.toolName ?? "unknown"),
        state: ev.isError ? "error" : "done",
      });
      return;
    }
    // agent_start/agent_end/turn_* 等暂不透出
  }

  async handleUserMessage(msg: MsgSend): Promise<void> {
    // ImageContent 真实形状（pi 0.84.3 类型）：{ type:"image", data:<base64>, mimeType }
    const images =
      msg.attachments?.map((a) => ({
        type: "image" as const,
        data: a.data,
        mimeType: a.mediaType,
      })) ?? [];

    // 选区以 [选区] 标记内联进消息文本（system prompt §13 约定）
    const selectionNote = msg.selectionRefs?.length
      ? `\n[选区] ${msg.selectionRefs
          .map(
            (s) =>
              s.assetId +
              (s.regionRect
                ? `（局部区域 x:${s.regionRect.x},y:${s.regionRect.y},w:${s.regionRect.w},h:${s.regionRect.h}）`
                : ""),
          )
          .join("、")}`
      : "";

    // streamingBehavior:"followUp" —— 上一轮仍在处理时新消息排队等待投递（而非抛错）。
    // 打断语义由 message.steer → session.steer 承担（DESIGN.md §5.2）
    await this.session.prompt(msg.text + selectionNote, {
      ...(images.length ? { images } : {}),
      streamingBehavior: "followUp",
    });
  }

  async steer(text: string): Promise<void> {
    this.session.steer(text);
  }

  async interrupt(): Promise<void> {
    await this.session.abort();
  }

  async dispose(): Promise<void> {
    this.session.dispose();
  }
}

/** 生成 pi models.json（OpenAI 兼容端点；cost 单位为 $/百万token，按 CNY 定价牌价折算近似值） */
async function generateModelsJson(opts: PiBrainOptions): Promise<string> {
  await mkdir(opts.dataDir, { recursive: true });
  const modelsJson = {
    providers: {
      [DEEPSEEK_PROVIDER_ID]: {
        name: "TAI DeepSeek",
        baseUrl: opts.baseUrl,
        api: "openai-completions",
        apiKey: "", // 运行时通过 setRuntimeApiKey 注入，不落盘
        models: [
          {
            id: opts.model,
            name: "DeepSeek V4 Flash Vision (Exp)",
            reasoning: true, // v4 系列默认开启思考
            input: ["text", "image"],
            // 定价（¥/百万）：输入未命中1.5 / 输出4.5（空闲时段），折算为 $ 近似
            cost: { input: 0.21, output: 0.63, cacheRead: 0.007, cacheWrite: 0.21 },
            contextWindow: 1_000_000,
            maxTokens: 32_768,
            compat: {
              thinkingFormat: "deepseek", // thinking:{type:enabled|disabled} + reasoning_effort
            },
          },
        ],
      },
    },
  };
  const p = join(opts.dataDir, "models.json");
  await writeFile(p, JSON.stringify(modelsJson, null, 2), "utf-8");
  return p;
}
