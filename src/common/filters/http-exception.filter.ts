import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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
    const request = ctx.getRequest<Request>();

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
        `Unhandled exception (${safeSummary}) on ${request?.method ?? 'UNKNOWN'} ${request?.url ?? ''}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request?.url ?? '',
      timestamp: new Date().toISOString(),
    });
  }
}
