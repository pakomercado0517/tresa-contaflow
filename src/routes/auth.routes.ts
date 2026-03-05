import { Router, type IRouter } from "express";
import { body } from "express-validator";
import {
  register,
  login,
  loginGoogle,
  logout,
  refresh,
  verifyEmail,
  resendVerificationEmail,
  updateProfile,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  completeTour,
} from "../controllers/auth.controller.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router: IRouter = Router();

// Validaciones
const registerValidation = [
  body("email").isEmail().withMessage("Email inválido"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("La contraseña debe tener al menos 8 caracteres"),
  body("nombre")
    .optional()
    .trim()
    .isString()
    .withMessage("El nombre debe ser una cadena de texto"),
  body("apellido")
    .optional()
    .trim()
    .isString()
    .withMessage("El apellido debe ser una cadena de texto"),
  body("telefono")
    .optional()
    .trim()
    .isString()
    .withMessage("El teléfono debe ser una cadena de texto"),
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

const requestPasswordResetValidation = [
  body("email").isEmail().withMessage("Email inválido"),
];

const resetPasswordValidation = [
  body("token").notEmpty().withMessage("Token de restablecimiento requerido"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("La contraseña debe tener al menos 8 caracteres"),
];

const updateProfileValidation = [
  body("nombre")
    .optional()
    .trim()
    .isString()
    .withMessage("El nombre debe ser una cadena de texto"),
  body("apellido")
    .optional()
    .trim()
    .isString()
    .withMessage("El apellido debe ser una cadena de texto"),
  body("telefono")
    .optional()
    .trim()
    .isString()
    .withMessage("El teléfono debe ser una cadena de texto"),
  body("logo_url")
    .optional()
    .trim()
    .isURL()
    .withMessage("El logo_url debe ser una URL válida"),
  body("nombre_comercial")
    .optional()
    .trim()
    .isString()
    .withMessage("El nombre comercial debe ser una cadena de texto"),
];

const completeTourValidation = [
  body("tour_version")
    .trim()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage("El campo tour_version es obligatorio y debe tener entre 1 y 50 caracteres"),
];

const googleLoginValidation = [
  body("idToken").notEmpty().withMessage("El idToken de Firebase es obligatorio"),
];

// Rutas
router.post("/register", registerValidation, validateRequest, register);
router.post("/login", loginValidation, validateRequest, login);
router.post("/google", googleLoginValidation, validateRequest, loginGoogle);
router.post("/logout", authenticateToken, logout); // Agregado middleware de auth
router.post("/refresh", refreshValidation, validateRequest, refresh);
router.post("/verify-email", verifyEmailValidation, validateRequest, verifyEmail);
router.post("/resend-verification-email", resendVerificationEmailValidation, validateRequest, resendVerificationEmail);
router.post("/forgot-password", requestPasswordResetValidation, validateRequest, requestPasswordReset);
router.post("/reset-password", resetPasswordValidation, validateRequest, resetPassword);
router.get("/me", authenticateToken, getCurrentUser);
router.patch("/profile", authenticateToken, updateProfileValidation, validateRequest, updateProfile);
router.patch("/tour-complete", authenticateToken, completeTourValidation, validateRequest, completeTour);

export default router;

