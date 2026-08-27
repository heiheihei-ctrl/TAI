import React from "react";
import { Link, useNavigate } from "react-router-dom";
import ClassroomLayout from "@/components/classroom/ClassroomLayout";
import { CourseCard } from "@/components/classroom/CourseCard";
import { listMyClassroomPurchases, type ClassroomPurchase } from "@/services/classroomApi";
import { useAuthStore } from "@/stores/authStore";

export default function ClassroomPurchasesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = React.useState<ClassroomPurchase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) {
      navigate("/auth/login", {
        state: { from: "/classroom/purchases" },
        replace: true,
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await listMyClassroomPurchases();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  return (
    <ClassroomLayout>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold">我的已购</h1>
        <Link to="/classroom" className="text-sm text-blue-600 hover:underline">
          去选课
        </Link>
      </div>
      {loading ? (
        <div className="py-20 text-center text-slate-400">加载中...</div>
      ) : error ? (
        <div className="py-20 text-center text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center text-slate-400 shadow-sm">
          还没有购买课程
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row) => (
            <CourseCard key={row.id} course={row.course} />
          ))}
        </div>
      )}
    </ClassroomLayout>
  );
}
