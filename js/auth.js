// js/auth.js
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export function setupAuth(onLogin, onLogout) {
    const provider = new GoogleAuthProvider();
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if(loginBtn) loginBtn.addEventListener('click', () => signInWithPopup(auth, provider));
    if(logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));

    onAuthStateChanged(auth, (user) => {
        if (user) {
            document.getElementById('auth-section').classList.add('hidden');
            document.getElementById('app-section').classList.remove('hidden');
            onLogin(user);
        } else {
            document.getElementById('auth-section').classList.remove('hidden');
            document.getElementById('app-section').classList.add('hidden');
            onLogout();
        }
    });
}
