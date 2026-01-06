import { Router } from "express";
import { body } from "express-validator";
import {
  register,
  login,
  logout,
  refresh,
  verifyEmail,
  resendVerificationEmail,
} from "../controllers/auth.controller.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

// Validaciones
const registerValidation = [
  body("email").isEmail().withMessage("Email inválido"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("La contraseña debe tener al menos 8 caracteres"),
];

const loginValidation = [
  body("email").isEmail().withMessage("Email inválido"),
  body("password").notEmpty().withMessage("Contraseña requerida"),
];

const refreshValidation = [
  body("refreshToken").notEmpty().withMessage("Refresh token requerido"),
];

const verifyEmailValidation = [
  body("token").notEmpty().withMessage("Token de verificación requerido"),
];

const resendVerificationEmailValidation = [
  body("email").isEmail().withMessage("Email inválido"),
];

// Rutas
router.post("/register", registerValidation, validateRequest, register);
router.post("/login", loginValidation, validateRequest, login);
router.post("/logout", authenticateToken, logout); // Agregado middleware de auth
router.post("/refresh", refreshValidation, validateRequest, refresh);
router.post("/verify-email", verifyEmailValidation, validateRequest, verifyEmail);
router.post("/resend-verification-email", resendVerificationEmailValidation, validateRequest, resendVerificationEmail);

export default router;

