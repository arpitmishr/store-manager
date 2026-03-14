// js/sales.js
import { db } from './firebase-config.js';
import { collection, doc, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function processCartSale(cart) {
    try {
        const batch = writeBatch(db);
        let total = 0;
        const itemsToSave =[];

        for (const item of cart) {
            const itemTotal = item.qty * item.salesRate;
            total += itemTotal;
            itemsToSave.push({ particulars: item.name, quantity: item.qty, rate: item.salesRate, type: item.type, id: item.id || null });

            if (item.type === 'inventory' && item.id) {
                const itemRef = doc(db, 'inventory', item.id);
                const itemSnap = await getDoc(itemRef);
                if(itemSnap.exists()) {
                    batch.update(itemRef, { quantity: itemSnap.data().quantity - item.qty });
                }
            }
        }

        const transRef = doc(collection(db, 'transactions'));
        batch.set(transRef, { type: "Sale", date: new Date().toISOString(), year: new Date().getFullYear(), total: total, status: "Completed", items: itemsToSave });

        await batch.commit();
        return { success: true, message: "Sale recorded successfully!" };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

export async function returnTransaction(transactionId) {
    try {
        const transRef = doc(db, 'transactions', transactionId);
        const transSnap = await getDoc(transRef);
        if (!transSnap.exists()) return { success: false, message: "Not found." };
        
        const data = transSnap.data();
        if (data.status === 'Returned') return { success: false, message: "Already returned." };

        const batch = writeBatch(db);
        if (data.items) {
            for (const item of data.items) {
                if (item.type === 'inventory' && item.id) {
                    const itemRef = doc(db, 'inventory', item.id);
                    const itemSnap = await getDoc(itemRef);
                    if (itemSnap.exists()) batch.update(itemRef, { quantity: itemSnap.data().quantity + item.quantity });
                }
            }
        }
        
        batch.update(transRef, { status: 'Returned' });
        await batch.commit();
        return { success: true, message: "Sale Refunded & Stock Restored." };
    } catch (error) { return { success: false, message: error.message }; }
}
