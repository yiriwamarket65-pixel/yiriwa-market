// Configuration de l'application Web YIRIWA MARKET
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyANuLvXFw9BTjSN-ieBu5fLlqkez8XqpLg",
  authDomain: "yiriwa-market-v2.firebaseapp.com",
  projectId: "yiriwa-market-v2",
  storageBucket: "yiriwa-market-v2.firebasestorage.app",
  messagingSenderId: "392592256605",
  appId: "1:392592256605:web:c8e1d5a053482481bfa7b4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
