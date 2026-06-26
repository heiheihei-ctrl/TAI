import { createPortal } from "react-dom";
import { Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  isOpen: boolean;
  rewardCredits?: number;
  onClose: () => void;
  onGoFill: () => void;
};

export default function ProfileCompletionLoginModal({
  isOpen,
  rewardCredits = 100,
  onClose,
  onGoFill,
}: Props) {
  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-completion-login-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-6 pt-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Gift className="h-6 w-6" />
          </div>
          <h2
            id="profile-completion-login-title"
            className="text-center text-lg font-semibold text-slate-900"
          >
            完善个人资料
          </h2>
          <p className="mt-3 text-center text-sm leading-6 text-slate-600">
            您还有资料未填写完整。补充昵称、性别、生日、邮箱、职业、公司与省市区等信息后，可用于个性化推荐
            {rewardCredits > 0 ? `，首次完成可领取 ${rewardCredits} 积分` : ""}。
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-xl"
              onClick={onClose}
            >
              稍后再说
            </Button>
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl bg-violet-600 text-white hover:bg-violet-700"
              onClick={onGoFill}
            >
              去填写
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
