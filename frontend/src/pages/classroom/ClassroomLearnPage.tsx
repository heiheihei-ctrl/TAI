import React from "react";
import { Lock, PlayCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import ClassroomLayout from "@/components/classroom/ClassroomLayout";
import ClassroomCheckoutModal from "@/components/classroom/ClassroomCheckoutModal";
import ClassroomVideoPlayer from "@/components/classroom/ClassroomVideoPlayer";
import {
  getClassroomCourse,
  getClassroomLessonContent,
  listClassroomLessons,
  type ClassroomCourse,
  type ClassroomLessonContent,
  type ClassroomLessonMeta,
} from "@/services/classroomApi";
import { useAuthStore } from "@/stores/authStore";
import { proxifyRemoteAssetUrl } from "@/utils/assetProxy";

type TabKey = "detail" | "catalog" | "materials";

const RICH_HTML_CLASS =
  "classroom-rich-html [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_img]:max-w-full";

export default function ClassroomLearnPage() {
  const { courseId = "", lessonId = "" } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const initializing = useAuthStore((s) => s.initializing);

  const [course, setCourse] = React.useState<ClassroomCourse | null>(null);
  const [lessons, setLessons] = React.useState<ClassroomLessonMeta[]>([]);
  const [lesson, setLesson] = React.useState<ClassroomLessonContent | null>(null);
  const [purchased, setPurchased] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("catalog");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [trialHint, setTrialHint] = React.useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);

  const lessonIndex = lessons.findIndex((l) => l.id === lessonId);
  const nextLesson =
    lessonIndex >= 0 && lessonIndex < lessons.length - 1
      ? lessons[lessonIndex + 1]
      : null;

  const load = React.useCallback(async () => {
    if (!courseId || !lessonId || initializing) return;
    setLoading(true);
    setError(null);
    setTrialHint(null);
    try {
      const [detail, catalog, content] = await Promise.all([
        getClassroomCourse(courseId),
        listClassroomLessons(courseId),
        getClassroomLessonContent(lessonId),
      ]);
      if (content.courseId !== courseId) {
        throw new Error("课时不属于当前课程");
      }
      setCourse(detail);
      setPurchased(Boolean(detail.purchased || catalog.purchased || content.purchased));
      setLessons(catalog.lessons || []);
      setLesson(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setLesson(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, lessonId, initializing]);

  React.useEffect(() => {
    void load();
  }, [load, user?.id]);

  const handleBuy = () => {
    if (!user) {
      navigate("/auth/login", {
        state: { from: `/classroom/${courseId}/learn/${lessonId}` },
      });
      return;
    }
    setCheckoutOpen(true);
  };

  const goLesson = (target: ClassroomLessonMeta) => {
    if (target.locked) {
      setTrialHint("请先购买课程后再学习");
      return;
    }
    navigate(`/classroom/${courseId}/learn/${target.id}`);
  };

  const playNext = () => {
    if (!nextLesson || nextLesson.locked) return;
    navigate(`/classroom/${courseId}/learn/${nextLesson.id}`);
  };

  if (loading || initializing) {
    return (
      <ClassroomLayout bleed>
        <div className="py-24 text-center text-slate-400">加载中...</div>
      </ClassroomLayout>
    );
  }

  if (error || !course || !lesson) {
    return (
      <ClassroomLayout bleed>
        <div className="mx-auto max-w-[1200px] px-4 py-24 text-center text-red-500">
          {error || "课时不存在"}
          <div className="mt-4">
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => navigate(`/classroom/${courseId}`)}
            >
              返回课程详情
            </button>
          </div>
        </div>
      </ClassroomLayout>
    );
  }

  return (
    <ClassroomLayout bleed>
      <section className="bg-[#1a1c20]">
        <div className="mx-auto max-w-[1100px] px-4 py-4 sm:px-6 sm:py-5">
          <div className="relative overflow-hidden rounded-md bg-black shadow-lg">
            {lesson.videoUrl ? (
              <ClassroomVideoPlayer
                src={proxifyRemoteAssetUrl(lesson.videoUrl)}
                trialSeconds={lesson.trialSeconds}
                purchased={lesson.purchased}
                hasNext={Boolean(nextLesson && !nextLesson.locked)}
                onNext={playNext}
                onTrialEnded={() =>
                  setTrialHint(
                    `试看已结束（${lesson.trialSeconds} 秒），购买后可观看完整内容`
                  )
                }
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-white/50">
                暂无视频
              </div>
            )}

            {trialHint ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-4">
                <div className="max-w-sm rounded-lg bg-white p-5 text-center shadow-xl">
                  <p className="text-sm text-slate-700">{trialHint}</p>
                  {!purchased ? (
                    <button
                      type="button"
                      className="mt-4 rounded-lg bg-[#3b82f6] px-5 py-2 text-sm font-medium text-white hover:bg-[#2563eb]"
                      onClick={handleBuy}
                    >
                      立即购买
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="mt-2 block w-full text-xs text-slate-400 hover:text-slate-600"
                    onClick={() => setTrialHint(null)}
                  >
                    关闭
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f6f8] pb-10">
        <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6 sm:py-6">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {lesson.title}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {course.title}
              {course.subscriberCount ? ` · ${course.subscriberCount} 人订阅` : ""}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
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
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {lessons.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm ${
                          item.id === lesson.id
                            ? "bg-blue-50"
                            : "bg-white hover:bg-slate-50"
                        }`}
                        onClick={() => goLesson(item)}
                      >
                        <span className="w-6 shrink-0 text-xs text-slate-400">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-800">
                          {item.title}
                        </span>
                        {item.isTrial ? (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-600">
                            {item.trialSeconds != null && item.trialSeconds > 0
                              ? `试看 ${item.trialSeconds} 秒`
                              : "试学"}
                          </span>
                        ) : null}
                        {item.locked ? (
                          <Lock className="h-4 w-4 text-slate-400" />
                        ) : item.id === lesson.id ? (
                          <span className="text-xs text-blue-600">播放中</span>
                        ) : (
                          <PlayCircle className="h-4 w-4 text-blue-500" />
                        )}
                      </button>
                    ))}
                    {lessons.length === 0 ? (
                      <div className="px-3 py-8 text-center text-slate-400">
                        暂无目录
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {(course.authorName || "TAI").slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {course.authorName || "TAI课堂"}
                    </p>
                    <p className="text-xs text-slate-500">智能创意学习平台</p>
                  </div>
                </div>
                {!purchased ? (
                  <button
                    type="button"
                    className="mt-4 w-full rounded-lg bg-[#3b82f6] py-2 text-sm font-medium text-white hover:bg-[#2563eb]"
                    onClick={handleBuy}
                  >
                    立即购买 · ¥{Number(course.discountPriceYuan).toFixed(0)}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    onClick={() => navigate(`/classroom/${courseId}`)}
                  >
                    返回课程详情
                  </button>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <ClassroomCheckoutModal
        open={checkoutOpen}
        courseId={course.id}
        amount={Number(course.discountPriceYuan)}
        onClose={() => setCheckoutOpen(false)}
        onPaid={() => {
          setTrialHint(null);
          void load();
        }}
      />
    </ClassroomLayout>
  );
}
