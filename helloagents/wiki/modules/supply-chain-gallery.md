# 玲珑供应链图库

公共图库由完整管理员在后台上传与维护，前端不再生成示例条目；个人标签读取当前账号的个人图片。支持真实图片预览、后台分类、搜索、分页、刷新及发送到画布。

- 前端：`SupplyChainLibraryModal.tsx`、`SupplyChainGalleryManager.tsx`、`supplyChainGalleryApi.ts`。
- 后端：AdminController 管理接口、SettingsPublicController 登录读取接口、`supply-chain-gallery.ts` 校验；AdminService 对通用设置写入同样校验。
- 存储：复用 SystemSetting 的 `linglong_supply_chain_gallery`，只保存远程 URL/站内路径，无需数据库迁移。下架条目不向会员返回。整份列表保存，管理员并发编辑时后保存覆盖先保存。
- 详细接口、限制与验证见 [前端文档](../../../frontend/docs/SUPPLY_CHAIN_GALLERY.md)。
