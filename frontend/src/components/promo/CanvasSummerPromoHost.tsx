import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CANVAS_SUMMER_PROMO_PURCHASED_EVENT,
  FLOW_OPEN_ADD_PANEL_EVENT,
  clearCanvasSummerPromoLoginPending,
  dismissCanvasSummerPromo,
  hasCanvasSummerPromoPurchased,
  isCanvasSummerPromoActive,
  markCanvasSummerPromoPurchased,
  shouldShowCanvasSummerPromo,
  type FlowOpenAddPanelDetail,
} from "@/config/canvasSummerPromo";
import { useAuthStore } from "@/stores/authStore";
import { getMembershipCurrent } from "@/services/adminApi";
import xsflBg from "@/assets/xsfl.jpg";

/**
 * 画布页居中促销海报
 * - 活动期内首次进入可弹
 * - 关闭后本登录会话内不再弹；重新登录可再弹
 * - 活动期内购买任意套餐后该用户不再弹
 * - 点击海报打开节点面板并滚动到视频类
 */
export default function CanvasSummerPromoHost() {
  const [open, setOpen] = useState(false);
  const userId = useAuthStore((s) => s.user?.id);
  const authInitializing = useAuthStore((s) => s.initializing);
  const evaluateSeq = useRef(0);

  const closePromo = useCallback(() => {
    dismissCanvasSummerPromo();
    setOpen(false);
  }, []);

  const evaluateOpen = useCallback(async () => {
    const seq = ++evaluateSeq.current;
    // shouldShowCanvasSummerPromo 已包含 linglong 品牌拦截
    if (!isCanvasSummerPromoActive()) {
      if (seq === evaluateSeq.current) setOpen(false);
      return;
    }
    if (!shouldShowCanvasSummerPromo(userId)) {
      if (seq === evaluateSeq.current) setOpen(false);
      return;
    }

    // 已登录：活跃会员或本地已记购买 → 不弹
    if (userId) {
      if (hasCanvasSummerPromoPurchased(userId)) {
        if (seq === evaluateSeq.current) setOpen(false);
        return;
      }
      try {
        const current = await getMembershipCurrent();
        if (seq !== evaluateSeq.current) return;
        if (current?.entitlement?.membershipStatus === "active") {
          markCanvasSummerPromoPurchased(userId);
          setOpen(false);
          return;
        }
      } catch {
        // 查会员失败时不阻断首次展示
      }
    }

    if (seq !== evaluateSeq.current) return;
    clearCanvasSummerPromoLoginPending();
    setOpen(true);
  }, [userId]);

  useEffect(() => {
    if (authInitializing) return;
    void evaluateOpen();
    const timer = window.setInterval(() => {
      if (!isCanvasSummerPromoActive()) {
        setOpen(false);
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [authInitializing, evaluateOpen]);

  // 用户 id 变化（登录/切换）时重新评估；显式登录会挂起 login-pending
  useEffect(() => {
    if (authInitializing) return;
    void evaluateOpen();
  }, [userId, authInitializing, evaluateOpen]);

  useEffect(() => {
    const onPurchased = () => {
      const id = useAuthStore.getState().user?.id;
      if (id) markCanvasSummerPromoPurchased(id);
      dismissCanvasSummerPromo();
      setOpen(false);
    };
    window.addEventListener(CANVAS_SUMMER_PROMO_PURCHASED_EVENT, onPurchased);
    return () => window.removeEventListener(CANVAS_SUMMER_PROMO_PURCHASED_EVENT, onPurchased);
  }, []);

  const handleClose = useCallback(() => {
    closePromo();
  }, [closePromo]);

  const handlePosterClick = useCallback(() => {
    closePromo();
    const detail: FlowOpenAddPanelDetail = {
      tab: "nodes",
      focusGroup: "video",
      highlightSeedance: true,
    };
    window.dispatchEvent(
      new CustomEvent(FLOW_OPEN_ADD_PANEL_EVENT, { detail }),
    );
  }, [closePromo]);

  const modal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={handleClose}
              aria-hidden
            />

            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-[380px] cursor-pointer transition hover:brightness-105 active:scale-[0.99]"
              onClick={handlePosterClick}
            >
              <img
                src={xsflBg}
                alt="限时福利"
                className="h-auto w-full rounded-[28px]"
                draggable={false}
              />

              <button
                type="button"
                aria-label="关闭"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose();
                }}
                className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-lg font-bold text-white transition hover:bg-black/80"
              >
                ×
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return <>{modal}</>;
}
