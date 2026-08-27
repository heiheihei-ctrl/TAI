export type CourseLessonType = 'article' | 'video';

export interface CreateCourseDto {
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  tag?: string | null;
  originalPriceYuan: number;
  discountPriceYuan: number;
  detailHtml?: string | null;
  subscriberCount?: number;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  isPublished?: boolean;
  sortOrder?: number;
}

export type UpdateCourseDto = Partial<CreateCourseDto>;

export interface CreateCourseLessonDto {
  title: string;
  type: CourseLessonType;
  contentHtml?: string | null;
  videoUrl?: string | null;
  sortOrder?: number;
  isTrial?: boolean;
  trialSeconds?: number | null;
  isPublished?: boolean;
}

export type UpdateCourseLessonDto = Partial<CreateCourseLessonDto>;

export interface CreateCourseOrderDto {
  courseId: string;
  paymentMethod: 'alipay' | 'wechat';
}
