const STORAGE_KEY = "tanva:pending-payment-order";

/** 记录待支付订单号，供全局轮询在弹窗关闭后继续查单 */
export function trackPendingPaymentOrder(orderNo: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!orderNo) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, orderNo);
    }
  } catch {
    // ignore quota / private mode
  }
}

export function getPendingPaymentOrderNo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
