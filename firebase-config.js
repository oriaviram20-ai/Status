// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCJOHv3F7cCLPFssUoUc8maNmYPcchSBsA",
  authDomain: "status-personal-91af7.firebaseapp.com",
  projectId: "status-personal-91af7",
  storageBucket: "status-personal-91af7.firebasestorage.app",
  messagingSenderId: "14984346956",
  appId: "1:14984346956:web:d9531bc24226587fe0a3e9",
  measurementId: "G-FN0VEZG0KB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
