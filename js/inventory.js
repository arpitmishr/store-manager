
import { db } from './firebase-config.js';
import { collection, query, orderBy, limit, startAfter, getDocs, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Fetch paginated inventory (limits reads massively)
export async function getInventoryPage(cursorDoc = null, pageSize = 15) {
    let q = query(collection(db, 'inventory'), orderBy('createdAt', 'desc'), limit(pageSize));
    if (cursorDoc) {
        q = query(collection(db, 'inventory'), orderBy('createdAt', 'desc'), startAfter(cursorDoc), limit(pageSize));
    }
    return await getDocs(q);
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

