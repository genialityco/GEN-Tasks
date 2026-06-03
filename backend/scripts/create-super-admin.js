/* eslint-disable */
/**
 * Crea (o promueve) un SUPER_ADMIN de GEN-Task.
 *
 * Crea el usuario en Firebase Auth si no existe y escribe/actualiza su
 * documento en Firestore `users/{uid}` con globalRole = SUPER_ADMIN.
 *
 * Uso (desde la carpeta backend/):
 *   node scripts/create-super-admin.js <email> <password> "<Nombre>"
 *
 * Ejemplo:
 *   node scripts/create-super-admin.js admin@geniality.com Cl4veSegura "Super Admin"
 *
 * Lee las credenciales de Firebase desde backend/.env (las mismas que usa la API).
 */
const path = require('path');
const admin = require('firebase-admin');

// Carga backend/.env (dotenv viene como dependencia de @nestjs/config).
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const [, , emailArg, passwordArg, ...nameParts] = process.argv;
  const email = emailArg;
  const password = passwordArg;
  const name = nameParts.join(' ') || 'Super Admin';

  if (!email || !password) {
    console.error(
      'Uso: node scripts/create-super-admin.js <email> <password> "<Nombre>"',
    );
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(
    /\\n/g,
    '\n',
  );

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      'Faltan credenciales en backend/.env (FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY).',
    );
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });

  const auth = admin.auth();
  const db = admin.firestore();

  // 1) Crear o recuperar el usuario en Firebase Auth.
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`Usuario ya existe en Auth: ${userRecord.uid}`);
    // Actualiza la contrasena por si se quiere reestablecer.
    await auth.updateUser(userRecord.uid, { password, displayName: name });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({
        email,
        password,
        displayName: name,
      });
      console.log(`Usuario creado en Auth: ${userRecord.uid}`);
    } else {
      throw err;
    }
  }

  // 2) Escribir el perfil en Firestore con globalRole = SUPER_ADMIN.
  const now = new Date().toISOString();
  const ref = db.collection('users').doc(userRecord.uid);
  const existing = await ref.get();
  await ref.set(
    {
      email,
      name,
      globalRole: 'SUPER_ADMIN',
      isActive: true,
      isArchived: false,
      createdAt: existing.exists ? existing.data().createdAt || now : now,
      updatedAt: now,
    },
    { merge: true },
  );

  console.log('');
  console.log('SUPER_ADMIN listo:');
  console.log(`  uid:   ${userRecord.uid}`);
  console.log(`  email: ${email}`);
  console.log('Ya puedes iniciar sesion en /login.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error creando el SUPER_ADMIN:', err);
  process.exit(1);
});
