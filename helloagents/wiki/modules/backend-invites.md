# 后端模块：邀请码（backend-invites）

## 作用
- 管理邀请码创建、兑换与邀请关系记录。

## 关键文件
- `backend/src/invites/invites.controller.ts`：`/invites/*`
- `backend/src/invites/invites.service.ts`

## 数据模型关联
- `InvitationCode`、`InvitationRedemption`、`User.invitedById`

## 当前约定
- 邀请码规范前缀只有 `TAI-`，不再兼容 `TANVAS-` 作为运行时输入。
- 历史 `TANVAS-` 数据需先迁移为 `TAI-`，再执行严格校验。
- 一次性迁移脚本：`backend/scripts/migrate-invite-codes-to-tai.ts`

