# Frontend / Backend — Enterprise Console

企业版：平台派发**企业账户**（独立 `Enterprise` 表）与管理员；用户侧不可创建企业；邀请为「申请 → 管理员审批」。

## 入口与权限识别

- 首页「企业版」→ `/enterprise`：**纯账号密码登录页**（手机号+密码；与 TAI 同一账号体系；由 `SHOW_ENTERPRISE_CONSOLE` / `VITE_SHOW_ENTERPRISE` 控制）
- **不在企业入口提供邀请码**，也不展示「非企业成员 / 去 TAI 注册」引导页；加入企业走 TAI 个人侧（`TeamSwitcher`、顶栏、`/?teamInvite=`）
- 登录分流（`pickEnterprises` / `pickPreferredEnterprise`）：
  - 属于企业 → `/enterprise/:teamId/projects`（默认落地**项目管理**）
  - 无企业权限或登录失败 → **留在同一登录表单**，仅显示简短错误（可换号重登）
- 首页其他入口进 `/app` 时切回**个人工作区**；画布顶栏保留「个人 / 企业」切换（`SHOW_WORKSPACE_SWITCHER`）
- 画布「企业后台 / 企业版」按钮：**新开窗口**进入（有企业 → 项目管理；无企业 → `/enterprise` 登录）
- 画布工作区下拉**不含**：成员管理、套餐与账单、使用邀请码加入（管理走企业后台；邀请码走首页/邀请链接）
- **企业成员**在 `TeamSwitcher` 中**不可见「新建团队」**
- 个人版默认关闭实时协同 UI（`SHOW_TEAM_COLLABORATION` / `VITE_SHOW_TEAM_COLLABORATION`），但不隐藏工作区切换（仅企业版开启时）

### Feature flags

| 开关 | 环境变量 | 默认 | 作用 |
|------|----------|------|------|
| `SHOW_TEAM_COLLABORATION` | `VITE_SHOW_TEAM_COLLABORATION` | `false` | 实时协同 UI |
| `SHOW_ENTERPRISE_CONSOLE` | `VITE_SHOW_ENTERPRISE` | `false` | 企业版入口与路由 |

## 组织口径（表级分离）

| 概念 | 表 | 说明 |
|------|------|------|
| 企业账户 | `Enterprise` | 仅平台 Admin 创建；`workspaceTeamId` 指向席位/积分工作区 |
| 工作区 Team | `Team`（`enterpriseEnabled=true`） | 席位、成员、积分、素材库 |
| 项目 | `Project`（可挂 `enterpriseId`） | 画布项目；一企业多项目 |
| 个人工作区 | `Team`（`isPersonal=true`） | 个人创作 |

历史误标：曾把所有非个人 Team 标成企业。迁移 `202608040003` 会回滚无 `displayName` 的壳 Team，并把真正企业写入 `Enterprise`。

## 企业后台导航

- 默认：`/enterprise/:teamId/projects`（全员可看项目列表并「打开创作」；创建项目仅 owner/admin）
- 侧栏主操作：项目管理、素材库、总览；（admin/owner）席位、申请、设置
- 多企业切换：侧栏底部次要下拉，避免被理解成「切项目」
- 「进入创作」→ `/app?teamId=`

## 平台 Admin

- **用户管理**子 Tab：仅「用户列表」「企业列表」（**无**「项目管理」子 Tab）
- **企业列表**：读 `Enterprise`，「新建企业」仍由平台派发
- 平台侧项目硬删/改归属若需要，可后续挂在企业详情（当前不在用户管理并列展示）

## 权限

| 角色 | 能力 |
|------|------|
| 普通成员 | 项目列表（只读创建）、进入创作、素材库、总览 |
| owner/admin | 创建项目、席位管理、加入申请、企业设置 |
| 平台 Admin | 企业账户派发与用户管理 |

## 关键 API

- `POST /api/admin/enterprises`
- `GET /api/admin/teams`（企业账户列表）
- `GET /api/admin/projects`（仍保留后端能力，前端用户管理 Tab 不再入口）
- `PATCH /api/admin/projects/:id/enterprise`
- `DELETE /api/admin/projects/:id`
