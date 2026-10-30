# Seedance ToAPIs 接入

- 2026-10-30 按 [2.0/Fast 文档](https://docs.toapis.com/docs/cn/api-reference/videos/seedance-2/generation)、[2.5 文档](https://docs.toapis.com/docs/cn/api-reference/videos/seedance-2-5/generation) 和 [任务查询](https://docs.toapis.com/docs/cn/api-reference/tasks/video-status) 核验。统一由 `seedance-toapis.adapter.ts` 构造请求：图片、视频、音频分别使用 `image_with_roles`、`video_with_roles`、`audio_with_roles`，不再发送有角色歧义的 `image_urls`。

- Seedance 2.0 和 2.5 均支持模型供应商 `toapis`，使用后端 `TOAPIS_TOKEN`，默认提交地址为 `https://toapis.cn/v1/videos/generations`。
- 2.0 / Fast 上游模型为 `seedance-2` / `seedance-2-fast`，整数时长 4–15 秒；2.5 为 `seedance-2-5`，整数时长 4–30 秒。前端选项、提交和积分预览/实扣使用实际整数秒；官方/玲珑线路沿用各自规则。本站预付费暂不开放上游自动时长、编辑、延长、样片或联网工具等新功能。
- 首帧/首尾帧明确使用 `first_frame` / `last_frame`，不得混入参考视频或音频；参考模式统一使用 `reference_image` / `reference_video` / `reference_audio`。2.5 首尾帧自动使用 `adaptive`；2.0 音频须搭配图片或视频，2.5 可纯音频参考。2.0 维持本站 9 图/3 视频/3 音频上限（视频/音频还受渠道实际能力限制），2.5 为 30/10/10。URL 必须为 HTTP(S)，拒绝 data/blob/asset 引用、带凭据 URL、超过 2048 字节 URL 及跨媒体复用同一 URL。
- 2.0 标准支持 480p/720p/1080p/4k，Fast 仅 480p/720p，2.5 为 480p/720p/1080p；非法分辨率不再静默降级。auto 转换为 adaptive。
- 显式请求 `vendorKey: toapis` 或在模型管理设置默认供应商即可选择此线路；配置归一化保留该默认值。默认 Seedance API 仍可选。
- 2.0/Fast 任务使用 `seedance20-toapis:` 前缀，2.5 使用 `seedance25-toapis:`。任务失败透传 error.message；查询 HTTP 错误不再伪装成处理中。产物优先转存主地址，下载失败再尝试 fallback_url。素材审核可能占用 20 分钟，前端首次及恢复轮询窗口延长为 45 分钟。
- `The API key status is not active` 表示上游拒绝密钥状态。应检查 ToAPIs 控制台及部署环境的 `TOAPIS_TOKEN`，更新后重启后端；调整请求字段不能激活密钥。
- 回归：在 backend 运行 `npx ts-node scripts/test-seedance-toapis.ts`（模拟 HTTP，不消耗生成额度）。
- 合约与计费回归：`node --test test/seedance-toapis-contract.test.cjs test/seedance-toapis-billing.test.cjs`。本次仅做模拟请求，不消耗真实生成额度。
- TAI 画布 Seedance 2.x 提交与预览按全局路线覆盖历史节点 vendor：普通为 `toapis`，尊享为 `seedance_api`；1.5 保留官方路线（未接入 ToAPIs）。玲珑保留天翼。显式 ToAPIs/官方选择优先于后端部署默认品牌，且禁止跨渠道失败兜底。旧任务仍按任务 ID 前缀查询原渠道。
