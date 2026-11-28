import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
getAuth
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
getFirestore
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
apiKey: "AIzaSyBspyu_v0mk35Gncw8iik3sXDZeStGDKJo",
authDomain: "sastago-85c78.firebaseapp.com",
databaseURL: "https://sastago-85c78-default-rtdb.asia-southeast1.firebasedatabase.app",
projectId: "sastago-85c78",
storageBucket: "sastago-85c78.firebasestorage.app",
messagingSenderId: "711302128514",
appId: "1:711302128514:web:8e247540108c53259be59b",
measurementId: "G-RDNS7PJPB8"
};

const app = getApps().length
? getApp()
: initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };