import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function processSale(itemId, quantitySold) {
    const itemRef = doc(db, 'inventory', itemId);
    
    try {
        // 1. Get current item data
        const itemSnap = await getDoc(itemRef);
        if (!itemSnap.exists()) throw new Error("Item not found");
        
        const itemData = itemSnap.data();
        
        // 2. Check if we have enough stock
        if (itemData.quantity < quantitySold) {
            throw new Error(`Not enough stock. Only ${itemData.quantity} left.`);
        }

        // 3. Deduct stock
        const newQuantity = itemData.quantity - quantitySold;
        await updateDoc(itemRef, { quantity: newQuantity });

        // 4. Record the sale in a 'sales' collection
        const totalAmount = itemData.price * quantitySold;
        await addDoc(collection(db, 'sales'), {
            itemId: itemId,
            itemName: itemData.name,
            quantity: quantitySold,
            totalAmount: totalAmount,
            date: new Date()
        });

        return { success: true, message: `Successfully sold ${quantitySold} ${itemData.name}(s) for ₹${totalAmount}` };

    } catch (error) {
        return { success: false, message: error.message };
    }
}
