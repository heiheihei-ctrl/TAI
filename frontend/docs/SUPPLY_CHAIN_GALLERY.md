# 玲珑供应链图库

## 数据来源与管理

玲珑身份的供应链图库不使用演示条目或固定的“场景1–5”。公共图片由管理员在「管理后台 → 供应链图库」上传并上架，名称和分类由管理员填写。该入口沿用系统设置管理权限，仅完整管理员 `admin` 可见与操作。

- 上传使用现有 `imageUploadService`，兼容本地存储和对象存储，只保存远程 URL 或站内资源路径。
- 支持修改名称、分类、替换图片、上架、下架与删除。删除移除图库条目，不清理底层可能仍被画布引用的资源。
- 空图库返回空数组；加载失败显示错误与重试，不生成占位业务数据。后台列表未成功加载时禁止保存，避免覆盖已有条目。
- 会员弹窗的分类来自真实上架条目，支持名称搜索、分页和刷新。再次打开弹窗也会重新获取数据。
- 「玲珑个人图库」使用当前登录账号的个人图片接口，切换账号或标签时不复用其他账号的数据。
- 点击图片通过现有 `triggerQuickImageUpload` 事件发送可持久化图片引用到画布。

## 接口与持久化

| 接口 | 权限 | 行为 |
| --- | --- | --- |
| `GET /api/admin/supply-chain-gallery` | 完整管理员 | 返回全部管理条目，包括下架图片 |
| `POST /api/admin/supply-chain-gallery` | 完整管理员 | 校验并保存 `{ items: [...] }` |
| `GET /api/settings/supply-chain-gallery` | 登录用户 | 只返回已上架图片 |
| `GET /api/personal-library/assets?type=2d` | 登录用户 | 读取本人个人图片 |

公共图库复用现有 `SystemSetting` 表，key 为 `linglong_supply_chain_gallery`，无需新增数据库迁移。value 为 JSON 数组，每项含 `id`、`name`、`scene`、`imageUrl`、`isActive`。最多 5000 项；ID 必须唯一，名称与分类不能为空，上架状态必须为布尔值；图片禁止 `data:`、`blob:`、`flow-asset:`、裸 base64 等临时引用。普通系统设置写入同一 key 时也执行该校验。

管理端按整份图库保存；多名管理员同时编辑时，后保存者覆盖先保存者，请先刷新再继续编辑。

## 验证

- 前端：`npm run build`；对本次新增与修改的图库组件运行 ESLint。
- 后端：`npm run build`；`node --test test/supply-chain-gallery.test.cjs`。
- 后端测试覆盖远程/站内引用、临时地址拒绝、空图库、上架过滤、管理保存与读取、非管理员写入拒绝及会员读取接口的登录保护。
