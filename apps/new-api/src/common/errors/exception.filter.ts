import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error',
          };

    const normalized =
      typeof payload === 'string'
        ? { code: 'HTTP_EXCEPTION', message: payload }
        : (payload as Record<string, unknown>);

    if (status >= 500) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      error: {
        code: normalized.code ?? 'UNKNOWN_ERROR',
        message: normalized.message ?? 'Unknown error',
        details: normalized.details,
        requestId: request.requestId,
      },
    });
  }
}
