import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { FolderPlus, Trash2, Upload } from "lucide-react";
import { imageUploadService } from "@/services/imageUploadService";
import {
  teamLibraryApi,
  type TeamLibraryAsset,
  type TeamLibraryFolder,
} from "@/services/teamLibraryApi";
import { useTeamStore } from "@/stores/teamStore";
import { useAuthStore } from "@/stores/authStore";
import SmartImage from "@/components/ui/SmartImage";
import { cn } from "@/lib/utils";

export default function EnterpriseAssetsPage() {
  const { teamId = "" } = useParams<{ teamId: string }>();
  const team = useTeamStore((s) => s.teams.find((t) => t.id === teamId));
  const currentUserId = useAuthStore((s) => s.user?.id);
  const canManage = team?.myRole === "owner" || team?.myRole === "admin";

  const [assets, setAssets] = useState<TeamLibraryAsset[]>([]);
  const [folders, setFolders] = useState<TeamLibraryFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    if (!teamId) return;
    const [a, f] = await Promise.all([
      teamLibraryApi.listAssets(teamId, folderId),
      teamLibraryApi.listFolders(teamId),
    ]);
    setAssets(a);
    setFolders(f);
  };

  useEffect(() => {
    reload().catch((err: any) => setError(err?.message || "加载失败"));
  }, [teamId, folderId]);

  const folderTabs = useMemo(
    () => [{ id: null as string | null, name: "全部/根目录" }, ...folders.map((f) => ({ id: f.id, name: f.name }))],
    [folders]
  );

  const handleUpload = async (file: File) => {
    if (!teamId || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await imageUploadService.uploadImageFile(file, {
        dir: `uploads/team-library/${teamId}/images/`,
      });
      if (!result.success || !result.asset?.url) {
        throw new Error(result.error || "上传失败");
      }
      await teamLibraryApi.createAsset(teamId, {
        name: file.name.replace(/\.[^.]+$/, "") || "未命名素材",
        url: result.asset.url,
        ossKey: (result.asset as any).key || undefined,
        mime: file.type,
        size: file.size,
        thumbnail: result.asset.url,
        assetType: "2d",
        folderId,
      });
      await reload();
    } catch (err: any) {
      setError(err?.message || "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !teamId) return;
    try {
      await teamLibraryApi.createFolder(teamId, { name });
      setNewFolderName("");
      await reload();
    } catch (err: any) {
      setError(err?.message || "创建文件夹失败");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">企业素材库</h1>
          <p className="mt-1 text-sm text-slate-500">
            团队共享素材，仅保存远程 URL，可在创作画布中引用
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleUpload(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {busy ? "上传中…" : "上传图片"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {folderTabs.map((f) => (
            <button
              key={f.id ?? "root"}
              type="button"
              onClick={() => setFolderId(f.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                folderId === f.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {f.name}
              {f.id
                ? ` (${folders.find((x) => x.id === f.id)?._count?.assets ?? 0})`
                : ""}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="新建文件夹名称"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <button
            type="button"
            onClick={() => void createFolder()}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <FolderPlus className="h-4 w-4" />
            新建
          </button>
          {canManage && folderId ? (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("删除文件夹？素材会移回根目录。")) return;
                try {
                  await teamLibraryApi.deleteFolder(teamId, folderId);
                  setFolderId(null);
                  await reload();
                } catch (err: any) {
                  setError(err?.message || "删除失败");
                }
              }}
              className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
            >
              删文件夹
            </button>
          ) : null}
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-400">
          暂无素材，点击右上角上传
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => {
            const canDelete =
              canManage || asset.uploaderId === currentUserId;
            return (
              <div
                key={asset.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="aspect-[4/3] bg-slate-50">
                  <SmartImage
                    src={asset.thumbnail || asset.url}
                    alt={asset.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {asset.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {asset.uploader?.name || "成员"} ·{" "}
                      {new Date(asset.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      title="删除"
                      onClick={async () => {
                        if (!confirm(`删除「${asset.name}」？`)) return;
                        try {
                          await teamLibraryApi.deleteAsset(teamId, asset.id);
                          await reload();
                        } catch (err: any) {
                          setError(err?.message || "删除失败");
                        }
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
