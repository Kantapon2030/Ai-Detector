import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Default configuration from environment variables
const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)'
};

// In AI Studio, we use the generated config file. 
// For local testing, we use environment variables.
// We'll try to use the environment variables first if they are provided.
const isLocal = !!import.meta.env.VITE_FIREBASE_API_KEY;

let firebaseConfig = envConfig;

if (!isLocal) {
  try {
    // This is a special handling for AI Studio environment
    // @ts-ignore
    const config = await import('../firebase-applet-config.json');
    firebaseConfig = config.default;
  } catch (e) {
    console.warn("Firebase config file not found, using environment variables.");
  }
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
