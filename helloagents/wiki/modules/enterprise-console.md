# Frontend / Backend — Enterprise Console

企业版：平台派发**企业账户**（独立 `Enterprise` 表）与管理员；用户侧不可创建企业；邀请为「申请 → 管理员审批」。

## 入口

- 首页「企业版」→ `/enterprise` **企业账号登录页**
- 首页其他入口进 `/app` 时切回**个人工作区**；画布顶栏保留「个人 / 企业」切换（`SHOW_WORKSPACE_SWITCHER`）
- 个人版默认关闭实时协同 UI（`SHOW_TEAM_COLLABORATION=false`），但不隐藏工作区切换

## 组织口径（表级分离）

| 概念 | 表 | 说明 |
|------|------|------|
| 企业账户 | `Enterprise` | 仅平台 Admin 创建；`workspaceTeamId` 指向席位/积分工作区 |
| 工作区 Team | `Team`（`enterpriseEnabled=true`） | 席位、成员、积分、素材库 |
| 项目 | `Project`（可挂 `enterpriseId`） | 画布项目；一企业多项目 |
| 个人工作区 | `Team`（`isPersonal=true`） | 个人创作 |

历史误标：曾把所有非个人 Team 标成企业。迁移 `202608040003` 会回滚无 `displayName` 的壳 Team，并把真正企业写入 `Enterprise`。

## 平台 Admin

- **企业列表**：读 `Enterprise`，不是项目列表
- **项目管理**：独立 Tab，可按个人/企业筛选、归属企业、删除

## 权限

| 角色 | 能力 |
|------|------|
| 普通成员 | 总览看积分、进入参与项目、素材库、创作 |
| owner/admin | 席位管理、加入申请、企业设置 |
| 平台 Admin | 企业账户 + 项目管理 |

## 关键 API

- `POST /api/admin/enterprises`
- `GET /api/admin/teams`（企业账户列表）
- `GET /api/admin/projects`
- `PATCH /api/admin/projects/:id/enterprise`
- `DELETE /api/admin/projects/:id`
