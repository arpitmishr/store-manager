import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Function to handle new purchases with Weighted Average Costing
export const addStock = async (itemId, newQty, newPurchasePrice) => {
    const itemRef = doc(db, "inventory", itemId);
    const itemSnap = await getDoc(itemRef);

    if (itemSnap.exists()) {
        const data = itemSnap.data();
        const oldQty = data.quantity;
        const oldAvgCost = data.avgCost;

        // Calculate Weighted Average
        const totalOldValue = oldQty * oldAvgCost;
        const totalNewValue = newQty * newPurchasePrice;
        const finalQty = oldQty + newQty;
        const newAvgCost = (totalOldValue + totalNewValue) / finalQty;

        // Update Firestore
        await updateDoc(itemRef, {
            quantity: finalQty,
            avgCost: newAvgCost
        });
        console.log("Stock updated with new weighted average cost.");
    } else {
        // Create new item
        await setDoc(itemRef, {
            quantity: newQty,
            avgCost: newPurchasePrice
        });
    }
};
