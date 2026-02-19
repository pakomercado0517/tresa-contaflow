import admin from "firebase-admin";

let auth: admin.auth.Auth | null = null;

/**
 * Inicializa Firebase Admin con credenciales desde variables de entorno.
 * FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
function getAuth(): admin.auth.Auth {
  if (auth) {
    return auth;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltan variables de entorno de Firebase: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  const privateKeyParsed = privateKey.replace(/\\n/g, "\n");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKeyParsed,
      }),
    });
  }

  auth = admin.auth();
  return auth;
}

export interface FirebaseDecodedToken {
  uid: string;
  email: string | null;
  name?: string;
  picture?: string;
}

/**
 * Verifica el ID token de Firebase y devuelve el payload decodificado.
 * @throws Si el token es inválido o está expirado
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseDecodedToken> {
  const decoded = await getAuth().verifyIdToken(idToken);
  const result: FirebaseDecodedToken = {
    uid: decoded.uid,
    email: decoded.email ?? null,
  };
  if (decoded.name !== undefined) result.name = decoded.name;
  if (decoded.picture !== undefined) result.picture = decoded.picture;
  return result;
}
