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
  seatExempt?: boolean;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    avatarUrl?: string | null;
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
  async createTeam(name: string): Promise<TeamInfo> {
    return json<TeamInfo>("/api/teams", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
  },

  async getMyTeams(): Promise<TeamInfo[]> {
    return json<TeamInfo[]>("/api/teams");
  },

  async getInviteInfo(code: string): Promise<{ teamName: string; teamId?: string }> {
    return json<{ teamName: string; teamId?: string }>(
      `/api/invites/${encodeURIComponent(code)}`
    );
  },

  async acceptInvite(code: string): Promise<{
    requestId?: string;
    teamId: string;
    status?: string;
    message?: string;
  }> {
    return json(`/api/invites/${encodeURIComponent(code)}/apply`, {
      method: "POST",
    });
  },

  async applyInvite(
    code: string,
    message?: string
  ): Promise<{
    requestId: string;
    teamId: string;
    status: string;
    message?: string;
  }> {
    return json(`/api/invites/${encodeURIComponent(code)}/apply`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ message }),
    });
  },

  async joinByCode(
    code: string,
    message?: string
  ): Promise<{
    requestId: string;
    teamId: string;
    status: string;
    message?: string;
  }> {
    return json(`/api/join-by-code`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ code, message }),
    });
  },

  async listJoinRequests(teamId: string): Promise<
    Array<{
      id: string;
      status: string;
      message?: string | null;
      createdAt: string;
      applicant: {
        id: string;
        name?: string | null;
        phone?: string | null;
        email?: string | null;
        avatarUrl?: string | null;
      };
    }>
  > {
    return json(`/api/teams/${encodeURIComponent(teamId)}/join-requests`);
  },

  async approveJoinRequest(teamId: string, requestId: string): Promise<void> {
    await request(
      `/api/teams/${encodeURIComponent(teamId)}/join-requests/${encodeURIComponent(requestId)}/approve`,
      { method: "POST" }
    );
  },

  async rejectJoinRequest(teamId: string, requestId: string): Promise<void> {
    await request(
      `/api/teams/${encodeURIComponent(teamId)}/join-requests/${encodeURIComponent(requestId)}/reject`,
      { method: "POST" }
    );
  },

  async getMembers(teamId: string): Promise<TeamMember[]> {
    return json<TeamMember[]>(`/api/teams/${encodeURIComponent(teamId)}/members`);
  },

  async getMyQuota(teamId: string): Promise<{
    available: number | null;
    unlimited: boolean;
    teamBalance: number | null;
    quotaRemaining: number | null;
    creditQuotaMonthly: number | null;
    creditQuotaTotal: number | null;
    creditUsedThisCycle: number;
    creditUsedTotal: number;
  }> {
    return json(`/api/teams/${encodeURIComponent(teamId)}/my-quota`);
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
      `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
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

  async updateTeam(
    teamId: string,
    body: { name?: string; displayName?: string | null; logoUrl?: string | null }
  ): Promise<TeamInfo> {
    return json<TeamInfo>(`/api/teams/${encodeURIComponent(teamId)}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  },

  async transferOwnership(teamId: string, newOwnerId: string): Promise<void> {
    await request(
      `/api/teams/${encodeURIComponent(teamId)}/transfer-ownership`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ newOwnerId }),
      }
    );
  },

  async getEnterpriseDashboard(teamId: string): Promise<{
    id: string;
    name: string;
    displayName: string;
    logoUrl: string | null;
    enterpriseEnabled: boolean;
    status: string;
    memberCount: number;
    /** 占用创作席位的成员数（不含企业账户 seatExempt） */
    usedSeats: number;
    projectCount: number;
    assetCount: number;
    folderCount: number;
    maxSeats: number;
    availableCredits: number;
    recentProjects: Array<{
      id: string;
      name: string;
      updatedAt: string;
      thumbnailUrl?: string | null;
    }>;
  }> {
    return json(
      `/api/teams/${encodeURIComponent(teamId)}/enterprise-dashboard`
    );
  },
};
