import { type Request, type Response, type NextFunction } from "express";
import { validationResult } from "express-validator";

export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Formatear errores de manera más amigable
    const formattedErrors = errors.array().map((err) => ({
      field: err.type === "field" ? err.path : undefined,
      message: err.msg,
    }));

    // Si hay un solo error, retornarlo directamente
    if (formattedErrors.length === 1) {
      res.status(400).json({
        error: formattedErrors[0].message,
        field: formattedErrors[0].field,
      });
      return;
    }

    // Si hay múltiples errores, retornarlos todos
    res.status(400).json({
      error: "Errores de validación",
      message: "Por favor corrige los siguientes errores",
      errors: formattedErrors,
    });
    return;
  }

  next();
}

