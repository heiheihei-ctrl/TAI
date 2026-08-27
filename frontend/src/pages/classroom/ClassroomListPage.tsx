import React from "react";
import ClassroomLayout from "@/components/classroom/ClassroomLayout";
import { CourseCard } from "@/components/classroom/CourseCard";
import { listClassroomCourses, type ClassroomCourse } from "@/services/classroomApi";

export default function ClassroomListPage() {
  const [courses, setCourses] = React.useState<ClassroomCourse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listClassroomCourses();
        if (!cancelled) setCourses(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ClassroomLayout>
      <div className="mb-5 flex items-end justify-between">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">最新精品课程</h1>
        <span className="text-sm text-slate-400">查看更多 &gt;</span>
      </div>
      {loading ? (
        <div className="py-20 text-center text-slate-400">加载中...</div>
      ) : error ? (
        <div className="py-20 text-center text-red-500">{error}</div>
      ) : courses.length === 0 ? (
        <div className="py-20 text-center text-slate-400">暂无课程，请稍后再来</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </ClassroomLayout>
  );
}
