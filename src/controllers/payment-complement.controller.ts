import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import {
  PaymentComplementService,
  PaymentComplementServiceError,
} from "../services/payment-complement.service.js";
import type { ComplementRole, ListPaymentComplementsParams } from "../types/payment.types.js";

const paymentComplementService = new PaymentComplementService();

function parseMesAño(query: AuthRequest["query"]): {
  mes?: number;
  año?: number;
  error?: string;
} {
  const mesRaw = query.mes;
  const añoRaw = query.año;

  let mes: number | undefined;
  let año: number | undefined;

  if (mesRaw !== undefined && typeof mesRaw === "string" && mesRaw.length > 0) {
    const mesNum = parseInt(mesRaw, 10);
    if (Number.isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
      return { error: "mes debe ser un número entre 1 y 12" };
    }
    mes = mesNum;
  }

  if (añoRaw !== undefined && typeof añoRaw === "string" && añoRaw.length > 0) {
    const añoNum = parseInt(añoRaw, 10);
    if (Number.isNaN(añoNum)) {
      return { error: "año debe ser un número válido" };
    }
    año = añoNum;
  }

  if (mes !== undefined && año === undefined) {
    return { error: "año es requerido cuando se filtra por mes" };
  }

  const result: { mes?: number; año?: number; error?: string } = {};
  if (mes !== undefined) {
    result.mes = mes;
  }
  if (año !== undefined) {
    result.año = año;
  }
  return result;
}

function parseRole(value: unknown): ComplementRole | undefined | { error: string } {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return { error: "role debe ser INGRESO o EGRESO" };
  }
  if (value === "INGRESO" || value === "EGRESO") {
    return value;
  }
  return { error: "role debe ser INGRESO o EGRESO" };
}

/**
 * GET /api/payment-complements — Lista complementos de pago del usuario.
 */
export async function getPaymentComplements(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const profileId = req.query.profile_id as string | undefined;
    const roleParsed = parseRole(req.query.role);
    if (typeof roleParsed === "object" && "error" in roleParsed) {
      res.status(400).json({ error: roleParsed.error });
      return;
    }

    const { mes, año, error: mesAñoError } = parseMesAño(req.query);
    if (mesAñoError) {
      res.status(400).json({ error: mesAñoError });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));

    const listParams: ListPaymentComplementsParams = {
      userId,
      page,
      limit,
    };
    if (profileId) {
      listParams.profileId = profileId;
    }
    if (roleParsed) {
      listParams.role = roleParsed;
    }
    if (mes !== undefined) {
      listParams.mes = mes;
    }
    if (año !== undefined) {
      listParams.año = año;
    }

    const result = await paymentComplementService.listForUser(listParams);

    res.json(result);
  } catch (error) {
    if (error instanceof PaymentComplementServiceError) {
      if (error.code === "PROFILE_NOT_FOUND") {
        res.status(404).json({ error: error.message });
        return;
      }
    }
    console.error("Error al listar complementos de pago:", error);
    res.status(500).json({
      error: "Error al listar complementos de pago",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * GET /api/payment-complements/:id — Detalle de un complemento (id = payment_complements.id).
 */
export async function getPaymentComplementById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const idParam = req.params.id;
    if (!idParam || Array.isArray(idParam)) {
      res.status(400).json({ error: "id inválido" });
      return;
    }

    const profileId = req.query.profile_id as string | undefined;

    const data = await paymentComplementService.getByIdForUser(idParam, userId, profileId);

    res.json({ data });
  } catch (error) {
    if (error instanceof PaymentComplementServiceError) {
      if (error.code === "PROFILE_ID_REQUIRED") {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error.code === "NOT_FOUND" || error.code === "PROFILE_NOT_FOUND") {
        res.status(404).json({ error: error.message });
        return;
      }
    }
    console.error("Error al obtener complemento de pago:", error);
    res.status(500).json({
      error: "Error al obtener complemento de pago",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}
