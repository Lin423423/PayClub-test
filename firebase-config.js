// PayClub — Firebase 設定
// ══════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, remove, push, onValue, off }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCBeSA2t4Avs4MQQcJicR2qn_XDPId0KGI",
  authDomain: "payclub-a6513.firebaseapp.com",
  databaseURL: "https://payclub-a6513-default-rtdb.firebaseio.com",
  projectId: "payclub-a6513",
  storageBucket: "payclub-a6513.firebasestorage.app",
  messagingSenderId: "970489117971",
  appId: "1:970489117971:web:bdf71e5565eee3eb1aaee6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
         ref, set, get, update, remove, push, onValue, off };
