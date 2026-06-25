import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AuditService } from '../../modules/audit/audit.service';

type LoggedRequest = Request & {
  requestId?: string;
};

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<LoggedRequest>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    request.requestId = request.header('x-request-id') ?? randomUUID();
    response.setHeader('x-request-id', request.requestId);

    const persist = async (statusCode: number, errorMessage?: string): Promise<void> => {
      await this.auditService.logRequest({
        requestId: request.requestId ?? randomUUID(),
        path: request.path,
        method: request.method,
        modelKey: typeof request.body?.model === 'string' ? request.body.model : undefined,
        statusCode,
        latencyMs: Date.now() - startedAt,
        success: statusCode < 400,
        errorMessage,
      });
    };

    return next.handle().pipe(
      tap(() => {
        void persist(response.statusCode || 200);
      }),
      catchError((error: unknown) => {
        const statusCode =
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof (error as { status?: number }).status === 'number'
            ? (error as { status: number }).status
            : 500;
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Unknown error';
        void persist(statusCode, message);
        return throwError(() => error);
      }),
    );
  }
}
