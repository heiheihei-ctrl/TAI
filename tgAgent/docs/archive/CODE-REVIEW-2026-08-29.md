# tgagent 代码审查报告

> ✅ **状态（2026-08-30）：本报告列出的 3 项 P0 与 4 项 P1 已全部关闭**，含回归测试。
> ⚠️ 但其中「P1 §4 并发门控碎片化」的修复（提交 `6096f3b`）**本身引入了更严重的死锁**，
> 已于 2026-08-30 由 `7dd43b6` 修复。详情见报告末尾与 README「代码审查项」一节。
> 本报告保留原文，作为当时判断的历史记录。

- **日期**：2026-08-29
- **基线**：`74519e1` + 工作区未提交改动（计费链路 JWT 透传 / 多候选 partialFailures 改造 / 401·403 语义）
- **审查范围**：`src/tasks/*`、`src/gateway/*`、`src/agent/tools/generateRendering.ts`、`src/shared/protocol.ts`、相关测试
- **验证状态**：`tsc --noEmit` 通过；`npm test` 9 passed / 0 failed（耗时 3m13s）

> ⚠️ 审查期间工作区文件仍在变动（11:07–11:13 多次写入）。本报告基于 11:20 左右的快照，
> 若之后又有改动，请以代码为准。

### 修复状态（2026-08-29 同日后续）

审查报告中识别的 **三项 P0 与一项关键 P1 已在本次会话内关闭**，
验证：`tsc --noEmit` 零错；`npx tsx tests/run-all.ts` 9/9 通过（含新增安全用例 ⑦⑧⑨⑩⑭b + sessions userId 隔离）；
`npx tsx tests/smoke.ts` 通过。剩余 P1/P2 未处理，详见 §三/§四。

| # | 项 | 状态 | 关键改动 |
|---|---|---|---|
| P0 §1 会话键不含用户身份 | ✅ 已修 | `src/gateway/sessions.ts` `key(projectId, userId, sessionId)`；`wsServer.ts` 由 bearer 派生 `userId = sha256(token).slice(0,16)`，默认 `"anon"`；`applyBffAuth` 对同会话凭证切换抛 `TaskSourceError("auth_expired")`；`tests/sessions.test.ts` 新增 §7 userId 隔离、`tests/bff-chat.test.ts` 新增 ⑩ |
| P0 §2 `/chat` 无鉴权、无限速、监听 0.0.0.0 | ✅ 已修 | `src/config.ts` 新增 `host`/`bffSecret`/`chatRateLimit`/`chatMaxBodyBytes`；`src/gateway/wsServer.ts` 新增 BFF secret 守卫 → 每 IP 滑动窗口限速（**bucket 提到 `startGateway` 内，per 实例隔离**）→ body 上限 → 派生 userId；`src/index.ts` 透传并在缺 BFF_SECRET 时打印告警；`tests/bff-chat.test.ts` 新增 ⑦⑧⑨ |
| P0 §3 错误码最后一公里 | ✅ 已修 | `src/shared/protocol.ts` 新增 `mapTaskSourceErrorToProtocol` 与 `ErrorCode` 类型、`ErrorMessage.code` 扩列 `auth_expired`；`src/tasks/types.ts` `PartialFailure` 携带 code；`src/agent/tools/generateRendering.ts` `src/agent/tools/generateVideo.ts` 在 catch 里映射并 emit 协议错误；`src/gateway/sessions.ts` 视频轮询也消费映射；`tests/tai-source.test.ts` 新增 ⑭b（`getVideoTask` 401/403 映射） |
| P1 §6 视频链路 401/403 | ✅ 已修（随 P0 §3 一并关闭） | `src/tasks/taiSource.ts` `getVideoTask` 在非 2xx 时复用 `authErrorFromStatus`，轮询侧在 `sessions.ts` 捕获并立即映射为协议事件 |
| P2 §11 `errCode as never` | ✅ 已修 | `src/tasks/qianwenSource.ts` 改为合法码 `"insufficient_credits"` |
| P1 §4 会话级源令门控碎片化 | ⬜ 未处理 | — |
| P1 §5 门控不约束实际提交数 | ⬜ 未处理 | — |
| P1 §7 两处 90s 常量撞车 | ⬜ 未处理 | — |
| P1 §8 BFF 轮次结束后视频完成事件无人接收 | ⬜ 未处理 | — |
| P2 §9–§13 | ⬜ 未处理 | — |

---

## 一、结论速览

这批改动的**方向是对的**，而且有几处明显是踩过坑才写得出来的代码——三道防「静默免单」的设防、
`ctx.taskSource` 用 getter 做活引用、`withGate` 里清理 race timer 与直接移交槽位，
都属于「看起来简单、实则极易写错」的地方，全部做对了。

问题集中在**一处本次改动引入的架构性回归**和**一条只做了一半的错误语义链路**：

| 级别 | 问题 | 位置 | 状态 |
|---|---|---|---|
| **P0** | 会话键不含用户身份 → 跨租户串台、A 生图 B 买单 | `sessions.ts:491` / `wsServer.ts:312` | ✅ 已修 |
| **P0** | `/chat` 无鉴权、无限速、监听 0.0.0.0 | `wsServer.ts:41,232` | ✅ 已修 |
| **P0** | 鉴权/计费错误码造出来了但无人消费 | `types.ts:74` / `generateRendering.ts:132` | ✅ 已修 |
| **P1** | 会话级任务源让并发门控碎片化（本次引入的回归） | `taiSource.ts:201` | ⬜ |
| **P1** | 门控只约束调用数，不约束实际提交数 | `taiSource.ts:365` | ⬜ |
| **P1** | 视频链路缺 401/403 语义，过期 token 空转 10 次 | `taiSource.ts:528` | ✅ 已修 |
| **P1** | 两处 90s 常量撞车，超时降级设计失效 | `generateRendering.ts:8` | ⬜ |
| **P1** | BFF 轮次结束后视频完成事件无人接收 | `wsServer.ts:329` | ⬜ |
| P2 | `sessions.ts` 直接依赖具体 `TaiTaskSource`，破坏抽象 | `sessions.ts:20,197` | ⬜ |
| P2 | JSDoc 默认值漂移 / `as never` 掩盖类型 / `upgradeReq` 死代码 | 见 §3 | 部分（`as never` 已修） |
| P2 | 测试耗时 3m13s，其中 tai-source 约 50s | `taiSource.ts:32` | ⬜ |

---

## 二、P0：必须解决才能上生产

### 1. 会话键不含用户身份 → 跨租户串台与跨用户计费

**证据链**

```ts
// sessions.ts:491 —— 会话标识只由 projectId + sessionId 组成
private key(projectId: string, sessionId: string): string {
  return `${projectId}/${sessionId}`;
}

// wsServer.ts:312 —— BFF 直接用上游传来的这两个值取会话
const record = opts.sessions.getOrCreate(payload.projectId ?? "p_demo", payload.sessionId);

// sessions.ts:202 —— 随后把用户凭证写在这条会话上
this.jwtSource = new TaiTaskSource({ ..., accessToken: auth.bearer, teamId: auth.teamId });
```

**后果**：两个不同用户只要命中同一 `(projectId, sessionId)`，后到的 `applyBffAuth` 就**静默覆盖**
前一个人的 `jwtSource`。而视频轮询是跨轮次的（`sessions.ts:352` 用 `effectiveTaskSource`，
在 `/chat` 返回之后仍在跑），于是——

> 用户 A 提交生图/视频、用户 B 在同一会话键下发一条消息，**A 的在飞任务开始用 B 的 token 回调 TAI，积分记到 B 账上**。

同时 brief、资产、画布状态也会互相可见。更麻烦的是，这条路径**完全不报错**。

**它目前是否真的会触发，取决于 TAI 后端怎么生成 sessionId**——若按用户隔离则暂时安全。
但这是把计费边界寄托在上游实现细节上，一旦上游改成按项目生成会话，就是静默的资损。

**建议**（任选，按推荐度排序）

1. 解析 JWT 的 `sub`（或取 bearer 的稳定哈希）纳入会话键；
2. 或在 `applyBffAuth` 中检测到同一会话凭证切换时**拒绝覆盖并强制新建会话**，同时打告警日志——
   静默覆盖是这类缺陷最难排查的根源；
3. 至少补一条测试：同一会话键 + 两个不同 token → 断言不串台。现有 ⑤⑥ 用的是两个不同
   `projectId`（`p_ctl` / `p_jwt`），会话天然隔离，**测不出这一层**。

---

### 2. `/chat` 无鉴权、无限速、监听所有网卡

**证据**

```ts
wsServer.ts:41   if (req.method === "POST" && url.pathname === "/chat") { ... }
wsServer.ts:232  httpServer.listen(opts.port, () => { ... });   // 未指定 host → 0.0.0.0
wsServer.ts:320  const teamRaw = req.headers["x-team-id"];      // 调用方任意指定，直接透传
```

对照一下 ws 路径：它有 `wsToken` 鉴权（`wsServer.ts:70`）和 100 条/秒的速率限制（`wsServer.ts:114`）。
`/chat` 两者皆无，而且它是**唯一会花钱**的入口。

**后果**：任何能打通该端口的人，拿一份有效 JWT 就能消耗他人积分；`x-team-id` 由调用方自由指定，
若 TAI 后端不校验 team 归属，还能把费用挂到别的团队账上。

**建议**

- 绑定内网地址（`listen(port, "127.0.0.1")` 或内网网卡），不要 0.0.0.0；
- 要求上游携带服务间共享密钥——哪怕只是校验一个 header，也能挡住绝大部分误暴露；
- 按用户维度加最小速率限制（花钱的入口比打字更需要限流）；
- `x-team-id` 只接受白名单，或干脆由 JWT 派生而不再信任请求头。

---

### 3. 鉴权/计费错误码造出来了，但没人消费

**证据**

```ts
// types.ts:74 —— 新增了两个语义明确的码
| "auth_expired"            // 401：刷新后重试
| "insufficient_credits"    // 403：提示充值

// 但消费端只认 timeout：
// generateRendering.ts:132
const degraded = err instanceof TaskSourceError && err.code === "timeout";
// 其余一律 emitStatus("error") 后 rethrow
```

更直接的证据：协议层早已定义了 `quota_exceeded`（`protocol.ts:223`），
而全仓库 grep 只有定义处，**从未有任何地方 emit 过它**。

**后果**：区分这两个码的全部意义——「刷新 token」和「提示充值」是完全不同的用户动作——
目前完全落空。用户看到的是未经包装的内部文案，前端也拿不到任何可据以响应的信号。
你已经在源头做了正确的分类，只是链条断在最后一公里。

**建议**：在工具层补上映射，`insufficient_credits` → `emit({ code: "quota_exceeded" })`，
`auth_expired` → 引导重新登录；同时补一条断言「403 时前端收到 `quota_exceeded`」的测试，
把这条链锁住。

---

## 三、P1：正确性与一致性

### 4. 会话级任务源让并发门控碎片化（本次引入的回归）

信号量是**实例字段**（`taiSource.ts:201` `_active`），而 BFF 现在为每个会话新建一个源（`sessions.ts:202`）。

于是 `MAX_CONCURRENT_GENERATIONS = 2` 从「全局 2」退化为「**每会话** 2」：
N 个并发会话 = 最多 2N 个在飞生成，直击 TAI 后端。改动前共享源时代是真的全局 2。

**建议**：把信号量提到模块级，或做成可注入的共享对象——否则这个上限在生产多用户场景下形同虚设。

### 5. 门控只约束「调用数」，不约束「实际提交数」

`count > 1` 时的并发提交（`taiSource.ts:365` 的 `Promise.all(Array.from({length: req.count-1}, ...))`）
直接调 `this.request`，**绕过信号量**。2 个在飞的 `generateImages` × 每轮 2~4 候选 = 实际 4~8 个并发提交。

测试 ⑩ 用的是 `count: 1`，所以测不出这一层。

**建议**：先明确门控的语义对象到底是「并发请求」还是「并发任务」，再让测试按真实候选数覆盖。

### 6. 视频链路缺 401/403 语义

`getVideoTask`（`taiSource.ts:528-530`）对非 2xx 一律返回 `{ status: "failed" }`，没有走 `authErrorFromStatus`。
后果是 token 在视频轮询期过期时，`pollVideos` 会按 `MAX_POLL_ERRORS = 10`（`sessions.ts:29`）
以 1.5s 间隔空转十次才放弃，而用户看到的还是 `查询失败 (HTTP 401): `——
因为 JSON 响应下 `errorText` 是空串（`taiSource.ts:295`），**连原因都没有**。

**建议**：`getVideoTask` 复用 `authErrorFromStatus`；轮询侧对鉴权类错误立即终止，而不是计数重试。
另外 `submitVideoTask` 也没过门控，与生图不一致，值得明确一下是有意为之还是遗漏。

### 7. 两处 90 秒常量撞车

`IMAGE_BLOCK_TIMEOUT_MS = 90_000`（`generateRendering.ts:8`）与 `IMAGE_POLL_TIMEOUT_MS = 90_000`（`taiSource.ts:33`）数值完全相同。
`Promise.race` 与远端轮询几乎同时到期，**谁先 reject 不确定**。

结果是「超时降级为后台」的设计意图（DESIGN §4.3）在 TAI 源上基本失效——后台任务本身已经被 90s 判死了。
（对「排队等待」的场景仍然有效，因为那时轮询尚未开始。所以要修的是数值关系，不是机制。）

**建议**：让 `IMAGE_BLOCK_TIMEOUT_MS` 明显小于源的轮询上限（如 45s），并把差值理由写进注释。

### 8. BFF 轮次结束后，视频完成事件无人接收

`finish()`（`wsServer.ts:329`）解绑 detach 并关闭 SSE，但视频轮询仍在会话上跑（`sessions.ts:338`）。
视频完成时发出的 `canvas.place` / `asset.video_completed` **没有订阅者**。
下一轮 `/chat` 会重新 attach，但已发出的事件不会重放。

**建议**：现状下行确实进了 ring 缓冲，所以补一条约定——上游下一轮带 `lastSeq` 走 resync；
或在协议里明确写清「视频完成依赖重连补发」，别让上游去猜。

---

## 四、P2：可维护性

**9. 抽象泄漏**（`sessions.ts:20,197`）：`SessionRecord` 直接 import 具体 `TaiTaskSource`，
并用 `taskSource.name !== "tai"` 做字符串嗅探。更干净的做法是在 `GenerationTaskSource` 接口上加
`withUserAuth(bearer, teamId): GenerationTaskSource`，非计费源返回 `this`。

**10. JSDoc 默认值漂移**（`taiSource.ts:81`）：注解写「默认 seedream5」，代码默认 banana-3.1。
README 和 `config.ts` 的注释都是对的，只有这处过期——但这类漂移正是后来误判 provider 的温床。

**11. `errCode as never`**（`qianwenSource.ts:165`）：用 `as never` 绕过类型检查，等于关掉了这一行的安全性。
错误码联合类型刚扩充过，正是清理的好时机。

**12. `upgradeReq` 死代码**（`wsServer.ts:79,81`）：ws v3 起已移除该属性，
`(socket as any).upgradeReq?.url` 永远 undefined，「查询参数取 token」这条分支实际不可用，
wsToken 只能走首条 auth 消息。

**13. 测试耗时**：`npm test` 3m13s，其中 tai-source 约占 50s（轮询间隔 3s × 多组断言）。
建议把 `IMAGE_POLL_INTERVAL_MS` 抽成构造参数，测试里注入 50~100ms。

---

## 五、做得好的地方（值得保留的模式）

- **三道防「静默免单」设防**：构造期断言 jwt 与 apiToken 互斥 → `authHeaders()` 的 jwt 分支结构上
  发不出 `x-api-key` → 假后端 e2e 断言每次回调只带 Bearer。同一个坑从三个不同层次堵住，且每一层都有
  对应的回归测试。这是本次改动里最有价值的部分。
- **`ctx.taskSource` 用 getter 做活引用**（`sessions.ts:85`）：绕开了 `ctxCache` 一次性构建的陷阱——
  会话级源晚于 ctx 首次访问才就位，用普通属性就会读到旧的共享源。这个细节极容易写错。
- **`withGate` 的两处细节**：清理 `Promise.race` 落败分支的 timer（否则进程不退出）、
  以及释放槽位时直接移交给等待者而非「先减后加」（否则新请求会插队突破上限）。
  两个都是真实的坑，注释也把「为什么」讲清楚了。
- **改为 `Promise.allSettled` + `partialFailures`**：在「N 个候选 = N 次预扣积分」的前提下，
  因个别失败而整批抛错等于白丢已付费的图。这个判断是对的。

---

## 六、建议的下一步

按「资损风险 → 正确性 → 体验」排序。**2026-08-30 更新：第 1–7 项已全部关闭**，仅剩 P2 打磨。

1. ~~会话键纳入用户标识（或切换凭证时拒绝覆盖）+ 补跨租户测试~~ **已完成**（修复状态表 P0 §1）
2. ~~`/chat` 加服务间鉴权与限速，绑定内网地址~~ **已完成**（P0 §2；生产部署前仍需配置 `BFF_SECRET` 与 `HOST`）
3. ~~并发信号量提升为共享，明确门控语义对象~~ **已完成**（P1 §4 §5）
   ⚠️ **但本次修复（`6096f3b`）引入了更严重的死锁**，详见下方第七节
4. ~~打通 `auth_expired` / `insufficient_credits` → 协议 `quota_exceeded` 的最后一公里~~ **已完成**（P0 §3 + P1 §6）
5. ~~`getVideoTask` 复用鉴权错误映射，轮询侧遇鉴权错立即停止~~ **已完成**（同上）
6. ~~错开两处 90s 超时常量~~ **已完成**（P1 §7，工具阻塞超时降至 45s）
7. ~~BFF 轮次结束后视频完成事件的补发约定写进协议~~ **已完成**（P1 §8，`seq` + `lastSeq` resync，`smoke` ⑤ 验证）
8. P2 清理（抽象泄漏、JSDoc 漂移、死代码、测试提速）——部分完成，剩余项见 README

---

## 七、修复引入的回归（2026-08-30 补记）

本报告的修复建议本身引入了一个比原问题更严重的缺陷，值得单列存档。

### P1 §4 并发门控的修复（`6096f3b`）引入了永久死锁

**原问题**：会话级 jwt 源各自持有信号量，全局上限 2 退化为每会话 2。
**修复做法**：把信号量提升为模块级共享函数（`acquireGateSlot` / `releaseGateSlot`）。

**引入的缺陷**：`releaseGateSlot` 选中等待者时**先替它把槽位占好**（`_gateActive += w.cost`）
再唤醒——这一步是对的，防止 resolve 的微任务间隙被后来的 acquire 插队；
但 `acquireGateSlot` 被唤醒后**仍走 `while` 复检并再次累加** → 双重计数 →
复检必然失败 → 等待者把自己重新入队。

**后果**：并发提交超过上限(2)后，超出的任务全部永久挂起。**且不超时**——
`GATE_TIMEOUT_MS`(180s) 的计时器在 `gated()` 里 `acquireGateSlot` **成功之后**才启动，
acquire 卡死时根本没开始计时。

**最危险的一点：该缺陷表现为测试挂起，而非测试失败。**
`tests/tai-source.test.ts` ⑩ 因 `Promise.all` 永不 resolve 而卡死，整个套件跑到外部超时，
红灯被掩盖。此后 4 个提交（前端 + 文档）无人跑测试，缺陷潜伏至今。
当时的实测信号其实很明显——`npm test` 从 3m13s 涨到 12m22s，但被当成了「机器慢」。

**修复（提交 `7dd43b6`，2026-08-30）**：

- `acquireGateSlot` 改用 `granted` 标志区分「release 已代为占位」与「只是被超时唤醒」，
  被唤醒后直接返回，不再重复计数
- 新增 `GATE_WAIT_TIMEOUT_MS`，给 **acquire 阶段本身**加超时，
  拥塞时抛 `TaskSourceError("timeout")` 而非永久等待
- `releaseGateSlot` 的「先占位再唤醒」顺序保留，握手契约写入两侧注释

**测试加固**：⑩ 加 20s `Promise.race` 超时，把「挂起」转成「失败」——
这是防止同类缺陷再次隐身的关键。另新增 ⑫b 锁定 `withUserAuth` 的派生语义。

### 方法论沉淀

1. **防错断言与「复制 opts」式重构天然冲突**：凡 `{...已有配置, mode: 新模式}` 这种写法，
   必须显式剔除与新模式互斥的字段（P0-B 即由此而来）。
2. **会挂起的缺陷会掩盖自己**：测试必须自带超时，把挂起转成失败。
3. **修完必须做负向验证**：回退修复 → 确认测试报红 → 恢复 → 确认转绿。
   否则无法证明新测试真能抓到缺陷。本次两处修复均已做过并验证有效。
4. **耗时变化是强信号**：`npm test` 从 3m13s 涨到 12m22s 本身就是回归证据，
   不应只以「最终通过」为门槛。
