/**
 * 资产登记与血缘 —— 内存版（对应 DESIGN.md §9 asset 表的最小子集）
 * 持久化与 OSS 对接后置；接口保持稳定，未来仅换实现。
 */

import { randomUUID } from "node:crypto";
import type { Asset, AssetKind, AssetOperation } from "../shared/assets.js";

export interface RegisterAssetInput {
  projectId: string;
  kind: AssetKind;
  url: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  parentIds?: string[];
  operation: AssetOperation;
  meta?: Record<string, unknown>;
  createdByJobId?: string;
}

export class AssetStore {
  private byId = new Map<string, Asset>();

  register(input: RegisterAssetInput): Asset {
    const asset: Asset = {
      id: `as_${randomUUID().slice(0, 12)}`,
      projectId: input.projectId,
      kind: input.kind,
      url: input.url,
      thumbUrl: input.thumbUrl,
      width: input.width,
      height: input.height,
      parentIds: [...(input.parentIds ?? [])],
      operation: input.operation,
      meta: input.meta ?? {},
      createdByJobId: input.createdByJobId,
      pick: undefined,
      deleted: false,
      createdAt: new Date().toISOString(),
    };
    this.byId.set(asset.id, asset);
    return asset;
  }

  get(assetId: string): Asset | undefined {
    return this.byId.get(assetId);
  }

  /** 局部更新（选定/弃用等画布态），返回更新后的资产 */
  patch(
    assetId: string,
    patch: Partial<Pick<Asset, "url" | "thumbUrl" | "pick">>,
  ): Asset {
    const cur = this.require(assetId);
    const next: Asset = { ...cur, ...patch };
    this.byId.set(assetId, next);
    return next;
  }

  /** 同批候选（多候选择优时找兄弟资产） */
  listByJob(jobId: string): Asset[] {
    return [...this.byId.values()].filter((a) => a.createdByJobId === jobId);
  }

  /** 必须存在的引用：工具校验「不编造 assetId」铁律时使用 */
  require(assetId: string): Asset {
    const a = this.byId.get(assetId);
    if (!a) throw new Error(`资产不存在: ${assetId}`);
    return a;
  }

  /** 供 {{RECENT_ASSETS}} 注入：本项目最近 limit 条（新→旧，排除已删除） */
  listRecent(projectId: string, limit = 20): Asset[] {
    return [...this.byId.values()]
      .filter((a) => a.projectId === projectId && !a.deleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  /** 血缘链（方案历史/分支视图的数据源，排除已删除节点） */
  lineage(assetId: string): Asset[] {
    const chain: Asset[] = [];
    let cur = this.byId.get(assetId);
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      if (!cur.deleted) chain.push(cur);
      cur = cur.parentIds[0] ? this.byId.get(cur.parentIds[0]!) : undefined;
    }
    return chain;
  }

  /** 软删除：标记资产为已删除（resync/canvas.place 会跳过） */
  delete(assetId: string): Asset | undefined {
    const cur = this.byId.get(assetId);
    if (!cur || cur.deleted) return undefined;
    const next = { ...cur, deleted: true };
    this.byId.set(assetId, next);
    return next;
  }

  /** 是否已删除 */
  isDeleted(assetId: string): boolean {
    return this.byId.get(assetId)?.deleted ?? true;
  }

  // ---------- 持久化（见 gateway/sessionStore.ts） ----------

  /** 导出资产（可按项目过滤；含已软删除的——删除态也要跨重启保持） */
  serialize(projectId?: string): Asset[] {
    return [...this.byId.values()].filter((a) => !projectId || a.projectId === projectId);
  }

  /** 从快照恢复：按 id 去重（多个会话快照可能引用同一批资产），返回新恢复条数 */
  restore(assets: Asset[]): number {
    let restored = 0;
    for (const a of assets) {
      if (a && typeof a.id === "string" && !this.byId.has(a.id)) {
        this.byId.set(a.id, a);
        restored++;
      }
    }
    return restored;
  }
}
