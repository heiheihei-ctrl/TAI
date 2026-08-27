import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  children: React.ReactNode;
};

const NAV = [
  { to: "/", label: "首页", match: (p: string) => p === "/" },
  { to: "/classroom", label: "课程", match: (p: string) => p.startsWith("/classroom") && !p.startsWith("/classroom/purchases") },
  { to: "/classroom/purchases", label: "我的已购", match: (p: string) => p.startsWith("/classroom/purchases") },
];

export default function ClassroomLayout({ children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <header className="sticky top-0 z-40 bg-[#2a2d34] text-white shadow-sm">
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
            {user ? (
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
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
