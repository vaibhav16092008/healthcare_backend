import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log the actual internal exception for server debugging
    if (!isHttpException) {
      this.logger.error(
        `Unhandled Exception on ${request.method} ${request.url}:`,
        exception instanceof Error ? exception.stack : exception,
      );
    }

    // In production or for unexpected non-HttpExceptions, sanitize error response payload
    const isProduction = process.env.NODE_ENV === 'production';

    if (isHttpException) {
      const resPayload = exception.getResponse();
      if (typeof resPayload === 'object' && resPayload !== null) {
        response.status(status).json(resPayload);
      } else {
        response.status(status).json({
          statusCode: status,
          message: resPayload,
          timestamp: new Date().toISOString(),
          path: request.url,
        });
      }
    } else {
      // Hide stack traces, SQL errors, and internal database details
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: isProduction ? 'Internal server error' : 'Internal server error',
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }
  }
}
