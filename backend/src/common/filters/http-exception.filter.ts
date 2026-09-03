import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AppError, ErrorCodes } from '../errors.js';

// 全局异常过滤器：将 HttpException / AppError / 未知错误统一为 { code, message, details? }。
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method: string; url: string; id?: string }>();

    let statusCode: number;
    let code: string;
    let message: string;
    let details: unknown;

    if (exception instanceof AppError) {
      statusCode = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = statusCode >= 500 ? ErrorCodes.INTERNAL_ERROR : ErrorCodes.VALIDATION_FAILED;
      } else {
        const b = body as { message?: string | string[]; error?: string };
        message = Array.isArray(b.message) ? b.message.join('; ') : (b.message ?? exception.message);
        code = statusCode >= 500 ? ErrorCodes.INTERNAL_ERROR : (b.error ?? ErrorCodes.VALIDATION_FAILED);
        details = b;
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      code = ErrorCodes.INTERNAL_ERROR;
      message = exception instanceof Error ? exception.message : 'Internal server error';
    }

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${statusCode} ${code}: ${message}`);
    }

    response.status(statusCode).json({
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
