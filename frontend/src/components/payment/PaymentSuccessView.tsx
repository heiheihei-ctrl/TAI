import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import operationQrCode from "@/assets/yy.png";
import { useLocaleText } from "@/utils/localeText";

type Props = {
  message: string;
  isWhite?: boolean;
  onDone: () => void;
  doneLabel?: string;
};

export default function PaymentSuccessView({
  message,
  isWhite = false,
  onDone,
  doneLabel,
}: Props) {
  const { lt } = useLocaleText();

  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <CheckCircle
        className={cn("h-14 w-14", isWhite ? "text-emerald-500" : "text-emerald-400")}
        strokeWidth={1.5}
      />
      <h3 className={cn("mt-4 text-xl font-semibold", isWhite ? "text-slate-900" : "text-zinc-100")}>
        {lt("支付成功", "Payment successful")}
      </h3>
      <p className={cn("mt-2 max-w-sm text-sm leading-relaxed", isWhite ? "text-slate-500" : "text-zinc-400")}>
        {message}
      </p>

      <div
        className={cn(
          "mt-8 rounded-2xl border-2 p-4 shadow-sm",
          isWhite ? "border-slate-200 bg-slate-50" : "border-zinc-700/80 bg-[#12121a]",
        )}
      >
        <div
          className={cn(
            "overflow-hidden rounded-xl border-2 p-3",
            isWhite ? "border-white bg-white shadow-inner" : "border-zinc-800 bg-[#0a0a0f]",
          )}
        >
          <img
            src={operationQrCode}
            alt={lt("专属客服二维码", "Customer service QR code")}
            className="h-44 w-44 object-contain sm:h-48 sm:w-48"
          />
        </div>
      </div>
      <p className={cn("mt-4 text-sm font-medium", isWhite ? "text-slate-700" : "text-zinc-200")}>
        {lt("扫码添加专属客服", "Scan to add dedicated customer service")}
      </p>

      <button
        type="button"
        onClick={onDone}
        className={cn(
          "mt-8 inline-flex min-w-[140px] items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors",
          isWhite
            ? "bg-slate-900 text-white hover:bg-slate-800"
            : "bg-gradient-to-r from-[#8E86F5] to-[#9aa8ef] text-white hover:opacity-90",
        )}
      >
        {doneLabel || lt("完成", "Done")}
      </button>
    </div>
  );
}
