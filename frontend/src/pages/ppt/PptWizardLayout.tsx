import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  nextCost?: number;
  className?: string;
  contentClassName?: string;
};

export default function PptWizardLayout({
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "下一步",
  nextCost,
  className,
  contentClassName,
}: Props) {
  return (
    <div
      className={cn(
        "relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#f3f4f6] text-slate-900",
        className,
      )}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[980px] flex-1 flex-col px-5 pb-6 pt-10 sm:px-8 sm:pb-8 sm:pt-12">
        <header className="mb-6 shrink-0 text-center sm:mb-8">
          <h1 className="text-[28px] font-bold tracking-tight text-[#1f2430] sm:text-[32px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-slate-500 sm:text-base">{subtitle}</p>
          ) : null}
        </header>

        <div
          className={cn(
            "mx-auto min-h-0 w-full max-w-[760px] flex-1 overflow-y-auto overscroll-contain pr-1",
            contentClassName,
          )}
        >
          {children}
        </div>

        <div className="mx-auto mt-4 flex w-full max-w-[760px] shrink-0 gap-4 pt-2 sm:mt-6">
          <button
            type="button"
            className="h-12 flex-1 rounded-xl border border-[#2f3540] bg-white text-sm font-medium text-[#2f3540] transition hover:bg-slate-50"
            onClick={onBack}
          >
            上一步
          </button>
          <button
            type="button"
            disabled={nextDisabled}
            className="h-12 flex-1 rounded-xl bg-[#2f3540] text-sm font-medium text-white transition hover:bg-[#252a33] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onNext}
          >
            {nextLabel}{nextCost ? ` · ${nextCost} 积分` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
