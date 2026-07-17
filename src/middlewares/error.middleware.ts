import { type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';

interface ErrorResponseBody {
  status: 'error';
  error: string;
  message: string;
  stack?: string;
}

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.status : 500;
  const message =
    err instanceof Error ? err.message : 'Ocurrió un error inesperado en el servidor';

  // Solo logueamos los errores no controlados (no operacionales)
  if (!isAppError) {
    console.error('🔥 Error inesperado:', err);
  }

  const body: ErrorResponseBody = {
    status: 'error',
    error: message,
    message,
  };

  if (process.env.NODE_ENV === 'development' && err instanceof Error && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};
