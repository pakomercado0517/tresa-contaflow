import { type Request, type Response, type NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.util.js";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: "Token de acceso requerido" });
      return;
    }

    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    req.userEmail = payload.email;

    next();
  } catch (error) {
    res.status(403).json({ error: "Token inválido o expirado" });
  }
}

