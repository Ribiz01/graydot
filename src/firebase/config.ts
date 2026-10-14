// Firebase web config. Values come from NEXT_PUBLIC_* env vars (see .env.example),
// with fallbacks so the app still runs if .env.local is missing.
// NOTE: the Firebase web API key is NOT a secret — it is shipped to the client by design.
export const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "AIzaSyBQxte7OQ-by2G8J2V9CWjOFLFRjWUw-yw",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    "graydot-96c5a.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "graydot-96c5a",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "graydot-96c5a.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "412516773525",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    "1:412516773525:web:fc09a31d7ba617028c359c",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-Y4WXN5CJ36",
};
