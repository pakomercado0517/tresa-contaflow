import { type Response, type NextFunction } from "express";
import type { AuthRequest } from "./auth.middleware.js";
import { PlanLimitsService } from "../services/plan-limits.service.js";

/**
 * Middleware para validar límite de perfiles antes de crear uno nuevo
 */
export function validateProfileLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Usuario no autenticado" });
    return;
  }

  const limitsService = new PlanLimitsService();

  limitsService
    .canCreateProfile(userId)
    .then((result) => {
      if (!result.allowed) {
        res.status(403).json({
          error: "Límite de plan alcanzado",
          message: result.reason,
          limit: result.limit,
          currentCount: result.currentCount,
        });
        return;
      }

      // Agregar información del límite al request para uso posterior
      (req as any).profileLimit = result;
      next();
    })
    .catch((error) => {
      console.error("Error al validar límite de perfiles:", error);
      res.status(500).json({ error: "Error al validar límite de plan" });
    });
}

/**
 * Middleware para validar límite de facturas antes de crear una nueva
 */
export function validateInvoiceLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Usuario no autenticado" });
    return;
  }

  // Obtener profileId del body o params
  const profileId = req.body.profileId || req.params.profileId;

  if (!profileId) {
    res.status(400).json({ error: "profileId es requerido" });
    return;
  }

  const limitsService = new PlanLimitsService();

  limitsService
    .canCreateInvoice(userId, profileId)
    .then((result) => {
      if (!result.allowed) {
        res.status(403).json({
          error: "Límite de plan alcanzado",
          message: result.reason,
          limit: result.limit,
          currentCount: result.currentCount,
        });
        return;
      }

      // Agregar información del límite al request para uso posterior
      (req as any).invoiceLimit = result;
      next();
    })
    .catch((error) => {
      console.error("Error al validar límite de facturas:", error);
      res.status(500).json({ error: "Error al validar límite de plan" });
    });
}

/**
 * Middleware para validar límite de gastos antes de crear uno nuevo
 */
export function validateExpenseLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Usuario no autenticado" });
    return;
  }

  // Obtener profileId del body o params
  const profileId = req.body.profileId || req.params.profileId;

  if (!profileId) {
    res.status(400).json({ error: "profileId es requerido" });
    return;
  }

  const limitsService = new PlanLimitsService();

  limitsService
    .canCreateExpense(userId, profileId)
    .then((result) => {
      if (!result.allowed) {
        res.status(403).json({
          error: "Límite de plan alcanzado",
          message: result.reason,
          limit: result.limit,
          currentCount: result.currentCount,
        });
        return;
      }

      // Agregar información del límite al request para uso posterior
      (req as any).expenseLimit = result;
      next();
    })
    .catch((error) => {
      console.error("Error al validar límite de gastos:", error);
      res.status(500).json({ error: "Error al validar límite de plan" });
    });
}

