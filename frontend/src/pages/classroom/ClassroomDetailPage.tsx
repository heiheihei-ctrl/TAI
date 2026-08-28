import React from "react";
import { Lock, PlayCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import ClassroomLayout from "@/components/classroom/ClassroomLayout";
import ClassroomCheckoutModal from "@/components/classroom/ClassroomCheckoutModal";
import {
  getClassroomCourse,
  listClassroomLessons,
  type ClassroomCourse,
  type ClassroomLessonMeta,
} from "@/services/classroomApi";
import { useAuthStore } from "@/stores/authStore";

type TabKey = "detail" | "catalog" | "materials";

const RICH_HTML_CLASS =
  "classroom-rich-html [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_img]:max-w-full";

export default function ClassroomDetailPage() {
  const { courseId = "" } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const initializing = useAuthStore((s) => s.initializing);

  const [course, setCourse] = React.useState<ClassroomCourse | null>(null);
  const [lessons, setLessons] = React.useState<ClassroomLessonMeta[]>([]);
  const [purchased, setPurchased] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("detail");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [lessonError, setLessonError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    if (!courseId || initializing) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, catalog] = await Promise.all([
        getClassroomCourse(courseId),
        listClassroomLessons(courseId),
      ]);
      setCourse(detail);
      setPurchased(Boolean(detail.purchased || catalog.purchased));
      setLessons(catalog.lessons || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [courseId, initializing]);

  React.useEffect(() => {
    void reload();
  }, [reload, user?.id]);

  const handleBuy = () => {
    if (!user) {
      navigate("/auth/login", {
        state: { from: `/classroom/${courseId}` },
      });
      return;
    }
    setCheckoutOpen(true);
  };

  const goLearn = (lesson: ClassroomLessonMeta) => {
    setLessonError(null);
    if (lesson.locked) {
      setLessonError("请先购买课程后再学习");
      return;
    }
    const base = import.meta.env.BASE_URL || "/";
    const originWithBase = `${window.location.origin}${
      base.endsWith("/") ? base : `${base}/`
    }`;
    const href = new URL(
      `classroom/${encodeURIComponent(courseId)}/learn/${encodeURIComponent(lesson.id)}`,
      originWithBase
    ).href;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const startLearning = () => {
    const first = lessons.find((l) => !l.locked) || lessons[0];
    if (!first) {
      setTab("catalog");
      return;
    }
    goLearn(first);
  };

  if (loading) {
    return (
      <ClassroomLayout>
        <div className="py-24 text-center text-slate-400">加载中...</div>
      </ClassroomLayout>
    );
  }

  if (error || !course) {
    return (
      <ClassroomLayout>
        <div className="py-24 text-center text-red-500">{error || "课程不存在"}</div>
      </ClassroomLayout>
    );
  }

  return (
    <ClassroomLayout>
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="w-full overflow-hidden rounded-lg bg-slate-100 lg:w-[420px]">
            {course.coverUrl ? (
              <img
                src={course.coverUrl}
                alt={course.title}
                className="aspect-[16/10] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center text-slate-400">
                暂无封面
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="text-xl font-bold leading-snug sm:text-2xl">{course.title}</h1>
            <div className="mt-4 rounded-md bg-slate-100 px-4 py-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-red-500">
                  ¥{Number(course.discountPriceYuan).toFixed(0)}
                </span>
                {Number(course.originalPriceYuan) > Number(course.discountPriceYuan) ? (
                  <span className="text-sm text-slate-400 line-through">
                    ¥{Number(course.originalPriceYuan).toFixed(0)}
                  </span>
                ) : null}
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              已更新 {course.episodeCount || lessons.length} 期 | {course.subscriberCount || 0}{" "}
              人订阅
            </p>
            <div className="mt-auto pt-6">
              {purchased ? (
                <button
                  type="button"
                  className="rounded-lg bg-emerald-500 px-8 py-2.5 text-sm font-medium text-white"
                  onClick={startLearning}
                >
                  开始学习
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg bg-[#3b82f6] px-8 py-2.5 text-sm font-medium text-white hover:bg-[#2563eb]"
                  onClick={handleBuy}
                >
                  立即购买
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex border-b border-slate-100">
            {(
              [
                { key: "detail", label: "详情" },
                { key: "catalog", label: "目录" },
                { key: "materials", label: "资料" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`px-5 py-3 text-sm font-medium ${
                  tab === item.key
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-5">
            {tab === "detail" ? (
              course.detailHtml ? (
                <div
                  className={RICH_HTML_CLASS}
                  dangerouslySetInnerHTML={{ __html: course.detailHtml }}
                />
              ) : (
                <p className="text-sm text-slate-400">暂无详情</p>
              )
            ) : tab === "materials" ? (
              purchased ? (
                course.materialsHtml ? (
                  <div
                    className={RICH_HTML_CLASS}
                    dangerouslySetInnerHTML={{ __html: course.materialsHtml }}
                  />
                ) : (
                  <p className="text-sm text-slate-400">暂无资料</p>
                )
              ) : (
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-6 text-center">
                  <p className="text-sm text-amber-700">购买课程后可查看资料</p>
                  <button
                    type="button"
                    className="mt-3 rounded-lg bg-[#3b82f6] px-5 py-2 text-sm text-white hover:bg-[#2563eb]"
                    onClick={handleBuy}
                  >
                    立即购买
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <h3 className="text-base font-semibold">课程目录</h3>
                {lessonError ? (
                  <p className="text-sm text-amber-600">{lessonError}</p>
                ) : null}
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-3 bg-white px-3 py-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-slate-800">
                        {lesson.title}
                      </span>
                      {lesson.isTrial ? (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-600">
                          {lesson.trialSeconds != null && lesson.trialSeconds > 0
                            ? `试看 ${lesson.trialSeconds} 秒`
                            : "试学"}
                        </span>
                      ) : null}
                      {lesson.locked ? (
                        <Lock className="h-4 w-4 text-slate-400" />
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                          onClick={() => goLearn(lesson)}
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          立即学习
                        </button>
                      )}
                    </div>
                  ))}
                  {lessons.length === 0 ? (
                    <div className="px-3 py-8 text-center text-slate-400">暂无目录</div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">相关推荐</h3>
            <div className="space-y-3">
              {(course.related || []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full gap-2 text-left"
                  onClick={() => navigate(`/classroom/${item.id}`)}
                >
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded bg-slate-100">
                    {item.coverUrl ? (
                      <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-medium text-slate-800">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-red-500">
                      ¥{Number(item.discountPriceYuan).toFixed(0)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {item.subscriberCount || 0}人购买
                    </p>
                  </div>
                </button>
              ))}
              {(course.related || []).length === 0 ? (
                <p className="text-xs text-slate-400">暂无推荐</p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <ClassroomCheckoutModal
        open={checkoutOpen}
        courseId={course.id}
        amount={Number(course.discountPriceYuan)}
        onClose={() => setCheckoutOpen(false)}
        onPaid={() => {
          void reload();
          setTab("catalog");
        }}
      />
    </ClassroomLayout>
  );
}