# Seedance ToAPIs 接入

- Seedance 2.0 和 2.5 均支持模型供应商 `toapis`，使用后端 `TOAPIS_TOKEN`，默认提交地址为 `https://toapis.cn/v1/videos/generations`。
- 2.0 上游模型为 `seedance-2`，整数时长限制在 4–15 秒，6 秒不会吸附到 5 秒。2.5 保留 `seedance-2-5` 和原有 5 秒步长。
- 显式请求 `vendorKey: toapis` 或在模型管理设置默认供应商即可选择此线路；配置归一化保留该默认值。默认 Seedance API 仍可选。
- 2.0 任务使用 `seedance20-toapis:` 前缀，2.5 保留 `seedance25-toapis:`；复用提交和任务查询协议。2.0 Fast 尚未确认 ToAPIs 模型 ID，显式拒绝以免误用标准版。
- `The API key status is not active` 表示上游拒绝密钥状态。应检查 ToAPIs 控制台及部署环境的 `TOAPIS_TOKEN`，更新后重启后端；调整请求字段不能激活密钥。
- 回归：在 backend 运行 `npx ts-node scripts/test-seedance-toapis.ts`（模拟 HTTP，不消耗生成额度）。
- TAI 画布 Seedance 2.x 提交与预览按全局路线覆盖历史节点 vendor：普通为 `toapis`，尊享为 `seedance_api`；1.5 保留官方路线（未接入 ToAPIs）。玲珑保留天翼。显式 ToAPIs/官方选择优先于后端部署默认品牌，且禁止跨渠道失败兜底。旧任务仍按任务 ID 前缀查询原渠道。