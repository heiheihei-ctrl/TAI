import { fetchWithAuth } from "./authFetch";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "http://localhost:4000";

const buildUrl = (path: string) => {
  const base = API_BASE.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${base}/${p}`;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

async function request(path: string, options: RequestInit = {}) {
  const response = await fetchWithAuth(buildUrl(path), options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : Array.isArray(error?.message)
          ? error.message.join(", ")
          : "请求失败"
    );
  }
  return response;
}

async function json<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await request(path, options);
  return response.json() as Promise<T>;
}

export type TeamLibraryAssetType = "2d" | "3d" | "svg" | "video";

export interface TeamLibraryAsset {
  id: string;
  teamId: string;
  uploaderId: string;
  folderId?: string | null;
  name: string;
  url: string;
  ossKey?: string | null;
  mime?: string | null;
  size?: number | null;
  thumbnail?: string | null;
  assetType: TeamLibraryAssetType | string;
  createdAt: string;
  updatedAt: string;
  uploader?: { id: string; name?: string | null; avatarUrl?: string | null };
  folder?: { id: string; name: string } | null;
}

export interface TeamLibraryFolder {
  id: string;
  teamId: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  _count?: { assets: number };
}

export const teamLibraryApi = {
  listAssets(teamId: string, folderId?: string | null) {
    const params = new URLSearchParams();
    if (folderId === null) params.set("folderId", "root");
    else if (folderId) params.set("folderId", folderId);
    const qs = params.toString();
    return json<TeamLibraryAsset[]>(
      `/api/teams/${encodeURIComponent(teamId)}/library/assets${qs ? `?${qs}` : ""}`
    );
  },

  createAsset(
    teamId: string,
    body: {
      name: string;
      url: string;
      ossKey?: string;
      mime?: string;
      size?: number;
      thumbnail?: string;
      assetType?: TeamLibraryAssetType;
      folderId?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) {
    return json<TeamLibraryAsset>(
      `/api/teams/${encodeURIComponent(teamId)}/library/assets`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }
    );
  },

  async deleteAsset(teamId: string, assetId: string) {
    await request(
      `/api/teams/${encodeURIComponent(teamId)}/library/assets/${encodeURIComponent(assetId)}`,
      { method: "DELETE" }
    );
  },

  listFolders(teamId: string) {
    return json<TeamLibraryFolder[]>(
      `/api/teams/${encodeURIComponent(teamId)}/library/folders`
    );
  },

  createFolder(teamId: string, body: { name: string; parentId?: string | null }) {
    return json<TeamLibraryFolder>(
      `/api/teams/${encodeURIComponent(teamId)}/library/folders`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }
    );
  },

  async deleteFolder(teamId: string, folderId: string) {
    await request(
      `/api/teams/${encodeURIComponent(teamId)}/library/folders/${encodeURIComponent(folderId)}`,
      { method: "DELETE" }
    );
  },
};
