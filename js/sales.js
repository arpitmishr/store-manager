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

            // Saves using the JSON structure for consistency
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

export async function returnTransaction(transactionId) {
    const transRef = doc(db, 'transactions', transactionId);
    const batch = writeBatch(db);

    try {
        const tSnap = await getDoc(transRef);
        if(!tSnap.exists()) throw new Error("Transaction not found");

        const tData = tSnap.data();
        if(tData.status === 'Returned') throw new Error("This sale was already returned.");
        if(tData.type !== 'Sale') throw new Error("Only sales can be returned.");

        // Loop items to restock
        for(let item of tData.items) {
            // Read JSON 'particulars'
            const itemName = item.particulars || item.name;
            const isCosmetic = item.type === 'cosmetic' || (itemName && itemName.toLowerCase().includes('cosmetic'));
            
            if(!isCosmetic) {
                const invQuery = query(collection(db, 'inventory'),
                    where('name', '==', itemName),
                    where('price', '==', item.costRate || item.rate || 0)
                );
                const invSnap = await getDocs(invQuery);

                if(!invSnap.empty) {
                    const invDoc = invSnap.docs[0];
                    const currentQty = invDoc.data().quantity;
                    batch.update(invDoc.ref, { quantity: currentQty + item.quantity });
                } else {
                    const newInvRef = doc(collection(db, 'inventory'));
                    batch.set(newInvRef, {
                        name: itemName,
                        price: item.costRate || item.rate || 0,
                        quantity: item.quantity,
                        createdAt: new Date().toISOString()
                    });
                }
            }
        }

        batch.update(transRef, { status: 'Returned' });
        await batch.commit();
        return { success: true, message: "Transaction returned. Inventory restocked." };

    } catch (err) {
        console.error(err);
        return { success: false, message: err.message };
    }
}
