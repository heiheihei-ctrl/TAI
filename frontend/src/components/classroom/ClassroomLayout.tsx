import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  children: React.ReactNode;
  /** 学习页等需要全宽内容时去掉 main 的限宽与内边距 */
  bleed?: boolean;
};

const NAV = [
  { to: "/", label: "首页", match: (p: string) => p === "/" },
  { to: "/classroom", label: "课程", match: (p: string) => p.startsWith("/classroom") && !p.startsWith("/classroom/purchases") },
  { to: "/classroom/purchases", label: "我的已购", match: (p: string) => p.startsWith("/classroom/purchases") },
];

export default function ClassroomLayout({ children, bleed = false }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const initializing = useAuthStore((s) => s.initializing);
  const init = useAuthStore((s) => s.init);
  const authBootstrappedRef = React.useRef(false);

  React.useEffect(() => {
    if (authBootstrappedRef.current) return;
    authBootstrappedRef.current = true;
    void init().catch(() => {});
  }, [init]);

  const authReady = !initializing || Boolean(user);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f5f6f8] text-slate-900">
      <header className="sticky top-0 z-40 shrink-0 bg-[#2a2d34] text-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <button
              type="button"
              className="flex items-center gap-2"
              onClick={() => navigate("/")}
            >
              <img src="/TAI-logo.png" alt="TAI" className="h-7 w-auto" draggable={false} />
              <span className="text-sm font-medium tracking-wide">TAI课堂</span>
            </button>
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((item) => {
                const active = item.match(location.pathname);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`rounded px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-white/15 text-white"
                        : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {!authReady ? (
              <span className="text-white/50">…</span>
            ) : user ? (
              <span className="hidden text-white/80 md:inline">
                {user.name || user.phone || "用户"}
              </span>
            ) : (
              <button
                type="button"
                className="rounded bg-[#3b82f6] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#2563eb]"
                onClick={() =>
                  navigate("/auth/login", {
                    state: { from: location.pathname },
                    replace: false,
                  })
                }
              >
                登录
              </button>
            )}
          </div>
        </div>
      </header>
      {bleed ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      ) : (
        <main className="mx-auto min-h-0 w-full max-w-[1200px] flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      )}
    </div>
  );
}
