import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const SALT_LEN = 16;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

function getEncryptionKey(): Buffer {
  const raw = process.env.SAT_FIEL_ENCRYPTION_KEY;
  if (!raw || typeof raw !== 'string' || raw.length < 16) {
    throw new Error(
      'SAT_FIEL_ENCRYPTION_KEY debe estar definida y tener al menos 16 caracteres'
    );
  }
  return scryptSync(raw, 'fiel-salt', KEY_LEN, SCRYPT_OPTIONS);
}

/**
 * Cifra un texto en claro. Retorna una cadena base64 con formato: iv + authTag + ciphertext.
 */
export function encrypt(plainText: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LEN });
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Descifra una cadena producida por encrypt().
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encryptedBase64, 'base64');
  if (buf.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error('Datos cifrados inválidos');
  }
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
