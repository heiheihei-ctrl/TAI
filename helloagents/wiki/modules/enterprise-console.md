# Frontend / Backend — Enterprise Console

企业版：平台派发**企业账户**（独立 `Enterprise` 表）与管理员；用户侧不可创建企业；邀请为「申请 → 管理员审批」。

## 入口与权限识别

- 首页「企业版」→ `/enterprise`：**纯账号密码登录页**（手机号+密码；登录复用同一 User 表，但**平台新建的企业管理员**可标记为 `User.isEnterpriseAccount`，不必先有 TAI 个人工作区）
- **仅 owner / admin 可进入企业后台**；`member` 登录企业入口会失败提示，直接访问 `/enterprise/:id/*` 会被踢回登录页。成员只通过画布 `/app?teamId=` 创作。
- **不在企业入口提供邀请码**；加入企业走 TAI 个人侧（邀请链接 `/?teamInvite=` 等）
- 登录分流（`pickConsoleEnterprises` / `pickPreferredEnterprise`）：
  - owner/admin → `/enterprise/:teamId/projects`
  - 仅 member / 无企业 / 登录失败 → 留在登录表单
- 画布「企业后台」：**新开窗口**；建议仅管理员可见（成员无后台权限）
- 画布工作区下拉**不提供「新建团队」**（含未加入企业的普通用户）；企业仅由平台派发，下拉只切换个人 / 已加入企业

### Feature flags

| 开关 | 环境变量 | 默认 | 作用 |
|------|----------|------|------|
| `SHOW_TEAM_COLLABORATION` | `VITE_SHOW_TEAM_COLLABORATION` | `false` | 实时协同 UI |
| `SHOW_ENTERPRISE_CONSOLE` | `VITE_SHOW_ENTERPRISE` | `false` | 企业版入口与路由 |
| `SHOW_FOREIGN_NODES` | `VITE_SHOW_FOREIGN_NODES` | `true` | 节点面板/快捷连接是否展示国外模型节点 |

## 席位与企业账号

| 规则 | 说明 |
|------|------|
| `TeamMembership.seatExempt` | 平台生成的企业管理员（owner）**不计创作席位** |
| `usedSeats` | 仅统计 `seatExempt=false` 的成员 |
| `User.isEnterpriseAccount` | Admin 新建管理员时置 true；不自动创建个人 Team |
| 已有 TAI 用户被派为 owner | 仍可保留个人工作区；其企业 membership 仍 `seatExempt=true` |

迁移：`202608060001_enterprise_seat_exempt`。

## 组织口径（表级分离）

| 概念 | 表 | 说明 |
|------|------|------|
| 企业账户 | `Enterprise` | 仅平台 Admin 创建；`workspaceTeamId` 指向席位/积分工作区 |
| 工作区 Team | `Team`（`enterpriseEnabled=true`） | 席位、成员、积分、素材库 |
| 项目 | `Project`（可挂 `enterpriseId`） | 画布项目；一企业多项目 |
| 个人工作区 | `Team`（`isPersonal=true`） | 个人创作（企业专用账号可不创建） |

## 企业后台导航

- 默认：`/enterprise/:teamId/projects`（**仅 owner/admin**）
- 侧栏：项目管理、素材库、总览、席位、申请、设置
- 「进入创作」→ `/app?teamId=`

## 平台 Admin

- **用户管理**子 Tab：仅「用户列表」「企业列表」
- **新建企业**：可填写新手机号+密码生成企业管理员（不必已是 TAI 用户）

## 权限

| 角色 | 企业后台 | 画布创作 | 占席 |
|------|----------|----------|------|
| owner（含平台生成） | ✅ | ✅ | 否（seatExempt） |
| admin | ✅ | ✅ | 是（除非另标豁免） |
| member | ❌ | ✅ | 是 |
| 平台 Admin | 派发企业 | — | — |

## 关键 API

- `POST /api/admin/enterprises`
- `GET /api/admin/teams`（`usedSeats` 不含豁免成员）
- `GET /api/teams/:id/enterprise-dashboard`（需 owner/admin）
