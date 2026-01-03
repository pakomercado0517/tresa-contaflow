import { Router } from "express";
import { body } from "express-validator";
import {
  register,
  login,
  logout,
  refresh,
  verifyEmail,
} from "../controllers/auth.controller.js";
import { validateRequest } from "../middlewares/validate.middleware.js";

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

// Rutas
router.post("/register", registerValidation, validateRequest, register);
router.post("/login", loginValidation, validateRequest, login);
router.post("/logout", logout);
router.post("/refresh", refreshValidation, validateRequest, refresh);
router.post("/verify-email", verifyEmailValidation, validateRequest, verifyEmail);

export default router;

