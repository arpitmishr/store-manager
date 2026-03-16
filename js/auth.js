import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginError = document.getElementById('login-error');

// Handle Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // UI updates automatically via onAuthStateChanged
    } catch (error) {
        loginError.textContent = "Invalid email or password.";
        loginError.classList.remove('hidden');
    }
});

// Handle Logout
logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
});

// Listen to Auth State
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is logged in
        loginScreen.classList.add('hidden');
        appContainer.classList.remove('hidden');
    } else {
        // User is logged out
        loginScreen.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});
