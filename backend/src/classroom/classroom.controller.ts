import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard';
import { PaymentMethod } from '../payment/dto/payment.dto';
import { ClassroomService } from './classroom.service';
import type {
  CreateCourseDto,
  CreateCourseLessonDto,
  CreateCourseOrderDto,
  UpdateCourseDto,
  UpdateCourseLessonDto,
} from './dto/classroom.dto';

interface AuthUser {
  id?: string;
  sub?: string;
  role?: string;
}

const userIdOf = (user?: AuthUser | null) =>
  (typeof user?.id === 'string' && user.id) ||
  (typeof user?.sub === 'string' && user.sub) ||
  null;

@ApiTags('TAI课堂')
@Controller('classroom')
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService) {}

  @Get('courses')
  @ApiOperation({ summary: '已发布课程列表' })
  listCourses() {
    return this.classroom.listPublishedCourses();
  }

  @Get('courses/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '课程详情' })
  getCourse(
    @Param('id') id: string,
    @Request() req: FastifyRequest & { user?: AuthUser | null },
  ) {
    return this.classroom.getPublishedCourse(id, userIdOf(req.user));
  }

  @Get('courses/:id/lessons')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '课程目录' })
  listLessons(
    @Param('id') id: string,
    @Request() req: FastifyRequest & { user?: AuthUser | null },
  ) {
    return this.classroom.listLessonsForUser(id, userIdOf(req.user));
  }

  @Get('lessons/:lessonId/content')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '课时内容（需已购或试学）' })
  getLessonContent(
    @Param('lessonId') lessonId: string,
    @Request() req: FastifyRequest & { user?: AuthUser | null },
  ) {
    return this.classroom.getLessonContent(lessonId, userIdOf(req.user));
  }

  @Get('my-purchases')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的已购课程' })
  myPurchases(@Request() req: FastifyRequest & { user: AuthUser }) {
    const userId = userIdOf(req.user);
    return this.classroom.listMyPurchases(userId!);
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建课程购买订单' })
  createOrder(
    @Body() dto: CreateCourseOrderDto,
    @Request() req: FastifyRequest & { user: AuthUser },
  ) {
    const userId = userIdOf(req.user)!;
    const method =
      dto.paymentMethod === 'alipay' ? PaymentMethod.ALIPAY : PaymentMethod.WECHAT;
    return this.classroom.createCourseOrder(
      userId,
      dto.courseId,
      method,
      req.user.role,
    );
  }

  // —— Admin ——

  @Get('admin/courses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  adminList(@Request() req: FastifyRequest & { user: AuthUser }) {
    return this.classroom.adminListCourses(req.user.role);
  }

  @Get('admin/courses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  adminGet(
    @Param('id') id: string,
    @Request() req: FastifyRequest & { user: AuthUser },
  ) {
    return this.classroom.adminGetCourse(id, req.user.role);
  }

  @Post('admin/courses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  adminCreate(
    @Body() dto: CreateCourseDto,
    @Request() req: FastifyRequest & { user: AuthUser },
  ) {
    return this.classroom.adminCreateCourse(dto, req.user.role);
  }

  @Patch('admin/courses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  adminUpdate(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @Request() req: FastifyRequest & { user: AuthUser },
  ) {
    return this.classroom.adminUpdateCourse(id, dto, req.user.role);
  }

  @Delete('admin/courses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  adminDelete(
    @Param('id') id: string,
    @Request() req: FastifyRequest & { user: AuthUser },
  ) {
    return this.classroom.adminDeleteCourse(id, req.user.role);
  }

  @Post('admin/courses/:courseId/lessons')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  adminCreateLesson(
    @Param('courseId') courseId: string,
    @Body() dto: CreateCourseLessonDto,
    @Request() req: FastifyRequest & { user: AuthUser },
  ) {
    return this.classroom.adminCreateLesson(courseId, dto, req.user.role);
  }

  @Patch('admin/lessons/:lessonId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  adminUpdateLesson(
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateCourseLessonDto,
    @Request() req: FastifyRequest & { user: AuthUser },
  ) {
    return this.classroom.adminUpdateLesson(lessonId, dto, req.user.role);
  }

  @Delete('admin/lessons/:lessonId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  adminDeleteLesson(
    @Param('lessonId') lessonId: string,
    @Request() req: FastifyRequest & { user: AuthUser },
  ) {
    return this.classroom.adminDeleteLesson(lessonId, req.user.role);
  }
}
