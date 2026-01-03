import { type Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { CFDIParserService } from "../services/cfdi-parser.service.js";
import { FiscalValidationService } from "../services/fiscal-validation.service.js";
import { PaymentMatchingService } from "../services/payment-matching.service.js";
import { Profile } from "../database/models/index.js";
import type { UploadedFile } from "express-fileupload";
import type { ValidacionesConfig } from "../types/validation.types.js";

/**
 * Endpoint de prueba para parsear XML CFDI
 * Este endpoint permite subir un archivo XML y ver los datos extraídos con validaciones fiscales
 */
export async function parseXML(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Obtener profileId del body o query
    const profileId = req.body.profileId || req.query.profileId;
    if (!profileId || typeof profileId !== "string") {
      res.status(400).json({ error: "profileId es requerido" });
      return;
    }

    // Verificar que el perfil pertenece al usuario
    const profile = await Profile.findOne({
      where: { id: profileId, user_id: userId },
    });

    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }

    // Verificar que se subió un archivo
    if (!req.files || !req.files.xml) {
      res.status(400).json({ error: "No se proporcionó archivo XML" });
      return;
    }

    const file = req.files.xml as UploadedFile;

    // Verificar que es un archivo XML
    if (!file.name.toLowerCase().endsWith(".xml")) {
      res.status(400).json({ error: "El archivo debe ser un XML" });
      return;
    }

    // Leer el contenido del archivo como texto
    const xmlString = file.data.toString("utf-8");

    // Parsear el XML
    const parser = new CFDIParserService();
    const cfdi = await parser.parseXML(xmlString);

    // Realizar validaciones fiscales y matching
    const validationService = new FiscalValidationService();
    const matchingService = new PaymentMatchingService();
    const validacionesConfig = (profile.validaciones_habilitadas || {}) as ValidacionesConfig;

    let estadoValidacion;
    let matchingResult = null;

    if (cfdi.tipo === "COMPLEMENTO_PAGO") {
      // Para complementos de pago: validar UUID duplicado y hacer matching
      const uuidDuplicado = await validationService.checkUUIDDuplicado(cfdi.uuid, profileId);
      
      estadoValidacion = {
        rfcVerificado: true, // N/A para complemento
        regimenFiscalVerificado: true, // N/A para complemento
        uuidDuplicado: uuidDuplicado,
        advertencias: [],
        errores: uuidDuplicado ? [`El complemento de pago con UUID ${cfdi.uuid} ya existe.`] : [],
        valido: !uuidDuplicado,
      };

      // Si no hay UUID duplicado, proceder con el matching
      if (!uuidDuplicado) {
        try {
          matchingResult = await matchingService.buscarMatchesComplemento(cfdi, profileId);
        } catch (error) {
          console.error("Error en matching:", error);
          estadoValidacion.errores?.push(
            error instanceof Error ? error.message : "Error al buscar matches"
          );
        }
      }
    } else {
      // Para facturas normales: validaciones fiscales completas
      // Determinar si es factura (ingreso) o gasto basado en RFC
      if (cfdi.rfcEmisor === profile.rfc) {
        // Si el RFC del perfil es el emisor, es una factura de ingreso
        estadoValidacion = await validationService.validateFacturaIngreso(
          cfdi,
          profileId,
          profile.rfc,
          profile.regimen_fiscal,
          validacionesConfig
        );
      } else if (cfdi.rfcReceptor === profile.rfc) {
        // Si el RFC del perfil es el receptor, es un gasto
        estadoValidacion = await validationService.validateGasto(
          cfdi,
          profileId,
          profile.rfc,
          profile.regimen_fiscal,
          validacionesConfig
        );
      } else {
        // El CFDI no corresponde al perfil ni como emisor ni como receptor
        estadoValidacion = {
          rfcVerificado: false,
          regimenFiscalVerificado: false,
          uuidDuplicado: false,
          advertencias: [],
          errores: [`El CFDI no corresponde al perfil ${profile.rfc} ni como emisor ni como receptor.`],
          valido: false,
        };
      }
    }

    // Retornar los datos parseados junto con el estado de validación y matching
    res.json({
      message: "XML parseado exitosamente",
      data: cfdi,
      validacion: estadoValidacion,
      matching: matchingResult,
      profile: {
        id: profile.id,
        nombre: profile.nombre,
        rfc: profile.rfc,
        regimen_fiscal: profile.regimen_fiscal,
      },
    });
  } catch (error) {
    console.error("Error al parsear XML:", error);
    
    if (error instanceof Error) {
      res.status(400).json({ 
        error: "Error al parsear XML",
        message: error.message 
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al parsear XML" });
  }
}

