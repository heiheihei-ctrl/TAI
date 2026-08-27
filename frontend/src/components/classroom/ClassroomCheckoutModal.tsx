import React from "react";
import { getPaymentStatus } from "@/services/adminApi";
import { createClassroomOrder } from "@/services/classroomApi";

type Props = {
  courseId: string;
  amount: number;
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
};

export default function ClassroomCheckoutModal({
  courseId,
  amount,
  open,
  onClose,
  onPaid,
}: Props) {
  const [method, setMethod] = React.useState<"wechat" | "alipay">("wechat");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [orderNo, setOrderNo] = React.useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setOrderNo(null);
      setQrCodeUrl(null);
      setLoading(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || !orderNo) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const status = await getPaymentStatus(orderNo);
          if (cancelled) return;
          if (status.status === "paid") {
            window.clearInterval(timer);
            onPaid();
            onClose();
          }
        } catch {
          // keep polling
        }
      })();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, orderNo, onPaid, onClose]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const order = await createClassroomOrder({
        courseId,
        paymentMethod: method,
      });
      setOrderNo(order.orderNo);
      setQrCodeUrl(order.qrCodeUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建订单失败");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">购买课程</h3>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          应付金额{" "}
          <span className="text-xl font-bold text-red-500">¥{amount.toFixed(2)}</span>
        </p>
        {!qrCodeUrl ? (
          <>
            <div className="mb-4 flex gap-2">
              {(["wechat", "alipay"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    method === m
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  {m === "wechat" ? "微信支付" : "支付宝"}
                </button>
              ))}
            </div>
            {error ? <p className="mb-3 text-sm text-red-500">{error}</p> : null}
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleCreate()}
              className="w-full rounded-lg bg-[#3b82f6] py-2.5 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-60"
            >
              {loading ? "创建中..." : "生成支付二维码"}
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <img src={qrCodeUrl} alt="支付二维码" className="h-56 w-56 rounded border object-contain" />
            <p className="text-sm text-slate-500">
              请使用{method === "wechat" ? "微信" : "支付宝"}扫码支付，支付成功后自动解锁
            </p>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
