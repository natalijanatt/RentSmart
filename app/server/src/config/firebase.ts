import * as admin from 'firebase-admin';
import { env } from './env.js';

function initFirebase(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_PRIVATE_KEY && env.FIREBASE_CLIENT_EMAIL) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        // Railway and most CI systems store the key with literal \n
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }

  if (!env.MOCK_AUTH) {
    throw new Error(
      'Firebase credentials (FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL) ' +
      'are required when MOCK_AUTH=false.',
    );
  }

  // MOCK_AUTH=true — initialize a dummy app so firebase-admin doesn't throw on import
  return admin.initializeApp({ projectId: 'mock-project' });
}

const firebaseApp = initFirebase();
export const firebaseAuth = firebaseApp.auth();
