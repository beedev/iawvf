import { randomUUID } from 'node:crypto';
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
 * RFC 7807 "Problem Details" payload (application/problem+json).
 */
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  traceId: string;
}

/**
 * Global exception filter that converts every error into an RFC 7807
 * problem+json response.
 *
 * Security posture:
 *  - Never serializes stack traces, secrets, or internal error messages for
 *    5xx responses (a generic detail is returned instead).
 *  - For 4xx HttpExceptions the (safe, developer-authored) message is surfaced
 *    so clients get actionable validation feedback.
 *  - A per-request traceId correlates the client-visible error with server logs.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = this.resolveTraceId(request);

    const { status, title, detail } = this.normalize(exception);

    const isServerError = status >= 500;
    if (isServerError) {
      // Full detail goes to logs only, correlated by traceId. Never to client.
      this.logger.error(
        `[${traceId}] ${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${traceId}] ${request.method} ${request.url} -> ${status}`,
      );
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title,
      status,
      detail,
      traceId,
    };

    response
      .status(status)
      .setHeader('Content-Type', 'application/problem+json')
      .json(problem);
  }

  private resolveTraceId(request: Request): string {
    const header = request.headers['x-request-id'];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }
    if (Array.isArray(header) && header.length > 0) {
      return header[0];
    }
    return randomUUID();
  }

  private normalize(exception: unknown): {
    status: number;
    title: string;
    detail: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const responseBody = exception.getResponse();
      return {
        status,
        title: this.titleFor(status),
        detail: this.extractDetail(responseBody, exception.message),
      };
    }

    // Unknown/unexpected error: do not leak anything.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: this.titleFor(HttpStatus.INTERNAL_SERVER_ERROR),
      detail: 'An unexpected error occurred.',
    };
  }

  private extractDetail(
    responseBody: string | object,
    fallback: string,
  ): string {
    if (typeof responseBody === 'string') {
      return responseBody;
    }
    const body = responseBody as { message?: unknown };
    if (Array.isArray(body.message)) {
      return body.message
        .filter((m): m is string => typeof m === 'string')
        .join('; ');
    }
    if (typeof body.message === 'string') {
      return body.message;
    }
    return fallback;
  }

  private titleFor(status: number): string {
    const titles: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
    };
    return titles[status] ?? 'Error';
  }
}
