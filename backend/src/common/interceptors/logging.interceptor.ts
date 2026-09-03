import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

// 请求日志：记录 method / url / 状态码 / 耗时。
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method: string; url: string; headers: Record<string, string | undefined> }>();
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`${req.method} ${req.url} ${Date.now() - start}ms`),
        error: () => this.logger.warn(`${req.method} ${req.url} ${Date.now() - start}ms failed`),
      }),
    );
  }
}
