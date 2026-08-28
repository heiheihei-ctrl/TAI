import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { PaymentMethod } from '../payment/dto/payment.dto';
import type {
  CreateCourseDto,
  CreateCourseLessonDto,
  UpdateCourseDto,
  UpdateCourseLessonDto,
} from './dto/classroom.dto';

const money = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException('价格无效');
  }
  return Math.round(n * 100) / 100;
};

@Injectable()
export class ClassroomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  private assertAdmin(role?: string | null) {
    const normalized = typeof role === 'string' ? role.toLowerCase() : '';
    if (normalized !== 'admin' && normalized !== 'normal_admin') {
      throw new ForbiddenException('需要管理员权限');
    }
  }

  private mapCoursePublic(course: {
    id: string;
    title: string;
    subtitle: string | null;
    coverUrl: string | null;
    tag: string | null;
    originalPriceYuan: Prisma.Decimal | number;
    discountPriceYuan: Prisma.Decimal | number;
    detailHtml?: string | null;
    materialsHtml?: string | null;
    subscriberCount: number;
    episodeCount: number;
    authorName: string | null;
    authorAvatarUrl: string | null;
    isPublished?: boolean;
    sortOrder?: number;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      coverUrl: course.coverUrl,
      tag: course.tag,
      originalPriceYuan: Number(course.originalPriceYuan),
      discountPriceYuan: Number(course.discountPriceYuan),
      detailHtml: course.detailHtml ?? undefined,
      materialsHtml: course.materialsHtml ?? undefined,
      subscriberCount: course.subscriberCount,
      episodeCount: course.episodeCount,
      authorName: course.authorName,
      authorAvatarUrl: course.authorAvatarUrl,
      isPublished: course.isPublished,
      sortOrder: course.sortOrder,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  }

  async listPublishedCourses() {
    const courses = await this.prisma.course.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return courses.map((c) => this.mapCoursePublic(c));
  }

  async getPublishedCourse(id: string, userId?: string | null) {
    const course = await this.prisma.course.findFirst({
      where: { id, isPublished: true },
    });
    if (!course) throw new NotFoundException('课程不存在');

    const purchased = userId
      ? Boolean(
          await this.prisma.coursePurchase.findUnique({
            where: { userId_courseId: { userId, courseId: id } },
          }),
        )
      : false;

    const related = await this.prisma.course.findMany({
      where: { isPublished: true, id: { not: id } },
      orderBy: [{ sortOrder: 'asc' }, { subscriberCount: 'desc' }],
      take: 6,
    });

    return {
      ...this.mapCoursePublic(course),
      purchased,
      related: related.map((c) => this.mapCoursePublic(c)),
    };
  }

  async listLessonsForUser(courseId: string, userId?: string | null) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, isPublished: true },
    });
    if (!course) throw new NotFoundException('课程不存在');

    const purchased = userId
      ? Boolean(
          await this.prisma.coursePurchase.findUnique({
            where: { userId_courseId: { userId, courseId } },
          }),
        )
      : false;

    const lessons = await this.prisma.courseLesson.findMany({
      where: { courseId, isPublished: true, type: 'video' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      purchased,
      lessons: lessons.map((lesson) => {
        const unlocked = purchased || lesson.isTrial;
        return {
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          sortOrder: lesson.sortOrder,
          isTrial: lesson.isTrial,
          trialSeconds: lesson.isTrial ? lesson.trialSeconds : null,
          locked: !unlocked,
        };
      }),
    };
  }

  async getLessonContent(lessonId: string, userId?: string | null) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson || !lesson.isPublished || !lesson.course.isPublished) {
      throw new NotFoundException('课时不存在');
    }

    const purchased = userId
      ? Boolean(
          await this.prisma.coursePurchase.findUnique({
            where: {
              userId_courseId: { userId, courseId: lesson.courseId },
            },
          }),
        )
      : false;

    if (!purchased && !lesson.isTrial) {
      throw new ForbiddenException('请先购买课程');
    }

    return {
      id: lesson.id,
      courseId: lesson.courseId,
      title: lesson.title,
      type: lesson.type,
      contentHtml: lesson.type === 'article' ? lesson.contentHtml : null,
      videoUrl: lesson.type === 'video' ? lesson.videoUrl : null,
      isTrial: lesson.isTrial,
      trialSeconds:
        !purchased && lesson.isTrial && lesson.type === 'video'
          ? lesson.trialSeconds
          : null,
      purchased,
    };
  }

  async createCourseOrder(
    userId: string,
    courseId: string,
    paymentMethod: PaymentMethod,
    userRole?: string | null,
  ) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, isPublished: true },
    });
    if (!course) throw new NotFoundException('课程不存在');

    const existing = await this.prisma.coursePurchase.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) {
      throw new BadRequestException('您已购买该课程');
    }

    const amount = money(course.discountPriceYuan);
    if (amount <= 0) {
      throw new BadRequestException('课程价格无效');
    }

    return this.paymentService.createOrder(
      userId,
      {
        amount,
        credits: 0,
        paymentMethod,
        orderType: 'course',
        metadata: {
          courseId: course.id,
          courseTitle: course.title,
        },
      },
      userRole,
    );
  }

  async listMyPurchases(userId: string) {
    const rows = await this.prisma.coursePurchase.findMany({
      where: { userId },
      include: { course: true },
      orderBy: { paidAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      paidAt: row.paidAt,
      orderNo: row.orderNo,
      course: this.mapCoursePublic(row.course),
    }));
  }

  // —— Admin ——

  async adminListCourses(role?: string | null) {
    this.assertAdmin(role);
    const courses = await this.prisma.course.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { lessons: true, purchases: true } } },
    });
    return courses.map((c) => ({
      ...this.mapCoursePublic(c),
      lessonCount: c._count.lessons,
      purchaseCount: c._count.purchases,
    }));
  }

  async adminGetCourse(id: string, role?: string | null) {
    this.assertAdmin(role);
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        lessons: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!course) throw new NotFoundException('课程不存在');
    return {
      ...this.mapCoursePublic(course),
      lessons: course.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        contentHtml: lesson.contentHtml,
        videoUrl: lesson.videoUrl,
        sortOrder: lesson.sortOrder,
        isTrial: lesson.isTrial,
        trialSeconds: lesson.trialSeconds,
        isPublished: lesson.isPublished,
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      })),
    };
  }

  async adminCreateCourse(dto: CreateCourseDto, role?: string | null) {
    this.assertAdmin(role);
    if (!dto.title?.trim()) throw new BadRequestException('标题不能为空');
    const original = money(dto.originalPriceYuan);
    const discount = money(dto.discountPriceYuan);
    if (discount > original) {
      throw new BadRequestException('折扣价不能高于原价');
    }
    const course = await this.prisma.course.create({
      data: {
        title: dto.title.trim(),
        subtitle: dto.subtitle?.trim() || null,
        coverUrl: dto.coverUrl?.trim() || null,
        tag: dto.tag?.trim() || null,
        originalPriceYuan: original,
        discountPriceYuan: discount,
        detailHtml: dto.detailHtml || null,
        materialsHtml: dto.materialsHtml || null,
        subscriberCount: 0,
        authorName: dto.authorName?.trim() || null,
        authorAvatarUrl: dto.authorAvatarUrl?.trim() || null,
        isPublished: dto.isPublished === true,
        sortOrder: Math.floor(dto.sortOrder ?? 0),
      },
    });
    return this.mapCoursePublic(course);
  }

  async adminUpdateCourse(
    id: string,
    dto: UpdateCourseDto,
    role?: string | null,
  ) {
    this.assertAdmin(role);
    const existing = await this.prisma.course.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('课程不存在');

    const data: Prisma.CourseUpdateInput = {};
    if (dto.title !== undefined) {
      if (!dto.title.trim()) throw new BadRequestException('标题不能为空');
      data.title = dto.title.trim();
    }
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle?.trim() || null;
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl?.trim() || null;
    if (dto.tag !== undefined) data.tag = dto.tag?.trim() || null;
    if (dto.originalPriceYuan !== undefined) {
      data.originalPriceYuan = money(dto.originalPriceYuan);
    }
    if (dto.discountPriceYuan !== undefined) {
      data.discountPriceYuan = money(dto.discountPriceYuan);
    }
    if (dto.detailHtml !== undefined) data.detailHtml = dto.detailHtml || null;
    if (dto.materialsHtml !== undefined) data.materialsHtml = dto.materialsHtml || null;
    if (dto.authorName !== undefined) {
      data.authorName = dto.authorName?.trim() || null;
    }
    if (dto.authorAvatarUrl !== undefined) {
      data.authorAvatarUrl = dto.authorAvatarUrl?.trim() || null;
    }
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished === true;
    if (dto.sortOrder !== undefined) data.sortOrder = Math.floor(dto.sortOrder);

    const original =
      dto.originalPriceYuan !== undefined
        ? money(dto.originalPriceYuan)
        : Number(existing.originalPriceYuan);
    const discount =
      dto.discountPriceYuan !== undefined
        ? money(dto.discountPriceYuan)
        : Number(existing.discountPriceYuan);
    if (discount > original) {
      throw new BadRequestException('折扣价不能高于原价');
    }

    const course = await this.prisma.course.update({ where: { id }, data });
    return this.mapCoursePublic(course);
  }

  async adminDeleteCourse(id: string, role?: string | null) {
    this.assertAdmin(role);
    const existing = await this.prisma.course.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('课程不存在');
    await this.prisma.course.delete({ where: { id } });
    return { success: true };
  }

  private async refreshEpisodeCount(courseId: string) {
    const count = await this.prisma.courseLesson.count({
      where: { courseId, isPublished: true, type: 'video' },
    });
    await this.prisma.course.update({
      where: { id: courseId },
      data: { episodeCount: count },
    });
  }

  async adminCreateLesson(
    courseId: string,
    dto: CreateCourseLessonDto,
    role?: string | null,
  ) {
    this.assertAdmin(role);
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课程不存在');
    if (!dto.title?.trim()) throw new BadRequestException('课时标题不能为空');
    if (dto.type !== 'article' && dto.type !== 'video') {
      throw new BadRequestException('课时类型无效');
    }
    if (dto.type === 'video' && !dto.videoUrl?.trim()) {
      throw new BadRequestException('视频课时需要 videoUrl');
    }
    if (dto.type === 'article' && !dto.contentHtml?.trim()) {
      throw new BadRequestException('图文课时需要 contentHtml');
    }

    const lesson = await this.prisma.courseLesson.create({
      data: {
        courseId,
        title: dto.title.trim(),
        type: dto.type,
        contentHtml: dto.type === 'article' ? dto.contentHtml || null : null,
        videoUrl: dto.type === 'video' ? dto.videoUrl?.trim() || null : null,
        sortOrder: Math.floor(dto.sortOrder ?? 0),
        isTrial: dto.isTrial === true,
        trialSeconds:
          dto.isTrial === true && dto.type === 'video' && dto.trialSeconds != null
            ? Math.max(0, Math.floor(dto.trialSeconds))
            : null,
        isPublished: dto.isPublished !== false,
      },
    });
    await this.refreshEpisodeCount(courseId);
    return lesson;
  }

  async adminUpdateLesson(
    lessonId: string,
    dto: UpdateCourseLessonDto,
    role?: string | null,
  ) {
    this.assertAdmin(role);
    const existing = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
    });
    if (!existing) throw new NotFoundException('课时不存在');

    const nextType = dto.type ?? (existing.type as 'article' | 'video');
    if (nextType !== 'article' && nextType !== 'video') {
      throw new BadRequestException('课时类型无效');
    }

    const data: Prisma.CourseLessonUpdateInput = {};
    if (dto.title !== undefined) {
      if (!dto.title.trim()) throw new BadRequestException('课时标题不能为空');
      data.title = dto.title.trim();
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.contentHtml !== undefined) data.contentHtml = dto.contentHtml || null;
    if (dto.videoUrl !== undefined) data.videoUrl = dto.videoUrl?.trim() || null;
    if (dto.sortOrder !== undefined) data.sortOrder = Math.floor(dto.sortOrder);
    if (dto.isTrial !== undefined) data.isTrial = dto.isTrial === true;
    if (dto.trialSeconds !== undefined) {
      data.trialSeconds =
        dto.trialSeconds == null ? null : Math.max(0, Math.floor(dto.trialSeconds));
    }
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished === true;

    const lesson = await this.prisma.courseLesson.update({
      where: { id: lessonId },
      data,
    });
    await this.refreshEpisodeCount(existing.courseId);
    return lesson;
  }

  async adminDeleteLesson(lessonId: string, role?: string | null) {
    this.assertAdmin(role);
    const existing = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
    });
    if (!existing) throw new NotFoundException('课时不存在');
    await this.prisma.courseLesson.delete({ where: { id: lessonId } });
    await this.refreshEpisodeCount(existing.courseId);
    return { success: true };
  }
}
