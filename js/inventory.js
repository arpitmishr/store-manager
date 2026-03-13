import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const inventoryRef = collection(db, 'inventory');

// Add a new item to Firestore
export async function addItem(name, qty, price) {
    try {
        await addDoc(inventoryRef, {
            name: name,
            quantity: Number(qty),
            price: Number(price),
            createdAt: new Date()
        });
        return true;
    } catch (error) {
        console.error("Error adding item: ", error);
        return false;
    }
}

// Listen to inventory changes in REAL-TIME
export function listenToInventory(callback) {
    // onSnapshot triggers automatically whenever data changes in Firebase
    return onSnapshot(inventoryRef, (snapshot) => {
        const items =[];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });
        callback(items);
    });
}
