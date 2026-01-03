import { type Request, type Response, type NextFunction } from "express";
import { validationResult } from "express-validator";

export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({
      error: "Errores de validación",
      errors: errors.array(),
    });
    return;
  }

  next();
}

