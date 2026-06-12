import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import MembershipPanel from "@/components/payment/MembershipPanel";

type MembershipModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function MembershipModal({ open, onClose }: MembershipModalProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex h-[min(90dvh,760px)] w-full max-w-[min(100%,1300px)] flex-col overflow-hidden rounded-[10px]",
          "bg-[#0a0a0f] shadow-[0_32px_80px_rgba(0,0,0,0.5)]",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0">
          <MembershipPanel publicBrowse onBack={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
