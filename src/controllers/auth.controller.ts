import { type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { User, Subscription } from "../database/models/index.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.util.js";
import { generateVerificationToken, hashVerificationToken } from "../utils/verification.util.js";
import { sendVerificationEmail } from "../services/email.service.js";

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    // Validación defensiva (aunque el middleware ya valida)
    if (!email || typeof email !== "string") {
      res.status(400).json({ 
        error: "Email requerido",
        message: "El email es obligatorio y debe ser una cadena de texto"
      });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({ 
        error: "Contraseña requerida",
        message: "La contraseña es obligatoria y debe ser una cadena de texto"
      });
      return;
    }

    // Validar que password no sea solo espacios
    if (password.trim().length === 0) {
      res.status(400).json({ 
        error: "Contraseña inválida",
        message: "La contraseña no puede estar vacía o contener solo espacios"
      });
      return;
    }

    // Verificar si el usuario ya existe
    let existingUser;
    try {
      existingUser = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    } catch (dbError) {
      console.error("Error al buscar usuario existente:", dbError);
      res.status(500).json({ 
        error: "Error de base de datos",
        message: "No se pudo verificar si el usuario existe. Por favor intenta nuevamente."
      });
      return;
    }

    if (existingUser) {
      res.status(409).json({ 
        error: "El email ya está registrado",
        message: "Este correo electrónico ya está en uso. ¿Ya tienes una cuenta?"
      });
      return;
    }

    // Hashear password
    let passwordHash: string;
    try {
      passwordHash = await bcrypt.hash(password, 10);
    } catch (hashError) {
      console.error("Error al hashear contraseña:", hashError);
      res.status(500).json({ 
        error: "Error al procesar contraseña",
        message: "No se pudo procesar la contraseña. Por favor intenta nuevamente."
      });
      return;
    }

    // Generar token de verificación
    const verificationToken = generateVerificationToken();
    const hashedToken = hashVerificationToken(verificationToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expira en 24 horas

    // Crear usuario
    let user;
    try {
      user = await User.create({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        email_verified: false,
        email_verification_token: hashedToken,
        email_verification_expires: expiresAt,
      });
    } catch (dbError: any) {
      console.error("Error al crear usuario:", dbError);
      
      // Manejar errores específicos de base de datos
      if (dbError.name === "SequelizeUniqueConstraintError") {
        res.status(409).json({ 
          error: "El email ya está registrado",
          message: "Este correo electrónico ya está en uso."
        });
        return;
      }

      if (dbError.name === "SequelizeDatabaseError" || dbError.name === "SequelizeConnectionError") {
        res.status(503).json({ 
          error: "Error de conexión",
          message: "No se pudo conectar con la base de datos. Por favor intenta nuevamente más tarde."
        });
        return;
      }

      res.status(500).json({ 
        error: "Error al crear usuario",
        message: "Ocurrió un error inesperado al registrar tu cuenta. Por favor intenta nuevamente."
      });
      return;
    }

    // Crear suscripción FREE por defecto
    try {
      await Subscription.create({
        user_id: user.id,
        plan: "FREE",
        plan_price: 0,
        status: "ACTIVE",
      });
    } catch (subError: any) {
      console.error("Error al crear suscripción:", subError);
      
      // Si falla la suscripción, intentar eliminar el usuario creado
      try {
        await user.destroy();
      } catch (deleteError) {
        console.error("Error al eliminar usuario huérfano:", deleteError);
      }

      res.status(500).json({ 
        error: "Error al completar registro",
        message: "No se pudo completar el registro. Por favor intenta nuevamente."
      });
      return;
    }

    // Enviar email de verificación
    try {
      await sendVerificationEmail(user.email, verificationToken);
    } catch (emailError) {
      console.error("Error al enviar email de verificación:", emailError);
      // No fallar el registro si el email falla, solo loguear el error
      // El usuario puede solicitar un nuevo email más tarde
    }

    res.status(201).json({
      message: "Usuario registrado correctamente. Por favor verifica tu email.",
      user: {
        id: user.id,
        email: user.email,
        email_verified: user.email_verified,
      },
    });
  } catch (error) {
    console.error("Error inesperado en registro:", error);
    
    // Error no manejado previamente
    if (error instanceof Error) {
      res.status(500).json({ 
        error: "Error al registrar usuario",
        message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
      });
      return;
    }

    res.status(500).json({ 
      error: "Error desconocido",
      message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
    });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    // Validación defensiva (aunque el middleware ya valida)
    if (!email || typeof email !== "string") {
      res.status(400).json({ 
        error: "Email requerido",
        message: "El email es obligatorio"
      });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({ 
        error: "Contraseña requerida",
        message: "La contraseña es obligatoria"
      });
      return;
    }

    // Buscar usuario
    let user;
    try {
      user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    } catch (dbError) {
      console.error("Error al buscar usuario:", dbError);
      res.status(500).json({ 
        error: "Error de base de datos",
        message: "No se pudo verificar las credenciales. Por favor intenta nuevamente."
      });
      return;
    }

    if (!user) {
      // No revelar si el usuario existe o no (seguridad)
      res.status(401).json({ 
        error: "Credenciales inválidas",
        message: "El email o la contraseña son incorrectos"
      });
      return;
    }

    // Verificar password
    let passwordValid: boolean;
    try {
      passwordValid = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptError) {
      console.error("Error al comparar contraseña:", bcryptError);
      res.status(500).json({ 
        error: "Error al verificar contraseña",
        message: "No se pudo verificar la contraseña. Por favor intenta nuevamente."
      });
      return;
    }

    if (!passwordValid) {
      // No revelar si el usuario existe o no (seguridad)
      res.status(401).json({ 
        error: "Credenciales inválidas",
        message: "El email o la contraseña son incorrectos"
      });
      return;
    }

    // Generar tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
    };

    let accessToken: string;
    let refreshToken: string;

    try {
      accessToken = generateAccessToken(tokenPayload);
      refreshToken = generateRefreshToken(tokenPayload);
    } catch (tokenError) {
      console.error("Error al generar tokens:", tokenError);
      res.status(500).json({ 
        error: "Error al generar tokens",
        message: "No se pudieron generar los tokens de acceso. Por favor intenta nuevamente."
      });
      return;
    }

    res.json({
      message: "Login exitoso",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        email_verified: user.email_verified,
      },
    });
  } catch (error) {
    console.error("Error inesperado en login:", error);
    
    // Error no manejado previamente
    if (error instanceof Error) {
      res.status(500).json({ 
        error: "Error al iniciar sesión",
        message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
      });
      return;
    }

    res.status(500).json({ 
      error: "Error desconocido",
      message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
    });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  // En una implementación completa, aquí se invalidaría el refresh token
  // Por ahora simplemente respondemos éxito
  res.json({ message: "Logout exitoso" });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== "string") {
      res.status(400).json({ 
        error: "Refresh token requerido",
        message: "El refresh token es obligatorio"
      });
      return;
    }

    // Verificar refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (tokenError: any) {
      console.error("Error al verificar refresh token:", tokenError);
      
      // Manejar errores específicos de JWT
      if (tokenError.name === "TokenExpiredError") {
        res.status(401).json({ 
          error: "Refresh token expirado",
          message: "Tu sesión ha expirado. Por favor inicia sesión nuevamente."
        });
        return;
      }

      if (tokenError.name === "JsonWebTokenError" || tokenError.name === "NotBeforeError") {
        res.status(401).json({ 
          error: "Refresh token inválido",
          message: "El token de renovación no es válido. Por favor inicia sesión nuevamente."
        });
        return;
      }

      res.status(401).json({ 
        error: "Error al verificar token",
        message: "No se pudo verificar el token. Por favor inicia sesión nuevamente."
      });
      return;
    }

    // Generar nuevo access token
    let accessToken: string;
    try {
      accessToken = generateAccessToken({
        userId: payload.userId,
        email: payload.email,
      });
    } catch (tokenError) {
      console.error("Error al generar access token:", tokenError);
      res.status(500).json({ 
        error: "Error al generar token",
        message: "No se pudo generar el nuevo token de acceso. Por favor intenta nuevamente."
      });
      return;
    }

    res.json({
      accessToken,
    });
  } catch (error) {
    console.error("Error inesperado en refresh:", error);
    
    // Error no manejado previamente
    if (error instanceof Error) {
      res.status(500).json({ 
        error: "Error al renovar token",
        message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
      });
      return;
    }

    res.status(500).json({ 
      error: "Error desconocido",
      message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
    });
  }
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;

    if (!token || typeof token !== "string") {
      res.status(400).json({ 
        error: "Token de verificación requerido",
        message: "El token de verificación es obligatorio"
      });
      return;
    }

    // Hashear el token recibido para comparar
    const hashedToken = hashVerificationToken(token);

    // Buscar usuario con este token
    let user;
    try {
      user = await User.findOne({
        where: {
          email_verification_token: hashedToken,
        },
      });
    } catch (dbError) {
      console.error("Error al buscar usuario:", dbError);
      res.status(500).json({ 
        error: "Error de base de datos",
        message: "No se pudo verificar el token. Por favor intenta nuevamente."
      });
      return;
    }

    if (!user) {
      res.status(400).json({ 
        error: "Token de verificación inválido",
        message: "El token proporcionado no es válido. Puedes solicitar un nuevo email de verificación."
      });
      return;
    }

    // Verificar si el token expiró
    if (!user.email_verification_expires || user.email_verification_expires < new Date()) {
      res.status(400).json({ 
        error: "El token de verificación ha expirado",
        message: "El token ha expirado. Puedes solicitar un nuevo email de verificación."
      });
      return;
    }

    // Verificar si ya está verificado
    if (user.email_verified) {
      res.status(400).json({ 
        error: "El email ya está verificado",
        message: "Este email ya fue verificado anteriormente."
      });
      return;
    }

    // Marcar como verificado y limpiar token
    try {
      await user.update({
        email_verified: true,
        email_verification_token: null,
        email_verification_expires: null,
      });
    } catch (updateError) {
      console.error("Error al actualizar usuario:", updateError);
      res.status(500).json({ 
        error: "Error al verificar email",
        message: "No se pudo completar la verificación. Por favor intenta nuevamente."
      });
      return;
    }

    res.json({
      message: "Email verificado correctamente",
    });
  } catch (error) {
    console.error("Error inesperado en verificación de email:", error);
    
    if (error instanceof Error) {
      res.status(500).json({ 
        error: "Error al verificar email",
        message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
      });
      return;
    }

    res.status(500).json({ 
      error: "Error desconocido",
      message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
    });
  }
}

export async function resendVerificationEmail(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    // Validación
    if (!email || typeof email !== "string") {
      res.status(400).json({ 
        error: "Email requerido",
        message: "El email es obligatorio"
      });
      return;
    }

    // Buscar usuario
    let user;
    try {
      user = await User.findOne({ 
        where: { email: email.toLowerCase().trim() } 
      });
    } catch (dbError) {
      console.error("Error al buscar usuario:", dbError);
      res.status(500).json({ 
        error: "Error de base de datos",
        message: "No se pudo buscar el usuario. Por favor intenta nuevamente."
      });
      return;
    }

    // No revelar si el usuario existe o no (seguridad)
    // Pero en este caso, es útil saberlo, así que retornamos un mensaje genérico
    if (!user) {
      // Por seguridad, no revelamos si el email existe o no
      res.status(200).json({
        message: "Si el email está registrado y no está verificado, se enviará un nuevo email de verificación.",
      });
      return;
    }

    // Verificar si ya está verificado
    if (user.email_verified) {
      res.status(400).json({ 
        error: "Email ya verificado",
        message: "Este email ya fue verificado. Puedes iniciar sesión normalmente."
      });
      return;
    }

    // Generar nuevo token de verificación
    const verificationToken = generateVerificationToken();
    const hashedToken = hashVerificationToken(verificationToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expira en 24 horas

    // Actualizar token en la BD
    try {
      await user.update({
        email_verification_token: hashedToken,
        email_verification_expires: expiresAt,
      });
    } catch (updateError) {
      console.error("Error al actualizar token de verificación:", updateError);
      res.status(500).json({ 
        error: "Error al generar token",
        message: "No se pudo generar el nuevo token. Por favor intenta nuevamente."
      });
      return;
    }

    // Enviar email de verificación
    try {
      await sendVerificationEmail(user.email, verificationToken);
    } catch (emailError) {
      console.error("Error al enviar email de verificación:", emailError);
      res.status(500).json({ 
        error: "Error al enviar email",
        message: "No se pudo enviar el email de verificación. Por favor intenta nuevamente más tarde."
      });
      return;
    }

    res.status(200).json({
      message: "Email de verificación reenviado correctamente. Por favor revisa tu bandeja de entrada.",
    });
  } catch (error) {
    console.error("Error inesperado al reenviar email de verificación:", error);
    
    if (error instanceof Error) {
      res.status(500).json({ 
        error: "Error al reenviar email",
        message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
      });
      return;
    }

    res.status(500).json({ 
      error: "Error desconocido",
      message: "Ocurrió un error inesperado. Por favor intenta nuevamente."
    });
  }
}
