import React from "react";
import { useNavigate } from "react-router-dom";
import type { ClassroomCourse } from "@/services/classroomApi";

type Props = {
  course: ClassroomCourse;
};

export function CourseCard({ course }: Props) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="group flex w-full flex-col overflow-hidden rounded-lg bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      onClick={() => navigate(`/classroom/${course.id}`)}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-200">
        {course.coverUrl ? (
          <img
            src={course.coverUrl}
            alt={course.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            暂无封面
          </div>
        )}
        {course.tag ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-white">
            {course.tag}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
          {course.title}
        </h3>
        <p className="mt-auto pt-2 text-xs text-slate-400">
          {course.subscriberCount || 0}人订阅
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-red-500">
            ¥ {Number(course.discountPriceYuan).toFixed(2)}
          </span>
          {Number(course.originalPriceYuan) > Number(course.discountPriceYuan) ? (
            <span className="text-xs text-slate-400 line-through">
              ¥ {Number(course.originalPriceYuan).toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
