import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawMessage =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : (rawMessage as any).message ?? 'Internal server error';

    if (status >= 500) {
      this.logger.error(
        `[${(req as any).requestId ?? '-'}] ${req.method} ${req.path} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const path = (req.originalUrl ?? '/').split('?')[0];
    res.status(status).json({
      statusCode: status,
      message,
      requestId: (req as any).requestId ?? null,
      timestamp: new Date().toISOString(),
      path,
    });
  }
}
