import { fetchWithAuth } from "./authFetch";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "http://localhost:4000";

const buildUrl = (path: string) => {
  const base = API_BASE.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${base}/${p}`;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

async function request(path: string, options: RequestInit = {}, auth = true) {
  const url = buildUrl(path);
  const response = auth
    ? await fetchWithAuth(url, options)
    : await fetch(url, { ...options, credentials: "omit" });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const data = await response.json();
      message = data?.message || data?.error || message;
      if (Array.isArray(message)) message = message.join("; ");
    } catch {
      // ignore
    }
    throw new Error(String(message));
  }
  if (response.status === 204) return null;
  return response.json();
}

export type ClassroomCourse = {
  id: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  tag?: string | null;
  originalPriceYuan: number;
  discountPriceYuan: number;
  detailHtml?: string | null;
  subscriberCount: number;
  episodeCount: number;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  isPublished?: boolean;
  sortOrder?: number;
  purchased?: boolean;
  related?: ClassroomCourse[];
};

export type ClassroomLessonMeta = {
  id: string;
  title: string;
  type: "article" | "video";
  sortOrder: number;
  isTrial: boolean;
  trialSeconds?: number | null;
  locked: boolean;
};

export type ClassroomLessonContent = {
  id: string;
  courseId: string;
  title: string;
  type: "article" | "video";
  contentHtml?: string | null;
  videoUrl?: string | null;
  isTrial: boolean;
  trialSeconds?: number | null;
  purchased: boolean;
};

export type ClassroomPurchase = {
  id: string;
  paidAt: string;
  orderNo?: string | null;
  course: ClassroomCourse;
};

export type ClassroomOrderResponse = {
  orderId: string;
  orderNo: string;
  amount: number;
  credits: number;
  paymentMethod: "alipay" | "wechat";
  orderType: string;
  status: string;
  qrCodeUrl: string | null;
  expiredAt: string;
  createdAt: string;
};

export async function listClassroomCourses(): Promise<ClassroomCourse[]> {
  return request("/api/classroom/courses", {}, false);
}

export async function getClassroomCourse(id: string): Promise<ClassroomCourse> {
  return request(`/api/classroom/courses/${encodeURIComponent(id)}`);
}

export async function listClassroomLessons(
  courseId: string
): Promise<{ purchased: boolean; lessons: ClassroomLessonMeta[] }> {
  return request(`/api/classroom/courses/${encodeURIComponent(courseId)}/lessons`);
}

export async function getClassroomLessonContent(
  lessonId: string
): Promise<ClassroomLessonContent> {
  return request(`/api/classroom/lessons/${encodeURIComponent(lessonId)}/content`);
}

export async function listMyClassroomPurchases(): Promise<ClassroomPurchase[]> {
  return request("/api/classroom/my-purchases");
}

export async function createClassroomOrder(data: {
  courseId: string;
  paymentMethod: "alipay" | "wechat";
}): Promise<ClassroomOrderResponse> {
  return request("/api/classroom/orders", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

// Admin
export async function adminListCourses(): Promise<ClassroomCourse[]> {
  return request("/api/classroom/admin/courses");
}

export async function adminGetCourse(id: string): Promise<
  ClassroomCourse & {
    lessons: Array<{
      id: string;
      title: string;
      type: "article" | "video";
      contentHtml?: string | null;
      videoUrl?: string | null;
      sortOrder: number;
      isTrial: boolean;
      trialSeconds?: number | null;
      isPublished: boolean;
    }>;
  }
> {
  return request(`/api/classroom/admin/courses/${encodeURIComponent(id)}`);
}

export async function adminCreateCourse(
  data: Record<string, unknown>
): Promise<ClassroomCourse> {
  return request("/api/classroom/admin/courses", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export async function adminUpdateCourse(
  id: string,
  data: Record<string, unknown>
): Promise<ClassroomCourse> {
  return request(`/api/classroom/admin/courses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export async function adminDeleteCourse(id: string): Promise<{ success: boolean }> {
  return request(`/api/classroom/admin/courses/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function adminCreateLesson(
  courseId: string,
  data: Record<string, unknown>
) {
  return request(
    `/api/classroom/admin/courses/${encodeURIComponent(courseId)}/lessons`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
    }
  );
}

export async function adminUpdateLesson(
  lessonId: string,
  data: Record<string, unknown>
) {
  return request(`/api/classroom/admin/lessons/${encodeURIComponent(lessonId)}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export async function adminDeleteLesson(lessonId: string) {
  return request(`/api/classroom/admin/lessons/${encodeURIComponent(lessonId)}`, {
    method: "DELETE",
  });
}
