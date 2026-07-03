import { fetchWithAuth } from "./authFetch";
import type { TeamInfo } from "@/stores/teamStore";

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

export interface TeamMember {
  userId: string;
  role: "owner" | "admin" | "member" | string;
  user?: {
    name?: string;
    email?: string;
  };
  creditQuotaMonthly?: number | null;
  creditQuotaTotal?: number | null;
  creditUsedThisCycle?: number;
  creditUsedTotal?: number;
}

export interface TeamInvite {
  code: string;
  expiresAt?: string;
}

export const teamApi = {
  async getMyTeams(): Promise<TeamInfo[]> {
    return json<TeamInfo[]>("/api/teams");
  },

  async getInviteInfo(code: string): Promise<{ teamName: string }> {
    return json<{ teamName: string }>(
      `/api/teams/invites/${encodeURIComponent(code)}`
    );
  },

  async acceptInvite(code: string): Promise<{ teamId: string }> {
    return json<{ teamId: string }>(
      `/api/teams/invites/${encodeURIComponent(code)}/accept`,
      { method: "POST" }
    );
  },

  async getMembers(teamId: string): Promise<TeamMember[]> {
    return json<TeamMember[]>(`/api/teams/${encodeURIComponent(teamId)}/members`);
  },

  async createInvite(
    teamId: string,
    body: { expiresInDays?: number }
  ): Promise<TeamInvite> {
    return json<TeamInvite>(
      `/api/teams/${encodeURIComponent(teamId)}/invites`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }
    );
  },

  async removeMember(teamId: string, userId: string): Promise<void> {
    await request(
      `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
  },

  async updateMemberRole(
    teamId: string,
    userId: string,
    role: string
  ): Promise<void> {
    await request(
      `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/role`,
      {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ role }),
      }
    );
  },

  async setMemberQuota(
    teamId: string,
    userId: string,
    quota: { monthly: number | null; total: number | null }
  ): Promise<void> {
    await request(
      `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/quota`,
      {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(quota),
      }
    );
  },

  async dissolveTeam(teamId: string): Promise<void> {
    await request(`/api/teams/${encodeURIComponent(teamId)}`, {
      method: "DELETE",
    });
  },
};
