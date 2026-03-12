import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export function setupAuth(onLogin, onLogout) {
    // Listen for state changes (keeps user logged in on refresh)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-wrapper').classList.remove('hidden');
            onLogin(user);
        } else {
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('app-wrapper').classList.add('hidden');
            onLogout();
        }
    });

    // Handle Login Submit
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('auth-error');
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            errorEl.classList.add('hidden');
        } catch (error) {
            errorEl.textContent = "Invalid email or password.";
            errorEl.classList.remove('hidden');
        }
    });

    // Handle Logout
    const logout = () => signOut(auth);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('logout-btn-mobile').addEventListener('click', logout);
}
