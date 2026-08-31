# 天宫TAI · 建筑设计 AI Agent 详细设计（v0.2 规划稿）

> 主模型与生成 API 形态已定（2026-08-27），见 §11「已决选型」。

> 状态：阶段一（W1–2）与 W3–4 均已完成（2026-08-29）。**当前阻塞是 TAI 后端环境（需 `DATABASE_URL`），
> 不是 x-api-key**——后者只影响免扣费联调，详见下方修正章节。
> 平台：天宫TAI（tgtai.com），无限画布 + 节点工作流范式，React 技术栈。
> Agent 编排：pi SDK（earendil-works/pi），后端 Node.js 同进程嵌入。
> 目标用户：建筑方案设计师（效果图生成与迭代）+ 设计咨询建议。

---

## ⚠️ 源码核实修正（2026-08-29）

本文档部分结论来自《TAI 用户手册》与模板 JSON 抽样，**未经源码验证**。逐项核对 TAI 源码后，
以下 4 条与实现不符，**以本节为准**：

| # | 原结论 | 源码事实 | 影响 |
|---|---|---|---|
| 1 | §6.3 经前端 command/undo 封装层执行 | TAI 是**快照式 history**（`frontend/src/services/historyService.ts`），API 为 `commit(label)` / `undo()` / `redo()`，并无 command 抽象 | **简化**：agent 写操作只需「改 store → `commit('agent:place')`」，天然可撤销 |
| 2 | §12.2 Seedream 5.0 是「局部重绘首选」 | `seedream5.provider.ts:91` 的 `editImage()` **直接 throw**；`maskUrl` 无任何 provider 消费 | 局部重绘**必须**用 banana 系 + `edit-image-async` |
| 3 | §12.3 画布内核为 React Flow | **TAI 平台前端**使用 React Flow（`frontend/package.json` 有 `reactflow ^11.11.4`）；原型前端自研 div+SVG，未使用 React Flow | §12 描述的是平台 |
| 4 | §12.4 框选区域作为 region 传入模型 | TAI 的局部重绘是「传原图整张 → 模型整图重绘 → 前端按 `cropRectNormalized` 合成回去」（`aiChatStore.ts:718` / `:770`），**区域不进后端** | 归一化坐标只用于前端合成与 prompt 描述 |

另：**§9 数据模型暂不实现**——终态接入 TAI 平台，平台已有会话与资产持久化，
自建等于在废弃前重复建设。整体接入方案见 [docs/TAI-INTEGRATION-PLAN.md](docs/TAI-INTEGRATION-PLAN.md)。

---

## 1. 产品定位与能力边界

**一句话定位**：以画布旁对话框为主入口的"AI 设计合伙人"——看得见画布、会追问需求、能直接在画布上产出渲染图和视频、回答专业问题。

**v1 能力范围**
- 多轮需求澄清与设计需求档案（Design Brief）维护
- 渲染效果图：文生图 / 图生图 / 参考图约束 / 局部重绘（视 TAI 模型支持度）
- 效果图转视频（首帧确认 → 异步生成）
- 设计咨询建议（风格、材质、流线、案例参考；不含合规审查）
- 汇报演示文稿编排（PPT 自动生成，含封面/目录/方案页/效果图页/尾页）

**明确不做（边界声明进系统提示词与产品文案）**
- 不替代结构与消防等合规审查；涉及安全性问题给出免责提示
- 不做施工图阶段深化（后续再说）

---

## 2. 总体架构

```
┌─ React 前端 ──────────────────────────────────────┐
│  对话面板(主入口)     无限画布     节点工作流编辑器    │
│      │                  ▲             ▲           │
│      └── WebSocket 双向通道 ──┴─────────────┘      │
│          （agent事件流 ↓ / 画布指令+用户消息 ↑）      │
└───────────────┬──────────────────────────────────┘
                │ ws://  (自定义JSON协议，见§5)
┌───────────────▼──────────────────────────────────┐
│  Node 后端                                          │
│  ├─ Gateway：鉴权、会话路由、配额检查                 │
│  ├─ Agent Runtime（pi SDK）                         │
│  │    · 每个活跃用户会话一个 AgentSession             │
│  │    · noTools 关闭内置编码工具                      │
│  │    · customTools：generate_rendering /            │
│  │      generate_video / update_design_brief /       │
│  │      analyze_reference                            │
│  │    · session.subscribe() 事件 → ws 转发           │
│  ├─ 任务队列：生图/生视频异步任务、重试、超时           │
│  └─ 资产服务：OSS 存储、资产血缘(版本树)、元数据        │
└───────────────┬──────────────────────────────────┘
                ▼
         TAI 生图 / 生视频大模型 API
```

**分工原则**
- pi 管"大脑"：对话循环、工具决策、会话树、长会话压缩（compaction）白拿
- 自研四件事：①前后端实时协议与UI ②任务队列与资产管道 ③画布操作执行器 ④领域知识库（prompt 模板/词库/RAG）
- pi 无权限体系：多租户隔离、配额全在后端 Gateway 做
- **计费原则**：生成任务（生图/视频）的费用走 TAI 统一积分体系，与用户直接在画布节点生成的费用合并记账。实际链路（已实现）：TAI 后端 BFF 在转发 `POST /chat` 时**透传用户 `Authorization`（JWT）与 `X-Team-Id`** → tgagent 为该会话注入**会话级 jwt 任务源**，后续所有生图/视频回调只带 Bearer、绝不带 `x-api-key`（否则守卫优先判 apiKey → 静默免单），401/403 分别映射为 `auth_expired`/`insufficient_credits`。详见 [docs/TAI-INTEGRATION-PLAN.md](docs/TAI-INTEGRATION-PLAN.md) §7。DeepSeek（对话大脑）的费用当前为测试期，生产计费路径另行评估。

---

## 3. 会话与上下文设计

### 3.1 双上下文模型
Agent 的推理输入 = **对话历史（pi 维护）** + **画布上下文（前端上报）**。

- 用户发消息的信封携带轻量画布引用：
  `{ text, attachments[], selectionRefs: [{assetId, thumbUrl}], viewportHint }`
- 服务端维护 assetId → 元数据/原图URL 的解析缓存；客户端只报 ID 不报大图。
- 选区变化走节流上报（`selection.changed`），保证下一条消息组 prompt 时可引用最新选区。

### 3.2 设计需求档案（Design Brief）
结构化槽位，是需求澄清的核心机制：

```
DesignBrief {
  projectType    // 住宅/办公/文化/商业…
  styleKeywords[]
  massing        // 体量、层数、密度描述
  materials[]    // 幕墙/陶板/清水混凝土…
  context        // 环境：滨海/山地/街区肌理…
  camera         // 人视/鸟瞰/轴测/室内视角…
  lighting       // 黄昏/清晨/夜景/阴天柔光…
  mood           // 极简/未来感/在地温度…
  negative[]     // 排除项："不要玻璃幕墙"
  freeText       // 其余自然语言补充
  completeness   // agent自评：ready / needMoreInfo
}
```

规则：completeness=needMoreInfo 时 agent 必须先追问最多 2 个最关键的空槽，不强行出图；brief 由 `update_design_brief` 工具增量合并，前端同步渲染成**属性面板**，设计师可直接手改——这是纠偏 agent 误理解的兜底。

### 3.3 会话树 ↔ 方案分支
- 一个"设计项目" = 一棵持久化的 pi 会话树（SessionManager.create(cwd)，落盘目录按 projectId 组织）。
- 从某轮对话 `branch()` = 开一个新方案方向（例如"立面方案B再推两版"）；对话分支与画布上的资产血缘共用同一棵语义树，产品上呈现为"方案历史/分支"视图。
- 用户级概念分层：用户 → 项目 → 会话树 → 资产版本。

### 3.4 图片上下文的成本控制
生成结果默认只回传 URL/缩略图给 LLM；仅两种场景回传压缩图（≤1024px）：用户要求"自查这版效果"、以及局部重绘需要理解原区域构图时。

---

## 4. 工具集设计（v1，schema 用伪代码表达）

> 所有工具用 pi `defineTool()` 注册；参数用 typebox 描述并写入 description（模型据此决定何时调用）。工具 execute 中埋配额扣减与审计日志。

### 4.1 update_design_brief —— 需求建档（高频，引导 agent 使用）
```
params: { patch: Partial<DesignBrief>, reason: string }
行为：与服务端现有 brief 深合并；返回合并后的完整 brief
```
merge 语义解决"模型重复输入已确认信息"；`reason` 字段让模型显式陈述为什么改，便于审计与前端 toast。

### 4.2 图片理解策略 —— 依托主模型原生视觉能力（不设独立 VLM 工具）
主模型 DeepSeek-V4-Flash-Vision-Exp 自带视觉输入（pi 经 `PromptOptions.images` 以 base64 直接注入会话），因此 v1 **不做独立的 analyze_reference 工具**，LLM 可见工具面收敛为 3 个：

- 用户上传草图/SU截图/基地照片随消息原生入上下文，agent 直接看、直接聊；
- 单条消息图片上限 3 张、压缩至 ≤1024px（成本控制见 §3.4）；
- 批量/多图结构化提取（如一次丢 5 张竞品案例归纳特征表）再考虑加内部辅助分析调用，v2 评估。

好处：省一次工具往返延迟、避免独立 VLM 服务与鉴权成本；代价：多轮后图片 token 留存于上下文，靠 compaction 治理，若实测成本超预期再回退为"tool 内一次性分析"模式（接口预留好切换路径）。

### 4.3 generate_rendering —— 出效果图（阻塞式工具）
```
params: {
  briefBased: boolean            // true 则以当前brief合成prompt
  directives?: string            // 本次增量的自由描述
  referenceAssetIds?: string[]   // 图生图参考（≤N张）
  inheritFromAssetId?: string    // 版本迭代来源
  useRegion?: string     // 局部重绘遮罩。v1 复用平台既有 Shift+框选手势（矩形区），
                                 // 前端将 regionRect 转为遮罩资产；画笔精修后置
  aspectRatio?: "1:1"|"3:4"|"4:3"|"2:3"|"3:2"|"4:5"|"5:4"|"9:16"|"16:9"|"21:9"  // 平台已支持
  imageSize?: "1K"|"2K"|"4K"     // Generate Pro 档支持
  candidateCount?: number        // 默认2，上限4
}
行为内部流水线（对模型透明）：
  prompt组装(模板库§7) → 配额校验 → 提交任务队列 → 等待轮询
  → 资产入库+血缘登记(parentId/operation) → 触发canvas.place事件 →
  返回 { candidates:[{assetId,url,thumbUrl,params}] }
```
阻塞上限设 90s/张；超时降级为返回 taskId 让模型告知用户"已提交后台"。四种长耗时处理取一条路径，代码简单、对话连贯。

### 4.4 generate_video —— 图转视频（两段式，唯一异步工具）
```
前置约定：视频必须基于一张已确认的效果图（首帧），不允许凭空生成
params: {
  baseFrameAssetId,                          // 必填：首帧
  lastFrameAssetId?,                         // 选填：尾帧（TAI支持首尾帧插值）；
                                             // 用于"方案A推到方案B"的过渡展示
  motionPreset("orbit左环绕"|"推进"|"固定机位延时"|...),  // 与尾帧互斥使用
  durationSec
}
行为：校验baseFrame存在且属于本会话资产 → 立即返回 { jobId, estSeconds }
完成后经 asset/video_completed 事件推送，工具结果里已告知模型"完成后通知用户"
```
即发即忘的理由：视频分钟级耗时，阻塞会拖死会话循环；前端"我的生成中"卡片列表承接体验。

### 4.5 create_presentation —— 汇报 PPT 编排（两段式异步工具）
```
params: {
  title: string                    // 汇报标题
  outline?: string[]               // 自定大纲；留空则按模板自动编排
  assetIds?: string[]              // 要插入效果图的资产 ID（按页面顺序）
  style?: "简洁白" | "深色专业" | "建筑工作室"  // 默认"简洁白"
  pageCount?: number               // 期望页数，默认按大纲自动
}
行为：校验 title 非空 → 若未传 outline 则基于当前 brief 自动生成 → 模板引擎拼装封面/目录/方案页/效果图页/尾页 → 立即返回 { presentationId, status:"generating" } → 后台落盘完成后推送 presentation.ready 事件 `{presentationId, url, totalPages}`
```

触发时机：用户明确要求"生成汇报 PPT/方案文本/汇报材料"时调用；brief 较完整且用户转向"汇报/评审/方案交底"时，agent 可主动建议生成。

### 4.6 画布交付不做成 LLM 工具
生成的落图动作（位置、连线到父节点、多候选横排布局）在 generate_rendering 的工具实现内完成，以 `canvas.place` 指令下发前端执行器——不让模型输出自由格式的画布命令，规避非法坐标/破坏布局的风险。个别重排版需求 v2 再加 `arrange_assets` 白名单工具。

---

## 5. 前后端实时协议（WebSocket JSON，预留接口的对接契约）

### 5.1 server → client
| type | 说明 |
|---|---|
| `conversation.delta` | 文本流式增量（映射 pi `message_update/text_delta`） |
| `tool.status` | `{callId,name,state:running\|done\|error,progress{stage,percent}}`（映射 pi `tool_execution_*`） |
| `canvas.place` | 画布写指令：`{cards:[{assetId,url,pos,parentIds,style:"candidate"}]}`，前端执行器落画布并入撤销栈 |
| `canvas.update` | 属性更新指令（如替换某卡片图片、标注淘汰态） |
| `asset.video_completed` | 异步视频就绪 `{jobId,assetId,url}` |
| `brief.updated` | 全量 brief（前端刷属性面板） |
| `presentation.ready` | PPT 就绪 `{presentationId, url, totalPages}` |
| `error` | 错误码 + 用户可读文案 |

### 5.2 client → server
| type | 说明 |
|---|---|
| `message.send` | 主入口：`{projectId,text,attachments[],selectionRefs[],clientId}` |
| `message.steer` | 生成中途插话（映射 pi `steer()`，如"等等，改成黄昏"） |
| `message.interrupt` | 终止当前轮（pi `abort()`） |
| `selection.changed` | 选区节流上报 `{selectionIds[]}` |
| `task.cancel` | 取消进行中的生成任务 |
| `session.fork` / `session.switch` | 分支/切换方案方向（透传到 pi 会话树操作） |

### 5.3 可靠性
- 每条下行消息带单调 `seq`；断线重连带 `lastSeq`，网关从环形缓冲补发。
- 页面刷新恢复：`message.resync` 全量拉会话消息 + 运行中任务快照。
- 幂等：`message.send` 带 clientId，网关去重。

---

## 6. 画布集成细节

1. **落位策略**：锚点 = 当前选区的包围盒右侧偏移；无选区则视口中心。多候选拍平横排，间距固定网格步长。
2. **血缘可视化**：asset 记录 `{parentId, operation(inpaint|img2img|newVariant|video)}`，画布上父子间自动连细虚线；为将来"方案分支树"视图打底。
3. **撤销一致性**：所有 `canvas.*` 指令经平台撤销栈执行。
   - ✅ 已核实（2026-08-29）：平台是**快照式 history** 而非 command 封装层，注入点为 `historyService.commit(label)`。原「确认 command 注入方式」这一前提不成立，实现比预期简单。见顶部修正表 #1。
4. **节点工作流衔接（v2）**：复杂管线（参考图提取→重绘→放大→视频）沉淀为"工作流模板 DSL"，由 agent 在画布上实例化为可手改的节点子图。v1 只做 A 模式直用工具，但数据模型中的 brief/血缘/模板字段现在就留好。

---

## 7. Prompt 工程与领域知识库

### 7.1 系统提示词骨架（分层，利于缓存命中）
```
[固定层] 身份定义 / 能力边界与免责 / 工具调用纪律(brief先行、禁编造资产id、一次只调一个生成类工具)
[半固定层] 需求澄清方法论(追问优先级、slot顺序) / 输出风格规范
[动态层] 当前项目brief摘要(压缩后注入) / 选区资产摘要
```

### 7.2 渲染 Prompt 模板库（数据文件，非硬编码）
- 结构：`建筑类型 × 视角 × 时段光照 × 风格 × 材质 emphasis` 参数化拼装；
- 附带正/负向词库（photorealistic architectural visualization / eye-level… 对应负向 blur, distorted geometry…）；
- 维护为版本化 JSON/YAML，随效果反馈迭代词库——这是长期护城河之一，也适合未来打包成 pi skill。

### 7.3 咨询建议的知识底座（分期）
- v1：依赖对话模型通识 + 免责声明；
- v2：RAG 接入常用规范条文（通用性条款）、经典案例图文库；检索结果强制附出处。

### 7.4 PPT 模板库（数据文件，非硬编码）
- 结构：`汇报场景 × 风格` 参数化拼装（brief 字段自动注入占位）；
- 三种出厂风格：简洁白 / 深色专业 / 建筑工作室；
- 每个模板定义：封面布局、目录样式、单页版式、图片占位比例、尾页样式；
- 维护为版本化 JSON，存 `src/agent/templates/ppt/`；
- 与渲染 prompt 模板库同源，共用 brief 结构化数据作为输入。

---

## 8. 安全、成本与运维要点

- **鉴权与配额**：Gateway 层按用户/团队计生成次数与分辨率档位；工具 execute 前 hook 校验。生成任务调用 TAI 后端时透传用户 JWT，走 TAI 统一积分扣减（参见 §2 计费原则）。
- **内容审核**：用户上传图与生成结果过一遍审核接口（对外 SaaS 必需）。
- **DeepSeek 费用**：当前为测试期接入，生产计费路径另行评估。建议后续迁移至阿里云百炼或 DeepSeek 企业版以获得稳定 SLA 与成本管控。
- **部署形态**：架构天然分离——内部试用单机即可（Node 单进程 + 本地任务队列）；SaaS 化时任务队列换 Redis/BullMQ、会话存储外置，pi 接口不变。
- **上下文治理**：信任 pi 的自动 compaction；在 brief 已结构化的前提下压缩效果好（结构化数据不易丢）。
- **可观测**：pi-telemetry 或自接 OTel；每次工具调用记录 prompt 版本号、模板指纹，用于复盘生成质量。

---

## 9. 最小数据模型

> ⚠️ **决策（2026-08-29）：暂不实现。**
> 终态是接入 TAI 平台，而平台已有完整的 user / project / 会话 / 资产持久化。
> 本仓库自建持久化，等于在废弃前重复建设——接入后要么废弃，要么维护两套。
> 当前为内存态（`AssetStore`、SessionRecord Map），进程重启即失忆，这在联调期可接受。
> 若未来 tgagent 需脱离平台独立部署，再回头实现本节。

```
user(id, orgId, quota…)
project(id, ownerId, name)
agent_session(id, projectId, piSessionPath, treeRootMsgId)
message(seq, sessionId, role, content, attachmentIds, seqNo)
asset(id, projectId, kind(image|video|mask|presentation), url, meta, parentId, operation, createdByJob)
gen_job(id, projectId, userId, kind, params, status, costUnits, resultAssetIds)
design_brief(projectId PK, json, updatedAt)
presentation(id, projectId, title, url, totalPages, assetIds[], style, createdAt)
```

---

## 10. 实施路线图

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **W1–2 技术验证** ✅（2026-08-28） | ① pi 接入 DeepSeek（OpenAI 兼容端点走 models.json 自定义 provider），验证流式/tool calling/vision 图像注入三项【仅测试用，生产计费路径另行评估】② TAI 异步任务封装层：提交+轮询+超时降级+取消【依赖⑤，可先用 mock 任务源开发】③ ws 协议 demo：文本流式+假图回贴画布（React Flow 已证实，对接成本下调） | ✅ 三条链路各自端到端可用：① pi-verify 三场景 9 轮回归 + verify:vision 带图对话 4/4 视觉事实命中；② test:tai 契约测试通过（真图联调待 x-api-key）；③ smoke 冒烟通过 |
| **W3–6 MVP（A模式）** | brief 工具+生图工具+canvas.place+多候选择优+版本迭代链+选区感知+前端 Brief 编辑+视频按钮+卡片右键菜单+PPT 编排工具（create_presentation） | brief 面板可手改、视频一键触发、多候选择优、汇报 PPT 一键生成全链路可用 |
| **W7–8 视频线** | 首帧确认交互、generate_video 异步任务、进度卡、motionPreset 库 | 效果图→20s 环绕视频成功率与时长达标 |
| **W9–12 建议线+打磨** | 咨询问答（含免责）、analyze_reference 上线、模板词库第二轮调优、undo/重连健壮性 | 咨询类对话占比与满意度指标建立基线 |
| **v2 预研** | 节点工作流编排（B/C 模式）、规范 RAG、方案分支树 UI | 工作流模板 DSL 草案评审通过 |

---

## 11. 选型与待决事项

### 已决选型

#### 对话主模型：DeepSeek-V4-Flash-Vision-Exp（2026-08-27）
- 接入方式：OpenAI 兼容端点 + pi `models.json` 自定义 provider（风险低，DeepSeek API 兼容性好）；
- 视觉能力的架构影响：agent 直接读图，砍掉独立 VLM 工具（见 §4.2）；
- ⚠️ **exp 实验版稳定性风险**：上线前须配置备份模型（同族非vision版或GLM等），利用 pi `setModel()` 支持会话级降级切换；网关侧做错误率监控，连续失败自动切备份并提示用户；
- flash 档定位与场景匹配：高频短轮询对话为主，重推理场景（复杂brief推断）允许 setThinkingLevel 提高。

#### TAI 生成 API：异步任务制（2026-08-27）
- 生图工具实现为"提交任务 → 内部轮询等待 → 结果入库"，90s 超时降级为后台任务推送（§4.3 已按此设计，无需改动架构）；
- 图生图 ✅（referenceAssetIds / inheritFrom）、局部重绘 ✅（useRegion，**新增前端遮罩涂抹交互项**）、首尾帧 ✅（generate_video 增加 lastFrameAssetId）。

#### 计费链路：用户 JWT 透传（2026-08-29 补录）
- 原先设计走 `x-api-key` 免密通道，但源码核实确认该守卫 (`ApiKeyOrJwtGuard`) 命中 apiKey 后 `getUserId()` 返回 `null` → **不扣用户积分**；
- **已决**：生产计费走 JWT 模式——BFF 在转发 `POST /chat` 时透传用户 `Authorization`（Bearer JWT）与 `X-Team-Id` → tgagent 为该会话注入**会话级 jwt 任务源** → 后续所有生图/视频回调只带 Bearer、绝不带 `x-api-key`（否则守卫优先判 apiKey → 静默免单）。
- x-api-key 模式保留，仅用于 tgagent 自身的健康检查或非生成类元数据接口。

#### 并发门控：模块级共享信号量（2026-08-29 补录）
- 原先信号量为 `TaiTaskSource` 实例方法（`this._active`），多会话场景下等于每会话 2 上限，形同虚设；
- **已决**：信号量提升为模块级函数（`acquireGateSlot` / `releaseGateSlot` / `gated`），所有 `TaiTaskSource` 实例（含会话级 jwt 源）共享同一把锁；cost = `min(req.count, MAX)` 约束实际提交数。

#### 多候选结果处理：partialFailures（2026-08-29 补录）
- N 个候选 = N 次预扣积分；个别失败而整批抛错等于白白丢图；
- **已决**：`generateImages` 返回值从 `GeneratedImage[]` 改为 `ImageGenOutcome`（含 `partialFailures[]`），仅当全部失败时才抛错，部分成功正常交付。

#### 错误码语义链路（2026-08-29 补录）
- 原先鉴权/计费错误码（`auth_expired` / `insufficient_credits`）造出后无人消费，前端拿不到可响应的信号；
- **已决**：`mapTaskSourceErrorToProtocol` + `ErrorCode` 枚举 → 401 映射 `auth_expired`（前端刷新 token 后重试），403 映射 `quota_exceeded`（前端提示充值）。

#### 视频完成事件跨轮次补发（2026-08-29 补录）
- BFF 轮次结束后 SSE 关闭，视频轮询仍在后台运行，完成事件无人接收；
- **已决（协议约定）**：下行消息带单调 `seq` + 环形缓冲；客户端 `message.send` 携带 `lastSeq` → 网关 `resync` 补发遗漏事件；前端断开重连后自动恢复。

#### 前端模式切换协议（2026-08-29 补录）
- **已决**：新增 `mode.toggle` 上行消息 + `mode.changed` 下行广播；`SessionRecord` 维护 `mode`（`chat` | `design`），切换时 emit 通知所有订阅者。

#### 已关闭项

硬阻塞已转移到 **P1 联调环境**（`DATABASE_URL` 等，见 [TAI-INTEGRATION-PLAN §10 风险1](docs/TAI-INTEGRATION-PLAN.md)）。
另：2026-08-29 代码审查（[docs/CODE-REVIEW-2026-08-29.md](docs/CODE-REVIEW-2026-08-29.md)）发现的
P0 生产加固项（会话键/入口防护/错误码消费）不属于"待决"，但接真实计费用户前必须逐项关闭。

| # | 事项 | 影响 | 状态 |
|---|---|---|---|
| ③ | 前端画布的程序化操作接口与 undo 栈注入点 | 决定 `canvas.place` 执行器写法 | ✅ 已解决：平台是**快照式 history**（`historyService.ts`），API 为 `commit(label)` / `undo()` / `redo()`，无 command 抽象。`canvas.place` 执行器只需「改 store → commit」，agent 写操作天然可撤销 |
| ④ | 遮罩涂抹交互的实现归属 | 局部重绘功能的可用性前提 | ✅ 基本解决：平台已有 Shift+框选手势，v1 直接复用矩形选区；画笔精修后置 |
| ⑤ | TAI 后端接口契约与鉴权机制 | 生图/视频调用基础 | ✅ 已收口：源码级确认，`TaiTaskSource` 已实现并通过假后端契约测试 |
| ⑥ | DeepSeek-V4-Flash-Vision-Exp 的 API Key 与接入端点 | W1-① pi 连通验证 | ✅ 已解决：key 已配置，端到端三场景验证通过 |

### 剩余待决

**硬阻塞（2026-08-30 修正）**：TAI 后端环境未起——缺 `backend/.env`、数据库未接、
50 个 migration 未执行。原记录为「需 `DATABASE_URL`，不可达」，现确认**本地建 PostgreSQL
即可绕过**，不必阻塞等待；可执行步骤见 [docs/P1-ENV-SETUP.md](docs/P1-ENV-SETUP.md)。

代码侧所有已决项（含 2026-08-29 审查的 3 项 P0 + 4 项 P1 + 若干 P2）均已完成并提交，
含回归测试；实测 `tsc` 0 错、`npm test` 9/9、`smoke` 5/5。

| # | 事项 | 影响 | 状态与下一步 |
|---|---|---|---|
| ⑦ | `canvas.place` React Flow 执行器 | 后端 `emit({ type: "canvas.place" })` 已通 | ⛔ **作废（2026-08-30）**。原「装 `@xyflow/react` 替换卡片」写于"做独立应用"的定位下，与终态冲突。TAI 前端本身已是 React Flow 11（`frontend/package.json` 有 `reactflow ^11.11.4`）。落位算法可复用，节点结构按平台现有节点重写即可，无需再引入 xyflow |
| ⑧ | DesignBrief 属性面板 | 原型前端已验证 Brief 面板交互（字段编辑 + `brief.patch` 回写） | ✅ 概念已验证（2026-08-30 核实）。P4 阶段在 TAI 前端重做，而非从零实现 |
| ⑨ | PPT/汇报模板引擎（create_presentation） | 工具定义在 §4.5，后端实现待做 | v2 阶段，先出 DSL 原型 |
| ⑩ | 方案分支树 UI | 会话树分支/切换的前端 | v2 阶段，后端 `session.fork/switch` 已路由（报错占位） |

> ⚠️ **P3 提醒**：`aiChatStore.ts` 的 `manualToolMap` 在 **`:7249` 与 `:7680` 两处**重复定义
> （[TAI-INTEGRATION-PLAN §4](docs/TAI-INTEGRATION-PLAN.md) 原先只记了 7249）。
> 加 `architecture` 模式时两处都要改，漏一处会出现「某入口下模式不生效」。

---

## 12. 平台事实基准（来源：《TAI 用户手册》08-03 版 + 模板 JSON 抽样，2026-08-27）

> 本节是后续所有设计的**环境假设来源**，与手册冲突时以手册为准。

**12.1 Agent 的产品定位（重要修正）**
平台底部 AI 对话框**已是功能完整的 AI 助手**：模式有 Auto/Text/Generate/Edit/Blend/Analysis/Video/Vector；全局档位 Fast/Pro/Ultra 分别映射 Gemini 2.5-Flash / Gemini-3-Pro-Preview / Gemini-3.1 系（图像即 Nano Banana 系）。高级档已支持比例控制、分辨率（默认1K）、思考级别、联网开关、自动扩写、文件分析。
⇒ **本项目的 agent 是这个对话框的"建筑专业版升级"**：以 DeepSeek-V4-Flash-Vision-Exp 为大脑，叠加需求档案、追问方法论、建筑词库与多工具编排，而非从零新建入口。需与前端确认切换/共存策略（如新增"设计师模式"档位）。

**12.2 生成模型矩阵（工具→模型路由依据）**
- 生图：Generate Node（Nano Banana 系，比例 `1:1~21:9`、`1K` 起）、Generate Pro（多段prompt叠加+比例+分辨率）、Midjourney v7（写实主力）、NiJi7（二次元，本场景不用）、**Seedream 5.0（局部重绘/精准编辑/文字渲染→inpainting 首选）**
  - ⚠️ **已证伪（2026-08-29 核对源码）**：`seedream5.provider.ts:91` 的 `editImage()` 直接 `throw new Error('Seedream5 does not support image editing')`，seedream5Pro 同样；`maskUrl` 在整个后端**无任何 provider 消费**；且 provider 只透传 `prompt/size/image_urls/batchMode/batchCount`，**`aspectRatio` 被丢弃**。局部重绘与保比例均须走 **banana 系**。见顶部修正表 #2。
- 生视频：Kling 2.6/O3、Vidu / Vidu Q3（16s·1080p·专业运镜）、Seedance 1.5 Pro、Wan 2.6(+R2V)、Sora2（10s/15s，9:16|16:9，HD/SD）
- **首尾帧支持：Kling O3、Vidu、Vidu Q3** ⇒ `generate_video.lastFrameAssetId` 的路由目标
- 平台特有能力（v2 工具候选）：View Angle 一图多机位、图片扩展(outpaint)、高清放大、Shot Node 取景局部生成、3D Node(.glb Capture)、Analysis 反推提示词、Reference @多图参考

**12.3 画布与节点系统（模板 JSON 证实）**
- 内核为 **React Flow**（edge id 前缀 `reactflow__edge-`）；端口类型 Prompt/Image/Audio/Video，同类型方可互连
- 节点参数化程度高：`modelProvider`（如 `"banana-3.1"`）、`aspectRatio`、`imageSize`、`presetPrompt` 均为节点 data 字段
- 撤销/重做、成组、框选加选等能力已存在——⚠️ 实现为**快照式 history**（`services/historyService.ts`），非 command 模式
- **局部重绘交互已存在**：Shift+框选图片区域 → 自动载入对话框（§4.5 手册）⇒ agent 消息信封的 `selectionRefs` 增加可选 `regionRect` 字段即可承接
  - ⚠️ **机制澄清（2026-08-29 核对源码）**：框选区域**不进后端**——`EditImageDto` 无 crop/mask 字段。真实流程是「`sourceImageUrl` 传**原图整张** → 模型整图重绘 → 前端按 `cropRectNormalized` 用 canvas 合成回原图」（`aiChatStore.ts:718` / `:770`）。故 `regionRect` 只用于 prompt 描述与前端合成。见顶部修正表 #4。

**12.4 工作流模板 DSL（v2 的关键素材，样本已入库）**
`docs/../../Downloads/建筑线稿转效果图.json` 等大量 `tai-template-*.json` 显示：模板 = `{schemaVersion, nodes[], edges[]}`，节点含 `image/generate/textPrompt` 等类型与画布坐标。**v2"agent 搭建工作流"即生成该 schema 的 JSON 并注入画布**，无需发明新格式。建筑师工作流已有官方示例：手绘草图 → Generate Refer → 3D Node → Shot Node 排版。

**12.5 资产与存储**
生成结果存火山引擎 TOS（`tai-ai.tos-*.volces.com/projects/{projectId}/…` 与 `/uploads/ai/tasks/{taskId}/…`），任务制服务的 URL 结构印证异步任务模型。
