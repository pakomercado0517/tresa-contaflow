import { Router, type IRouter } from "express";
import { body, param } from "express-validator";
import {
  getProfiles,
  getProfileById,
  createProfile,
  updateProfile,
  deleteProfile,
} from "../controllers/profile.controller.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateProfileLimit } from "../middlewares/plan-limits.middleware.js";

const router: IRouter = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Validaciones
const createProfileValidation = [
  body("nombre")
    .trim()
    .notEmpty()
    .withMessage("El nombre es requerido")
    .isLength({ min: 2, max: 255 })
    .withMessage("El nombre debe tener entre 2 y 255 caracteres"),
  body("rfc")
    .trim()
    .notEmpty()
    .withMessage("El RFC es requerido")
    .matches(/^[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$/i)
    .withMessage("Formato de RFC inválido"),
  body("tipo_persona")
    .isIn(["FISICA", "MORAL"])
    .withMessage("El tipo de persona debe ser FISICA o MORAL"),
  body("regimen_fiscal")
    .optional()
    .isString()
    .withMessage("El régimen fiscal debe ser una cadena de texto"),
  body("validaciones_habilitadas")
    .optional()
    .isObject()
    .withMessage("Las validaciones habilitadas deben ser un objeto"),
];

const updateProfileValidation = [
  param("id").isUUID().withMessage("ID de perfil inválido"),
  body("nombre")
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage("El nombre debe tener entre 2 y 255 caracteres"),
  body("rfc")
    .optional()
    .trim()
    .matches(/^[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$/i)
    .withMessage("Formato de RFC inválido"),
  body("tipo_persona")
    .optional()
    .isIn(["FISICA", "MORAL"])
    .withMessage("El tipo de persona debe ser FISICA o MORAL"),
  body("regimen_fiscal")
    .optional()
    .isString()
    .withMessage("El régimen fiscal debe ser una cadena de texto"),
  body("validaciones_habilitadas")
    .optional()
    .isObject()
    .withMessage("Las validaciones habilitadas deben ser un objeto"),
];

const profileIdValidation = [
  param("id").isUUID().withMessage("ID de perfil inválido"),
];

// Rutas
router.get("/", getProfiles);
router.get("/:id", profileIdValidation, validateRequest, getProfileById);
router.post("/", createProfileValidation, validateRequest, validateProfileLimit, createProfile);
router.put("/:id", updateProfileValidation, validateRequest, updateProfile);
router.delete("/:id", profileIdValidation, validateRequest, deleteProfile);

export default router;

