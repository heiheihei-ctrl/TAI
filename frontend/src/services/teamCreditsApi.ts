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

export interface TeamSeatPackageSummary {
  permanentSeats: number;
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

export const teamCreditsApi = {
  async getAccount(teamId: string): Promise<TeamCreditAccount> {
    return json<TeamCreditAccount>(
      `/api/teams/${encodeURIComponent(teamId)}/credits/account`
    );
  },

  async getLedger(
    teamId: string,
    take: number,
    skip: number
  ): Promise<
    Array<{
      id: string;
      entryType: string;
      amount: number;
      taskId?: string;
      taskKind?: string;
      actorUserId?: string;
      note?: string;
      createdAt: string;
    }>
  > {
    const params = new URLSearchParams({
      take: String(take),
      skip: String(skip),
    });
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
      `/api/teams/${encodeURIComponent(teamId)}/credits/topup/orders`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }
    );
  },
};
