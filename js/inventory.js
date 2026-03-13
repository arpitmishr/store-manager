import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Listen to inventory changes in REAL-TIME (Keeps search fast and accurate)
export function listenToInventory(callback) {
    return onSnapshot(collection(db, 'inventory'), (snapshot) => {
        const items =[];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });
        callback(items);
    });
}

// Optimized Search via prefix querying
export async function searchInventoryByName(searchText) {
    const searchLower = searchText.toLowerCase();
    const q = query(
        collection(db, 'inventory'),
        where('nameLower', '>=', searchLower),
        where('nameLower', '<=', searchLower + '\uf8ff'),
        limit(20)
    );
    return await getDocs(q);
}

