// Firebase web config. Values come from NEXT_PUBLIC_* env vars (see .env.example),
// with fallbacks so the app still runs if .env.local is missing.
// NOTE: the Firebase web API key is NOT a secret — it is shipped to the client by design.
export const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "AIzaSyC5K8oCJXBLDVdSI0umwwkR_uSIPisKmkU",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    "tee-dot.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "tee-dot",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "tee-dot.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "967475469903",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    "1:967475469903:web:58efe18ccdda26f5a8143a",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-PD12W2EMHF",
};
