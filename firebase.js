// Configuration de l'application Web YIRIWA MARKET
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDDZnkXgnY41L8BZ_eId5XC_ldAd4xQ_iU",
  authDomain: "yiriwa-market.firebaseapp.com",
  projectId: "yiriwa-market",
  storageBucket: "yiriwa-market.firebasestorage.app",
  messagingSenderId: "650816949308",
  appId: "1:650816949308:web:332828139c688cb26f4739",
  measurementId: "G-60R33GBL7K"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
