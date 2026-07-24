import { useEffect } from "react";
import { getPaymentStatus } from "@/services/adminApi";
import {
  getPendingPaymentOrderNo,
  trackPendingPaymentOrder,
} from "@/services/pendingPaymentTracker";

const POLL_INTERVAL_MS = 3000;

const TERMINAL_STATUSES = new Set(["paid", "expired", "cancelled", "failed"]);

/**
 * 全局支付轮询：弹窗关闭后仍继续查单，避免仅依赖组件内 polling。
 * 后端异步回调仍是入账主路径；此为前端补单 + 刷新积分 UI。
 */
export function useGlobalPaymentPoll(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let inFlight = false;

    const pollOnce = async () => {
      const orderNo = getPendingPaymentOrderNo();
      if (!orderNo || inFlight) return;

      inFlight = true;
      try {
        const status = await getPaymentStatus(orderNo);
        if (status.status === "paid") {
          trackPendingPaymentOrder(null);
          window.dispatchEvent(new CustomEvent("refresh-credits"));
          window.dispatchEvent(
            new CustomEvent("toast", {
              detail: {
                message: "支付成功，积分已到账",
                type: "success",
              },
            }),
          );
        } else if (TERMINAL_STATUSES.has(status.status)) {
          trackPendingPaymentOrder(null);
        }
      } catch (error: any) {
        if (error.message?.includes("Not Found") || error.message?.includes("404")) {
          trackPendingPaymentOrder(null);
        }
      } finally {
        inFlight = false;
      }
    };

    void pollOnce();
    const timer = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [enabled]);
}
