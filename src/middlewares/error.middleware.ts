import { type Request, type Response, type NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('🔥 Error inesperado:', err);

  //manejamos errores específicos aquí...
  const statusCode = err.status || 500;
  const message = err.message || 'Ocurrió un error inesperado en el servidor';

  res.status(statusCode).json({
    status: 'error',
    message,
    //solo para el stack en desarrollo
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
