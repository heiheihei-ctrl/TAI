/**
 * W1-① 前置：DeepSeek API 直连验证（绕过 pi，先确认 key/模型/流式/tool calling 基础面）。
 * 用后即删或保留作诊断工具。
 */

import "../src/config.js"; // 触发 .env 加载（副作用导入，必须在读取 env 前）

const BASE = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const KEY = process.env.DEEPSEEK_API_KEY ?? "";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash-vision-exp";


async function main(): Promise<void> {
  if (!KEY) throw new Error("DEEPSEEK_API_KEY 未配置");

  // ① 模型列表
  const listRes = await fetch(`${BASE}/models`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  console.log("① GET /models →", listRes.status);
  if (listRes.ok) {
    const body = (await listRes.json()) as { data?: { id: string }[] };
    console.log("  可用模型:", body.data?.map((m) => m.id).join(", "));
  } else {
    console.log("  响应:", await listRes.text());
  }

  // ② 非流式对话 + tool calling（定义我们的 update_design_brief 简版）
  const chatRes = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "你是建筑设计助手。用户确认需求后必须调用 update_design_brief 落档。",
        },
        { role: "user", content: "帮我记一下：滨江的办公楼，现代极简风格，黄昏光照" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "update_design_brief",
            description: "更新设计需求档案",
            parameters: {
              type: "object",
              properties: {
                projectType: { type: "string" },
                styleKeywords: { type: "array", items: { type: "string" } },
                lighting: { type: "string" },
                reason: { type: "string" },
              },
              required: ["reason"],
            },
          },
        },
      ],
    }),
  });
  console.log("\n② POST /chat/completions（带工具）→", chatRes.status);
  const chatBody = (await chatRes.json()) as {
    model?: string;
    choices?: { message?: { content?: string; tool_calls?: { function?: { name: string; arguments: string } }[] } }[];
    usage?: Record<string, number>;
    error?: unknown;
  };
  if (!chatRes.ok) {
    console.log("  错误:", JSON.stringify(chatBody, null, 2));
    process.exit(1);
  }
  const msg = chatBody.choices?.[0]?.message;
  console.log("  模型:", chatBody.model);
  console.log("  文本:", msg?.content ?? "(空)");
  if (msg?.tool_calls?.length) {
    for (const tc of msg.tool_calls) {
      console.log(`  🔧 工具调用: ${tc.function?.name}(${tc.function?.arguments})`);
    }
  } else {
    console.log("  ⚠ 未触发工具调用");
  }
  console.log("  tokens:", JSON.stringify(chatBody.usage));

  // ③ 流式
  const streamRes = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: "用一句话介绍黄昏光照对建筑效果图的意义" }],
      stream: true,
    }),
  });
  console.log("\n③ 流式 →", streamRes.status);
  if (!streamRes.ok || !streamRes.body) {
    console.log("  错误:", await streamRes.text());
    process.exit(1);
  }
  let chunks = 0;
  let text = "";
  const reader = streamRes.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const d = j.choices?.[0]?.delta?.content;
        if (d) {
          chunks++;
          text += d;
        }
      } catch {
        /* 跳过无法解析的行 */
      }
    }
  }
  console.log(`  收到 ${chunks} 个增量，拼合: ${text.slice(0, 80)}…`);
  console.log("\nDIRECT PASS ✅");
}

main().catch((err) => {
  console.error("DIRECT FAIL ❌", err);
  process.exit(1);
});
