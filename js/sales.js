import { db } from './firebase-config.js';
import { doc, getDoc, collection, writeBatch, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function processCartSale(cartItems) {
    const batch = writeBatch(db);
    let grandTotal = 0;
    const ledgerItems =[];

    try {
        for (let item of cartItems) {
            const itemTotal = item.qty * item.salesRate;
            grandTotal += itemTotal;

            ledgerItems.push({
                particulars: item.name,
                quantity: item.qty,
                sellingRate: item.salesRate,
                costRate: item.costRate,
                type: item.type 
            });

            if (item.type === 'inventory') {
                const itemRef = doc(db, 'inventory', item.id);
                const itemSnap = await getDoc(itemRef);
                
                if (!itemSnap.exists()) throw new Error(`Item ${item.name} missing from database.`);
                
                const currentQty = itemSnap.data().quantity;
                if (currentQty < item.qty) {
                    throw new Error(`Not enough stock for ${item.name}. Only ${currentQty} left.`);
                }
                
                batch.update(itemRef, { quantity: currentQty - item.qty });
            }
        }

        const newSaleRef = doc(collection(db, 'transactions'));
        batch.set(newSaleRef, {
            type: "Sale",
            saleType: "Cash",
            date: new Date().toISOString(),
            year: new Date().getFullYear(),
            total: grandTotal,
            paidAmount: grandTotal,
            status: "Completed",
            items: ledgerItems
        });

        await batch.commit();
        return { success: true, message: `Sale Successful! Collected: ₹${grandTotal}` };

    } catch (error) {
        console.error("Transaction Error:", error);
        return { success: false, message: error.message };
    }
}

// NEW FUNCTION: Handles Returns and Restocking
export async function returnTransaction(transactionId) {
    const transRef = doc(db, 'transactions', transactionId);
    const batch = writeBatch(db);

    try {
        const tSnap = await getDoc(transRef);
        if(!tSnap.exists()) throw new Error("Transaction not found");

        const tData = tSnap.data();
        if(tData.status === 'Returned') throw new Error("This sale was already returned.");
        if(tData.type !== 'Sale') throw new Error("Only sales can be returned.");

        // Loop through the items sold in this transaction to restock them
        for(let item of tData.items) {
            // Check if it's cosmetic (either by explicit type or by name for imported data)
            const isCosmetic = item.type === 'cosmetic' || (item.particulars && item.particulars.toLowerCase().includes('(cosmetic)'));
            
            if(!isCosmetic) {
                // Find original inventory item by matching name & cost rate
                const invQuery = query(collection(db, 'inventory'),
                    where('name', '==', item.particulars),
                    where('price', '==', item.costRate || item.rate)
                );
                const invSnap = await getDocs(invQuery);

                if(!invSnap.empty) {
                    // Item batch still exists, add stock back
                    const invDoc = invSnap.docs[0];
                    const currentQty = invDoc.data().quantity;
                    batch.update(invDoc.ref, { quantity: currentQty + item.quantity });
                } else {
                    // The batch was deleted, recreate it so stock is saved
                    const newInvRef = doc(collection(db, 'inventory'));
                    batch.set(newInvRef, {
                        name: item.particulars,
                        price: item.costRate || item.rate || 0,
                        quantity: item.quantity,
                        createdAt: new Date().toISOString()
                    });
                }
            }
        }

        // Mark the transaction as returned
        batch.update(transRef, { status: 'Returned' });
        await batch.commit();

        return { success: true, message: "Transaction returned. Inventory has been restocked." };

    } catch (err) {
        console.error(err);
        return { success: false, message: err.message };
    }
}
