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

export interface TeamCreditAccount {
  balance: number;
  reserved?: number;
}

export interface TeamLedgerEntry {
  id: string;
  entryType: string;
  amount: number;
  taskId?: string;
  taskKind?: string;
  actorUserId?: string;
  actorName?: string | null;
  actorPhoneTail?: string | null;
  note?: string;
  createdAt: string;
}

export interface TeamLedgerFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  actorUserId?: string | null;
  search?: string | null;
}

export interface TeamSeatPackageSummary {
  permanentSeats: number;
  packageSeats?: number;
  adminGrantedSeats?: number;
  maxSeats?: number;
  totalSeats: number;
  usedSeats: number;
  activePackages: Array<{
    id: string;
    seats: number;
    cycle: string;
    credits: number;
    expiresAt: string;
    purchasedAt: string;
  }>;
}

export interface TeamPaymentOrder {
  orderNo: string;
  qrCodeUrl: string;
  amount: number;
  credits: number;
}

export interface MyTeamQuota {
  creditQuotaMonthly: number | null;
  creditQuotaTotal: number | null;
  creditUsedThisCycle: number;
  creditUsedTotal: number;
  quotaCycleStartAt: string;
  teamAvailableCredits: number;
  /** null = unlimited quota (show team balance) */
  personalAvailable: number | null;
}

export const teamMyQuotaApi = {
  getMyQuota: (teamId: string) =>
    json<MyTeamQuota>(`/api/teams/${encodeURIComponent(teamId)}/my-quota`),
};

export const teamCreditsApi = {
  async getAccount(teamId: string): Promise<TeamCreditAccount> {
    return json<TeamCreditAccount>(
      `/api/teams/${encodeURIComponent(teamId)}/credits`
    );
  },

  async getLedger(
    teamId: string,
    take: number,
    skip: number,
    filters?: TeamLedgerFilters,
  ): Promise<TeamLedgerEntry[]> {
    const params = new URLSearchParams({
      take: String(take),
      skip: String(skip),
    });
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.actorUserId) params.set('actorUserId', filters.actorUserId);
    if (filters?.search) params.set('search', filters.search);
    return json(
      `/api/teams/${encodeURIComponent(teamId)}/credits/ledger?${params}`
    );
  },
};

export const teamSeatPackageApi = {
  async listPackages(teamId: string): Promise<TeamSeatPackageSummary> {
    return json<TeamSeatPackageSummary>(
      `/api/teams/${encodeURIComponent(teamId)}/seat-packages`
    );
  },

  async createOrder(
    teamId: string,
    body: {
      seats: number;
      cycle: "monthly" | "annual";
      paymentMethod: "alipay" | "wechat";
    }
  ): Promise<TeamPaymentOrder> {
    return json<TeamPaymentOrder>(
      `/api/teams/${encodeURIComponent(teamId)}/seat-packages/orders`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }
    );
  },
};

export const teamCreditsTopupApi = {
  async createOrder(
    teamId: string,
    body: {
      amount: number;
      paymentMethod: "alipay" | "wechat";
    }
  ): Promise<TeamPaymentOrder> {
    return json<TeamPaymentOrder>(
      `/api/teams/${encodeURIComponent(teamId)}/credits/topup-orders`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }
    );
  },
};
