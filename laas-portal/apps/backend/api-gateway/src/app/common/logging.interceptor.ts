import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const { method, originalUrl } = req;
    const reqPath = (originalUrl ?? '/').split('?')[0];
    const requestId = req.requestId ?? '-';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = ctx.switchToHttp().getResponse();
        const latency = Date.now() - start;
        this.logger.log(`[${requestId}] ${method} ${reqPath} → ${res.statusCode} (${latency}ms)`);
      }),
    );
  }
}
