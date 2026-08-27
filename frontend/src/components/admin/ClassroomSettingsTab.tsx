import React from "react";
import { imageUploadService } from "@/services/imageUploadService";
import { uploadToOSS } from "@/services/ossUploadService";
import {
  adminCreateCourse,
  adminCreateLesson,
  adminDeleteCourse,
  adminDeleteLesson,
  adminGetCourse,
  adminListCourses,
  adminUpdateCourse,
  adminUpdateLesson,
  type ClassroomCourse,
} from "@/services/classroomApi";

type LessonRow = {
  id: string;
  title: string;
  type: "article" | "video";
  contentHtml?: string | null;
  videoUrl?: string | null;
  sortOrder: number;
  isTrial: boolean;
  trialSeconds?: number | null;
  isPublished: boolean;
};

type CourseForm = {
  title: string;
  subtitle: string;
  coverUrl: string;
  tag: string;
  originalPriceYuan: string;
  discountPriceYuan: string;
  detailHtml: string;
  subscriberCount: string;
  authorName: string;
  authorAvatarUrl: string;
  isPublished: boolean;
  sortOrder: string;
};

const emptyForm = (): CourseForm => ({
  title: "",
  subtitle: "",
  coverUrl: "",
  tag: "专栏",
  originalPriceYuan: "499",
  discountPriceYuan: "109",
  detailHtml: "",
  subscriberCount: "0",
  authorName: "TAI课堂",
  authorAvatarUrl: "",
  isPublished: false,
  sortOrder: "0",
});

export default function ClassroomSettingsTab() {
  const [courses, setCourses] = React.useState<ClassroomCourse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CourseForm>(emptyForm());
  const [lessons, setLessons] = React.useState<LessonRow[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [lessonDraft, setLessonDraft] = React.useState({
    title: "",
    type: "article" as "article" | "video",
    contentHtml: "",
    videoUrl: "",
    isTrial: false,
    trialSeconds: "60",
    sortOrder: "0",
  });

  const reloadList = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListCourses();
      setCourses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reloadList();
  }, [reloadList]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setLessons([]);
  };

  const openEdit = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const detail = await adminGetCourse(id);
      setEditingId(id);
      setForm({
        title: detail.title || "",
        subtitle: detail.subtitle || "",
        coverUrl: detail.coverUrl || "",
        tag: detail.tag || "",
        originalPriceYuan: String(detail.originalPriceYuan ?? ""),
        discountPriceYuan: String(detail.discountPriceYuan ?? ""),
        detailHtml: detail.detailHtml || "",
        subscriberCount: String(detail.subscriberCount ?? 0),
        authorName: detail.authorName || "",
        authorAvatarUrl: detail.authorAvatarUrl || "",
        isPublished: detail.isPublished === true,
        sortOrder: String(detail.sortOrder ?? 0),
      });
      setLessons((detail.lessons as LessonRow[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载课程失败");
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File, dir: string) => {
    const result = await imageUploadService.uploadImageFile(file, {
      dir,
      fileName: file.name,
    });
    if (!result.success || !result.asset?.url) {
      throw new Error(result.error || "上传失败");
    }
    return result.asset.url;
  };

  const uploadVideo = async (file: File) => {
    const result = await uploadToOSS(file, {
      dir: "classroom/videos/",
      fileName: file.name,
      contentType: file.type || "video/mp4",
    });
    if (!result.success || !result.url) {
      throw new Error(result.error || "视频上传失败");
    }
    return result.url;
  };

  const handleSaveCourse = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        coverUrl: form.coverUrl.trim() || null,
        tag: form.tag.trim() || null,
        originalPriceYuan: Number(form.originalPriceYuan),
        discountPriceYuan: Number(form.discountPriceYuan),
        detailHtml: form.detailHtml || null,
        subscriberCount: Number(form.subscriberCount) || 0,
        authorName: form.authorName.trim() || null,
        authorAvatarUrl: form.authorAvatarUrl.trim() || null,
        isPublished: form.isPublished,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editingId) {
        await adminUpdateCourse(editingId, payload);
      } else {
        const created = await adminCreateCourse(payload);
        setEditingId(created.id);
      }
      await reloadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAddLesson = async () => {
    if (!editingId) {
      setError("请先保存课程，再添加目录");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminCreateLesson(editingId, {
        title: lessonDraft.title.trim(),
        type: lessonDraft.type,
        contentHtml: lessonDraft.type === "article" ? lessonDraft.contentHtml : null,
        videoUrl: lessonDraft.type === "video" ? lessonDraft.videoUrl : null,
        isTrial: lessonDraft.isTrial,
        trialSeconds:
          lessonDraft.isTrial && lessonDraft.type === "video"
            ? Number(lessonDraft.trialSeconds) || 0
            : null,
        sortOrder: Number(lessonDraft.sortOrder) || 0,
        isPublished: true,
      });
      const detail = await adminGetCourse(editingId);
      setLessons((detail.lessons as LessonRow[]) || []);
      setLessonDraft({
        title: "",
        type: "article",
        contentHtml: "",
        videoUrl: "",
        isTrial: false,
        trialSeconds: "60",
        sortOrder: String((detail.lessons?.length || 0)),
      });
      await reloadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加课时失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleLessonTrial = async (lesson: LessonRow) => {
    setSaving(true);
    try {
      await adminUpdateLesson(lesson.id, {
        isTrial: !lesson.isTrial,
        trialSeconds: !lesson.isTrial ? lesson.trialSeconds || 60 : null,
      });
      if (editingId) {
        const detail = await adminGetCourse(editingId);
        setLessons((detail.lessons as LessonRow[]) || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新试学失败");
    } finally {
      setSaving(false);
    }
  };

  const removeLesson = async (lessonId: string) => {
    if (!window.confirm("确认删除该课时？")) return;
    setSaving(true);
    try {
      await adminDeleteLesson(lessonId);
      setLessons((prev) => prev.filter((l) => l.id !== lessonId));
      await reloadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  const removeCourse = async (id: string) => {
    if (!window.confirm("确认删除该课程？已购记录会一并清理。")) return;
    setSaving(true);
    try {
      await adminDeleteCourse(id);
      if (editingId === id) openCreate();
      await reloadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <div className="rounded-lg border bg-white p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">课程列表</h3>
            <button
              type="button"
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
              onClick={openCreate}
            >
              新建
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className={`rounded border p-2 text-sm ${
                    editingId === c.id ? "border-blue-400 bg-blue-50" : "border-gray-200"
                  }`}
                >
                  <button
                    type="button"
                    className="w-full text-left font-medium"
                    onClick={() => void openEdit(c.id)}
                  >
                    {c.title}
                  </button>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      ¥{Number(c.discountPriceYuan).toFixed(0)} ·{" "}
                      {c.isPublished ? "已上架" : "草稿"}
                    </span>
                    <button
                      type="button"
                      className="text-red-500"
                      onClick={() => void removeCourse(c.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {courses.length === 0 ? (
                <p className="text-sm text-gray-400">暂无课程</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border bg-white p-4">
          <h3 className="font-semibold">{editingId ? "编辑课程" : "新建课程"}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-gray-600">标题</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-gray-600">副标题</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">原价</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={form.originalPriceYuan}
                onChange={(e) =>
                  setForm((f) => ({ ...f, originalPriceYuan: e.target.value }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">折扣价</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={form.discountPriceYuan}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discountPriceYuan: e.target.value }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">标签</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={form.tag}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">订阅人数展示</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={form.subscriberCount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subscriberCount: e.target.value }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">作者名</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={form.authorName}
                onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">排序</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isPublished: e.target.checked }))
                }
              />
              上架发布
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">课程封面</span>
              <label className="cursor-pointer rounded border px-2 py-1 text-xs">
                上传封面
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void uploadImage(file, "classroom/covers/")
                      .then((url) => setForm((f) => ({ ...f, coverUrl: url })))
                      .catch((err) =>
                        setError(err instanceof Error ? err.message : "封面上传失败")
                      );
                  }}
                />
              </label>
            </div>
            {form.coverUrl ? (
              <img src={form.coverUrl} alt="" className="h-32 rounded object-cover" />
            ) : null}
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="封面 URL"
              value={form.coverUrl}
              onChange={(e) => setForm((f) => ({ ...f, coverUrl: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">作者头像</span>
              <label className="cursor-pointer rounded border px-2 py-1 text-xs">
                上传头像
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void uploadImage(file, "classroom/avatars/")
                      .then((url) =>
                        setForm((f) => ({ ...f, authorAvatarUrl: url }))
                      )
                      .catch((err) =>
                        setError(err instanceof Error ? err.message : "头像上传失败")
                      );
                  }}
                />
              </label>
            </div>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="头像 URL"
              value={form.authorAvatarUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, authorAvatarUrl: e.target.value }))
              }
            />
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">
              详情图文（HTML，图片请先上传后粘贴 URL）
            </span>
            <textarea
              className="min-h-[180px] w-full rounded border px-3 py-2 font-mono text-xs"
              value={form.detailHtml}
              onChange={(e) => setForm((f) => ({ ...f, detailHtml: e.target.value }))}
              placeholder='<img src="https://..." /><p>课程介绍...</p>'
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-blue-600">
            插入详情图片
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void uploadImage(file, "classroom/details/")
                  .then((url) =>
                    setForm((f) => ({
                      ...f,
                      detailHtml: `${f.detailHtml}\n<p><img src="${url}" alt="" style="max-width:100%"/></p>\n`,
                    }))
                  )
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "图片上传失败")
                  );
              }}
            />
          </label>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveCourse()}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存课程"}
          </button>

          <div className="border-t pt-4">
            <h4 className="mb-3 font-semibold">目录管理</h4>
            {!editingId ? (
              <p className="text-sm text-amber-600">先保存课程后再添加目录</p>
            ) : (
              <>
                <div className="mb-3 space-y-2 rounded border bg-gray-50 p-3">
                  <input
                    className="w-full rounded border px-3 py-2 text-sm"
                    placeholder="课时标题"
                    value={lessonDraft.title}
                    onChange={(e) =>
                      setLessonDraft((d) => ({ ...d, title: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={lessonDraft.type === "article"}
                        onChange={() =>
                          setLessonDraft((d) => ({ ...d, type: "article" }))
                        }
                      />
                      图文
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={lessonDraft.type === "video"}
                        onChange={() =>
                          setLessonDraft((d) => ({ ...d, type: "video" }))
                        }
                      />
                      视频
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={lessonDraft.isTrial}
                        onChange={(e) =>
                          setLessonDraft((d) => ({
                            ...d,
                            isTrial: e.target.checked,
                          }))
                        }
                      />
                      试学
                    </label>
                    {lessonDraft.isTrial && lessonDraft.type === "video" ? (
                      <label className="flex items-center gap-1">
                        试看秒数
                        <input
                          className="w-20 rounded border px-2 py-1"
                          value={lessonDraft.trialSeconds}
                          onChange={(e) =>
                            setLessonDraft((d) => ({
                              ...d,
                              trialSeconds: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : null}
                  </div>
                  {lessonDraft.type === "article" ? (
                    <textarea
                      className="min-h-[100px] w-full rounded border px-3 py-2 text-xs"
                      placeholder="图文 HTML"
                      value={lessonDraft.contentHtml}
                      onChange={(e) =>
                        setLessonDraft((d) => ({
                          ...d,
                          contentHtml: e.target.value,
                        }))
                      }
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className="min-w-[240px] flex-1 rounded border px-3 py-2 text-sm"
                        placeholder="视频 URL"
                        value={lessonDraft.videoUrl}
                        onChange={(e) =>
                          setLessonDraft((d) => ({
                            ...d,
                            videoUrl: e.target.value,
                          }))
                        }
                      />
                      <label className="cursor-pointer rounded border bg-white px-2 py-1 text-xs">
                        上传视频
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void uploadVideo(file)
                              .then((url) =>
                                setLessonDraft((d) => ({ ...d, videoUrl: url }))
                              )
                              .catch((err) =>
                                setError(
                                  err instanceof Error ? err.message : "视频上传失败"
                                )
                              );
                          }}
                        />
                      </label>
                    </div>
                  )}
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white"
                    disabled={saving}
                    onClick={() => void handleAddLesson()}
                  >
                    添加课时
                  </button>
                </div>

                <div className="divide-y rounded border">
                  {lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                    >
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                        {lesson.type === "video" ? "视频" : "图文"}
                      </span>
                      <span className="flex-1">{lesson.title}</span>
                      {lesson.isTrial ? (
                        <span className="text-xs text-blue-600">
                          试学
                          {lesson.trialSeconds ? ` ${lesson.trialSeconds}s` : ""}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs text-blue-600"
                        onClick={() => void toggleLessonTrial(lesson)}
                      >
                        {lesson.isTrial ? "取消试学" : "设为试学"}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-500"
                        onClick={() => void removeLesson(lesson.id)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  {lessons.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-gray-400">
                      暂无课时
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
