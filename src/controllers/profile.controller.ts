import { type Response } from "express";
import { Profile } from "../database/models/index.js";
import type { AuthRequest } from "../middlewares/auth.middleware.js";

/**
 * Obtener todos los perfiles del usuario autenticado
 */
export async function getProfiles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const profiles = await Profile.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
    });

    res.json({
      message: "Perfiles obtenidos exitosamente",
      data: profiles,
      count: profiles.length,
    });
  } catch (error) {
    console.error("Error al obtener perfiles:", error);
    res.status(500).json({ error: "Error al obtener perfiles" });
  }
}

/**
 * Obtener un perfil específico por ID
 */
export async function getProfileById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const profile = await Profile.findOne({
      where: { id, user_id: userId },
    });

    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }

    res.json({
      message: "Perfil obtenido exitosamente",
      data: profile,
    });
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    res.status(500).json({ error: "Error al obtener perfil" });
  }
}

/**
 * Crear un nuevo perfil
 */
export async function createProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { nombre, rfc, tipo_persona, regimen_fiscal, validaciones_habilitadas } = req.body;

    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Verificar si ya existe un perfil con el mismo RFC para este usuario
    const existingProfile = await Profile.findOne({
      where: { user_id: userId, rfc: rfc.toUpperCase() },
    });

    if (existingProfile) {
      res.status(409).json({ error: "Ya existe un perfil con este RFC" });
      return;
    }

    // Crear el perfil
    const profile = await Profile.create({
      user_id: userId,
      nombre,
      rfc: rfc.toUpperCase(),
      tipo_persona,
      regimen_fiscal: regimen_fiscal || null,
      validaciones_habilitadas: validaciones_habilitadas || {},
    });

    res.status(201).json({
      message: "Perfil creado exitosamente",
      data: profile,
    });
  } catch (error: unknown) {
    console.error("Error al crear perfil:", error);
    
    // Manejar error de validación única (RFC duplicado)
    if (error instanceof Error && error.name === "SequelizeUniqueConstraintError") {
      res.status(409).json({ error: "Ya existe un perfil con este RFC" });
      return;
    }

    res.status(500).json({ error: "Error al crear perfil" });
  }
}

/**
 * Actualizar un perfil existente
 */
export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { nombre, rfc, tipo_persona, regimen_fiscal, validaciones_habilitadas } = req.body;

    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Buscar el perfil y verificar que pertenece al usuario
    const profile = await Profile.findOne({
      where: { id, user_id: userId },
    });

    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }

    // Si se está actualizando el RFC, verificar que no exista otro perfil con ese RFC
    if (rfc && rfc.toUpperCase() !== profile.rfc) {
      const existingProfile = await Profile.findOne({
        where: { user_id: userId, rfc: rfc.toUpperCase() },
      });

      if (existingProfile) {
        res.status(409).json({ error: "Ya existe otro perfil con este RFC" });
        return;
      }
    }

    // Actualizar el perfil
    await profile.update({
      nombre: nombre || profile.nombre,
      rfc: rfc ? rfc.toUpperCase() : profile.rfc,
      tipo_persona: tipo_persona || profile.tipo_persona,
      regimen_fiscal: regimen_fiscal !== undefined ? regimen_fiscal : profile.regimen_fiscal,
      validaciones_habilitadas: validaciones_habilitadas !== undefined ? validaciones_habilitadas : profile.validaciones_habilitadas,
    });

    res.json({
      message: "Perfil actualizado exitosamente",
      data: profile,
    });
  } catch (error: unknown) {
    console.error("Error al actualizar perfil:", error);

    // Manejar error de validación única (RFC duplicado)
    if (error instanceof Error && error.name === "SequelizeUniqueConstraintError") {
      res.status(409).json({ error: "Ya existe otro perfil con este RFC" });
      return;
    }

    res.status(500).json({ error: "Error al actualizar perfil" });
  }
}

/**
 * Eliminar un perfil
 */
export async function deleteProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Buscar el perfil y verificar que pertenece al usuario
    const profile = await Profile.findOne({
      where: { id, user_id: userId },
    });

    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }

    // Eliminar el perfil
    await profile.destroy();

    res.json({
      message: "Perfil eliminado exitosamente",
    });
  } catch (error) {
    console.error("Error al eliminar perfil:", error);
    res.status(500).json({ error: "Error al eliminar perfil" });
  }
}

