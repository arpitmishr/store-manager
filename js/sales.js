import { db } from './firebase-config.js';
import { doc, getDoc, collection, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function processCartSale(cartItems) {
    // A Batch safely updates multiple documents at the exact same time
    const batch = writeBatch(db);
    let grandTotal = 0;
    const ledgerItems =[];

    try {
        for (let item of cartItems) {
            const itemTotal = item.qty * item.salesRate;
            grandTotal += itemTotal;

            // Format how it looks in the historical transactions ledger
            ledgerItems.push({
                particulars: item.name,
                quantity: item.qty,
                sellingRate: item.salesRate,
                costRate: item.costRate,
                type: item.type // marks it as 'inventory' or 'cosmetic'
            });

            // 1. DEDUCT INVENTORY (ONLY for 'inventory' types)
            if (item.type === 'inventory') {
                const itemRef = doc(db, 'inventory', item.id);
                const itemSnap = await getDoc(itemRef);
                
                if (!itemSnap.exists()) throw new Error(`Item ${item.name} missing from database.`);
                
                const currentQty = itemSnap.data().quantity;
                if (currentQty < item.qty) {
                    throw new Error(`Not enough stock for ${item.name}. Only ${currentQty} left.`);
                }
                
                // Add the deduction to our batch process
                batch.update(itemRef, { quantity: currentQty - item.qty });
            }
        }

        // 2. CREATE THE MASTER SALE RECEIPT
        const newSaleRef = doc(collection(db, 'transactions'));
        batch.set(newSaleRef, {
            type: "Sale",
            saleType: "Cash",
            date: new Date().toISOString(),
            year: new Date().getFullYear(),
            total: grandTotal,
            paidAmount: grandTotal, // Assuming fully paid, adjust if credit is needed
            items: ledgerItems
        });

        // 3. COMMIT ALL CHANGES TO FIREBASE
        await batch.commit();
        
        return { success: true, message: `Sale Successful! Collected: ₹${grandTotal}` };

    } catch (error) {
        console.error("Transaction Error:", error);
        return { success: false, message: error.message };
    }
}
