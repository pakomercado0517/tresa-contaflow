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

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    // Hashear password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generar token de verificación
    const verificationToken = generateVerificationToken();
    const hashedToken = hashVerificationToken(verificationToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expira en 24 horas

    // Crear usuario
    const user = await User.create({
      email,
      password_hash: passwordHash,
      email_verified: false,
      email_verification_token: hashedToken,
      email_verification_expires: expiresAt,
    });

    // Crear suscripción FREE por defecto
    await Subscription.create({
      user_id: user.id,
      plan: "FREE",
      plan_price: 0,
      status: "ACTIVE",
    });

    // Enviar email de verificación
    try {
      await sendVerificationEmail(user.email, verificationToken);
    } catch (error) {
      console.error("Error al enviar email de verificación:", error);
      // No fallar el registro si el email falla, solo loguear el error
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
    console.error("Error en registro:", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    // Buscar usuario
    const user = await User.findOne({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    // Verificar password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    // Generar tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

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
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error al iniciar sesión" });
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

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token requerido" });
      return;
    }

    // Verificar refresh token
    const payload = verifyRefreshToken(refreshToken);

    // Generar nuevo access token
    const accessToken = generateAccessToken({
      userId: payload.userId,
      email: payload.email,
    });

    res.json({
      accessToken,
    });
  } catch (error) {
    console.error("Error en refresh:", error);
    res.status(401).json({ error: "Refresh token inválido" });
  }
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: "Token de verificación requerido" });
      return;
    }

    // Hashear el token recibido para comparar
    const hashedToken = hashVerificationToken(token);

    // Buscar usuario con este token
    const user = await User.findOne({
      where: {
        email_verification_token: hashedToken,
      },
    });

    if (!user) {
      res.status(400).json({ error: "Token de verificación inválido" });
      return;
    }

    // Verificar si el token expiró
    if (!user.email_verification_expires || user.email_verification_expires < new Date()) {
      res.status(400).json({ error: "El token de verificación ha expirado" });
      return;
    }

    // Verificar si ya está verificado
    if (user.email_verified) {
      res.status(400).json({ error: "El email ya está verificado" });
      return;
    }

    // Marcar como verificado y limpiar token
    await user.update({
      email_verified: true,
      email_verification_token: null,
      email_verification_expires: null,
    });

    res.json({
      message: "Email verificado correctamente",
    });
  } catch (error) {
    console.error("Error en verificación de email:", error);
    res.status(500).json({ error: "Error al verificar email" });
  }
}
