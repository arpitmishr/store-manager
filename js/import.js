// js/import.js
import { db } from './firebase-config.js';
import { collection, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function processJSONUpload(file, statusEl) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            statusEl.textContent = "Uploading...";
            statusEl.classList.remove('hidden');
            const batch = writeBatch(db);
            
            data.forEach(item => {
                const ref = doc(collection(db, 'transactions'));
                batch.set(ref, item);
            });
            await batch.commit();
            statusEl.textContent = "Import successful!";
        } catch(error) { statusEl.textContent = "Error: " + error.message; }
    };
    reader.readAsText(file);
}
