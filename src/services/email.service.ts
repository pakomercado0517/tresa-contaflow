import * as brevo from '@getbrevo/brevo';

if (!process.env.BREVO_API_KEY) {
  throw new Error('BREVO_API_KEY no está definida en las variables de entorno');
}

// Crear instancia de la API
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'noreply@tresacontafy.com';
const FROM_NAME = process.env.BREVO_FROM_NAME || 'Tresa Contafy';
const REDACTED_VALUE = '[REDACTED]';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function getNestedRecord(source: UnknownRecord, key: string): UnknownRecord | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function getStringValue(source: UnknownRecord, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function getNumberValue(source: UnknownRecord, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' ? value : null;
}

function serializeHeaderValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => String(entry)).join(', ');
  }
  return String(value);
}

function sanitizeHeaders(headers: UnknownRecord): Record<string, string> {
  const sensitiveHeaderKeys: Set<string> = new Set<string>([
    'api-key',
    'authorization',
    'proxy-authorization',
    'x-api-key',
    'x-auth-token',
    'cookie',
    'set-cookie',
  ]);

  const sanitizedHeaders: Record<string, string> = {};
  for (const [headerKey, headerValue] of Object.entries(headers)) {
    const normalizedHeader = headerKey.toLowerCase();
    sanitizedHeaders[headerKey] = sensitiveHeaderKeys.has(normalizedHeader)
      ? REDACTED_VALUE
      : serializeHeaderValue(headerValue);
  }
  return sanitizedHeaders;
}

function buildSafeEmailErrorLog(error: unknown): UnknownRecord {
  const safeLog: UnknownRecord = {
    message: error instanceof Error ? error.message : 'Error desconocido al enviar email',
  };

  if (!isRecord(error)) {
    return safeLog;
  }

  const code = getStringValue(error, 'code');
  if (code) {
    safeLog.code = code;
  }

  const response = getNestedRecord(error, 'response');
  if (response) {
    const status = getNumberValue(response, 'status');
    const statusText = getStringValue(response, 'statusText');

    if (status !== null) {
      safeLog.status = status;
    }
    if (statusText) {
      safeLog.statusText = statusText;
    }

    const responseData = getNestedRecord(response, 'data');
    if (responseData) {
      const providerMessage = getStringValue(responseData, 'message');
      const providerCode = getStringValue(responseData, 'code');

      if (providerMessage) {
        safeLog.providerMessage = providerMessage;
      }
      if (providerCode) {
        safeLog.providerCode = providerCode;
      }
    }
  }

  const config = getNestedRecord(error, 'config');
  if (config) {
    const method = getStringValue(config, 'method');
    const url = getStringValue(config, 'url');

    if (method) {
      safeLog.method = method;
    }
    if (url) {
      safeLog.url = url;
    }

    const headers = getNestedRecord(config, 'headers');
    if (headers) {
      safeLog.headers = sanitizeHeaders(headers);
    }
  }

  return safeLog;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

const currentYear = new Date().getFullYear();

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  try {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.sender = {
      name: FROM_NAME,
      email: FROM_EMAIL,
    };

    sendSmtpEmail.to = [{ email: options.to }];
    sendSmtpEmail.subject = options.subject;
    sendSmtpEmail.htmlContent = options.htmlContent;
    if (options.textContent) {
      sendSmtpEmail.textContent = options.textContent;
    }

    await apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (error) {
    console.error('Error al enviar email:', buildSafeEmailErrorLog(error));
    throw new Error('Error al enviar email');
  }
}

export async function sendVerificationEmail(
  email: string,
  verificationToken: string,
  nombre?: string | null
): Promise<void> {
  const verificationUrl = `${
    process.env.FRONTEND_URL || 'http://localhost:3000'
  }/auth/verify-email?token=${verificationToken}`;
  const nombreUsuario = nombre ? nombre : 'Usuario';
  const saludo = nombre ? `¡Hola, ${nombre}!` : '¡Hola!';

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>¡Bienvenido a bordo! - Tresa Contafy</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Contenedor principal -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff;">
          
          <!-- Logo y Header -->
          <tr>
            <td style="padding-bottom: 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <span style="color: #265C46; font-size: 20px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Tresa Contafy</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Banner verde -->
          <tr>
            <td style="background-color: #265C46; padding: 24px 40px; position: relative; overflow: hidden;">
              <div style="position: absolute; top: 0; right: 0; width: 200px; height: 100%; background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%); opacity: 0.3;"></div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; line-height: 1.3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; position: relative; z-index: 1;">
                ¡Bienvenido a bordo!
              </h1>
            </td>
          </tr>

          <!-- Contenido principal -->
          <tr>
            <td style="padding: 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                
                <!-- Saludo personalizado -->
                <tr>
                  <td style="padding-bottom: 24px;">
                    <h2 style="margin: 0; color: #1a1a1a; font-size: 24px; font-weight: 600; line-height: 1.4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      ${saludo}
                    </h2>
                  </td>
                </tr>

                <!-- Mensaje principal -->
                <tr>
                  <td style="padding-bottom: 32px;">
                    <p style="margin: 0; color: #1a1a1a; font-size: 16px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Estamos muy emocionados de que empieces a utilizar nuestra plataforma. Estás a un solo paso de simplificar tu control financiero de CFDIs y tomar el control total de tus facturas.
                    </p>
                  </td>
                </tr>

                <!-- Botón de confirmación -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: #265C46;">
                          <a href="${verificationUrl}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                            Verificar Correo Electrónico
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Notificación de expiración -->
                <tr>
                  <td style="padding-bottom: 32px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Este enlace expirará en 24 horas. Si no solicitaste esta cuenta, puedes ignorar este correo.
                    </p>
                  </td>
                </tr>

                <!-- Separador -->
                <tr>
                  <td style="padding-bottom: 24px; border-top: 1px solid #e5e7eb;"></td>
                </tr>

                <!-- Link alternativo -->
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Si el botón no funciona, copia y pega este enlace en tu navegador:
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom: 32px;">
                    <p style="margin: 0; word-break: break-all;">
                      <a href="${verificationUrl}" style="color: #265C46; text-decoration: underline; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                        ${verificationUrl}
                      </a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                
                <!-- Iconos sociales -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 0 8px;">
                          <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f3f4f6; display: inline-block;"></div>
                        </td>
                        <td style="padding: 0 8px;">
                          <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f3f4f6; display: inline-block;"></div>
                        </td>
                        <td style="padding: 0 8px;">
                          <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f3f4f6; display: inline-block;"></div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Información de copyright -->
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #1a1a1a; font-size: 12px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      © ${currentYear} Tresa Contafy Solutions México.
                    </p>
                    <p style="margin: 8px 0 0 0; color: #1a1a1a; font-size: 12px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Av. de la Reforma 222, Cuauhtémoc, 06600 Ciudad de México, CDMX.
                    </p>
                  </td>
                </tr>

                <!-- Razón del correo -->
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Has recibido este correo porque te registraste en nuestra plataforma.
                    </p>
                  </td>
                </tr>

                <!-- Enlaces legales -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 0 12px;">
                          <a href="#" style="color: #265C46; text-decoration: none; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Privacidad</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="#" style="color: #265C46; text-decoration: none; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Términos</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="#" style="color: #265C46; text-decoration: none; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Soporte</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>

        <!-- Opción de ver en navegador -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin-top: 20px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #1a1a1a; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                ¿No puedes ver este correo? <a href="${verificationUrl}" style="color: #265C46; text-decoration: underline;">Ábrelo en tu navegador</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `Tresa Contafy

¡Bienvenido a bordo!

${saludo}

Estamos muy emocionados de que empieces a utilizar nuestra plataforma. Estás a un solo paso de simplificar tu control financiero de CFDIs y tomar el control total de tus facturas.

Para verificar tu correo electrónico, visita el siguiente enlace:

${verificationUrl}

Este enlace expirará en 24 horas. Si no solicitaste esta cuenta, puedes ignorar este correo.

---
© ${currentYear} Tresa Contafy Solutions México.
Av. de la Reforma 222, Cuauhtémoc, 06600 Ciudad de México, CDMX.

Has recibido este correo porque te registraste en nuestra plataforma.

Privacidad | Términos | Soporte`;

  await sendEmail({
    to: email,
    subject: '¡Bienvenido a bordo! - Tresa Contafy',
    htmlContent,
    textContent,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  nombre?: string | null
): Promise<void> {
  const resetUrl = `${
    process.env.FRONTEND_URL || 'http://localhost:3000'
  }/auth/reset-password?token=${resetToken}`;

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Restablecer contraseña - Tresa Contafy</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Contenedor principal -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff;">
          
          <!-- Logo y Header -->
          <tr>
            <td style="padding-bottom: 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <span style="color: #265C46; font-size: 20px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Tresa Contafy</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Banner verde -->
          <tr>
            <td style="background-color: #265C46; padding: 24px 40px; position: relative; overflow: hidden;">
              <div style="position: absolute; top: 0; right: 0; width: 200px; height: 100%; background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%); opacity: 0.3;"></div>
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600; line-height: 1.3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; position: relative; z-index: 1;">
                Seguridad de tu Cuenta
              </h1>
            </td>
          </tr>

          <!-- Contenido principal -->
          <tr>
            <td style="padding: 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                

                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <h2 style="margin: 0; color: #1a1a1a; font-size: 24px; font-weight: 600; line-height: 1.4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      ¿Olvidaste tu contraseña?
                    </h2>
                  </td>
                </tr>

                <!-- Mensaje principal -->
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <p style="margin: 0; color: #1a1a1a; font-size: 16px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 500px;">
                      Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Tresa Contafy. No te preocupes, puedes volver a ingresar haciendo clic en el botón de abajo.
                    </p>
                  </td>
                </tr>

                <!-- Botón de restablecimiento -->
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: #265C46;">
                          <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                            Restablecer Contraseña
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Aviso de seguridad -->
                <tr>
                  <td style="padding-bottom: 32px;">
                    <div style="border: 2px solid #F9B64E; background-color: #FFF8ED; border-radius: 8px; padding: 16px;">
                      <p style="margin: 0; color: #1a1a1a; font-size: 14px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                        Si tú no realizaste esta solicitud, puedes ignorar este correo de forma segura. Tu contraseña actual no cambiará a menos que accedas al enlace superior.
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Link alternativo -->
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; text-align: center;">
                      O COPIA Y PEGA ESTE ENLACE EN TU NAVEGADOR:
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom: 32px;">
                    <p style="margin: 0; word-break: break-all; text-align: center;">
                      <a href="${resetUrl}" style="color: #265C46; text-decoration: underline; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                        ${resetUrl}
                      </a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Separador -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #e5e7eb;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                
                <!-- Iconos sociales -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 0 8px;">
                          <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f3f4f6; display: inline-block;"></div>
                        </td>
                        <td style="padding: 0 8px;">
                          <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f3f4f6; display: inline-block;"></div>
                        </td>
                        <td style="padding: 0 8px;">
                          <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f3f4f6; display: inline-block;"></div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Información de copyright -->
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #1a1a1a; font-size: 12px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      © ${currentYear} Tresa Contafy Solutions México.
                    </p>
                    <p style="margin: 8px 0 0 0; color: #1a1a1a; font-size: 12px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Av. de la Reforma 222, Colonia Juárez, 06600 Ciudad de México, CDMX.
                    </p>
                  </td>
                </tr>

                <!-- Razón del correo -->
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Estás recibiendo este correo electrónico por una solicitud de seguridad relacionada con tu cuenta.
                    </p>
                  </td>
                </tr>

                <!-- Enlaces legales -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 0 12px;">
                          <a href="#" style="color: #6b7280; text-decoration: none; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Privacidad</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="#" style="color: #6b7280; text-decoration: none; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Términos y Condiciones</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="#" style="color: #6b7280; text-decoration: none; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Soporte Técnico</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>

        <!-- Opción de ver en navegador -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin-top: 20px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #1a1a1a; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                ¿Problemas para visualizar el contenido? <a href="${resetUrl}" style="color: #265C46; text-decoration: underline;">Ver versión web</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `Tresa Contafy

¿Olvidaste tu contraseña?

Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Tresa Contafy. No te preocupes, puedes volver a ingresar haciendo clic en el siguiente enlace:

${resetUrl}

Si tú no realizaste esta solicitud, puedes ignorar este correo de forma segura. Tu contraseña actual no cambiará a menos que accedas al enlace superior.

---
© ${currentYear} Tresa Contafy Solutions México.
Av. de la Reforma 222, Colonia Juárez, 06600 Ciudad de México, CDMX.

Estás recibiendo este correo electrónico por una solicitud de seguridad relacionada con tu cuenta.

Privacidad | Términos y Condiciones | Soporte Técnico`;

  await sendEmail({
    to: email,
    subject: 'Restablecer contraseña - Tresa Contafy',
    htmlContent,
    textContent,
  });
}

/**
 * Envía invitación para ver reporte público de métricas.
 * Mensaje: "El Despacho [Nombre] te invita a revisar tus finanzas..."
 */
export async function sendPublicReportInvitation(
  email: string,
  link: string,
  nombreDespacho: string,
  logoUrl?: string | null
): Promise<void> {
  const nombre = nombreDespacho.trim() || 'Tu despacho';
  const logoBlock = logoUrl
    ? `<tr><td style="padding-bottom: 16px;"><img src="${logoUrl}" alt="${nombre}" style="max-width: 180px; max-height: 60px; height: auto;" /></td></tr>`
    : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a revisar tu reporte - Tresa Contafy</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px;">
          ${logoBlock}
          <tr>
            <td style="background-color: #265C46; padding: 24px 40px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Invitación a tu reporte</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px 0; color: #1a1a1a; font-size: 16px; line-height: 1.6;">
                El despacho <strong>${nombre}</strong> te invita a revisar tus finanzas en un reporte actualizado.
              </p>
              <p style="margin: 0 0 24px 0; color: #1a1a1a; font-size: 16px; line-height: 1.6;">
                Haz clic en el siguiente enlace para ver tu dashboard de métricas (no necesitas iniciar sesión):
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #265C46;">
                    <a href="${link}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Ver mi reporte
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px;">
                Este enlace es privado. Si no esperabas esta invitación, puedes ignorar este correo.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">© ${currentYear} Tresa Contafy Solutions México.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `El despacho ${nombre} te invita a revisar tus finanzas.\n\nVer tu reporte: ${link}\n\nEste enlace es privado. Si no esperabas esta invitación, puedes ignorar este correo.`;

  await sendEmail({
    to: email,
    subject: `${nombre} te invita a revisar tu reporte - Tresa Contafy`,
    htmlContent,
    textContent,
  });
}
