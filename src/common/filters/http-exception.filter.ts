import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  formatStructuredLogLine,
  RequestWithContext,
  sanitizePathForLog,
} from '../logging/request-context';

/**
 * Normalizes HTTP and unexpected errors while ensuring secrets, tokens,
 * and raw database internals are never leaked in client error payloads.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();
    const cleanPath = sanitizePathForLog(request?.originalUrl ?? request?.url);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resBody = exception.getResponse();
      if (typeof resBody === 'string') {
        message = resBody;
      } else if (resBody && typeof resBody === 'object') {
        const record = resBody as Record<string, unknown>;
        if (typeof record.message === 'string' || Array.isArray(record.message)) {
          message = record.message as string | string[];
        }
        if (typeof record.error === 'string') {
          error = record.error;
        }
      }
      if (error === 'Internal Server Error') {
        error = HttpStatus[status] ?? 'Error';
      }
    } else {
      const safeSummary =
        exception instanceof Error ? exception.name : 'UnknownError';
      this.logger.error(
        formatStructuredLogLine({
          level: 'error',
          type: 'unhandled_exception',
          requestId: request?.requestId,
          method: request?.method ?? 'UNKNOWN',
          path: cleanPath,
          statusCode: status,
          message: `Unhandled exception (${safeSummary})`,
        }),
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: cleanPath,
      ...(request?.requestId ? { requestId: request.requestId } : {}),
      timestamp: new Date().toISOString(),
    });
  }
}
