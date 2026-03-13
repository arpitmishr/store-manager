import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Listens to inventory changes and keeps a local cache for instant search
export function listenToInventory(callback) {
    return onSnapshot(collection(db, 'inventory'), (snapshot) => {
        const items =[];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });
        callback(items);
    });
}
