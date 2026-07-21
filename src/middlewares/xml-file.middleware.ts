import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';
import type { AuthRequest } from './auth.middleware.js';

export const normalizeXmlFile: RequestHandler = (req, _res, next) => {
  const authRequest = req as AuthRequest;
  const file = req.files?.xml;
  if (!file) throw new AppError('Archivo XML no encontrado', 400);
  if (Array.isArray(file)) throw new AppError('Solo se permite un archivo XML', 400);
  if (!file.name.toLowerCase().endsWith('.xml'))
    throw new AppError('El archivo debe ser en formato XML', 400);

  authRequest.xmlFile = file;
  authRequest.xmlBuffer = Buffer.isBuffer(file.data)
    ? file.data
    : Buffer.from(file.data as ArrayBuffer);
  next();
};
