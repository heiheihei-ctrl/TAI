import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type Props = {
  title: string;
  description?: string;
};

export default function PptPlaceholderPage({ title, description }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get("mode");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f3f4f6] px-6 text-slate-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
        <h1 className="text-xl font-semibold text-[#1f2430]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {description || "功能即将开放，敬请期待。"}
        </p>
        {mode ? (
          <p className="mt-2 text-xs text-slate-400">当前模式：{mode}</p>
        ) : null}
        <button
          type="button"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-[#2f3540] px-5 text-sm text-white transition hover:bg-[#252a33]"
          onClick={() => navigate("/ppt")}
        >
          返回模式选择
        </button>
      </div>
    </div>
  );
}
