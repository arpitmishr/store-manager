import { db } from './firebase-config.js';
import { collection, addDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function processJSONUpload(file, statusElement) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            statusElement.textContent = "Data read successfully. Uploading to database... Do not close window.";
            
            // 1. Upload Inventory
            if(data.inventory && data.inventory.length > 0) {
                const invRef = collection(db, 'inventory');
                for (let item of data.inventory) {
                    await addDoc(invRef, {
                        name: item.particulars,
                        quantity: Number(item.quantity),
                        price: Number(item.rate),
                        createdAt: new Date().toISOString()
                    });
                }
            }

            // 2. Upload Transactions (Sales, Purchases, Credit)
            if(data.transactions && data.transactions.length > 0) {
                const transRef = collection(db, 'transactions');
                for (let t of data.transactions) {
                    // Extract year for easy filtering later
                    const dateObj = new Date(t.date);
                    const year = dateObj.getFullYear();

                    await setDoc(doc(transRef, t.id.toString()), {
                        type: t.type, // "Sale" or "Purchase"
                        saleType: t.saleType || "Cash", 
                        partyName: t.partyName || null,
                        date: t.date,
                        year: year, // Storing year explicitly
                        total: Number(t.total),
                        paidAmount: Number(t.paidAmount),
                        items: t.items.map(i => ({
                            name: i.particulars,
                            quantity: i.quantity,
                            sellingRate: i.sellingRate || 0,
                            costRate: i.costRate || i.rate || 0
                        }))
                    });
                }
            }
            
            statusElement.textContent = "✅ Import Complete! Refresh the page to see your data.";
            statusElement.className = "mt-4 font-bold text-green-600";
        } catch (error) {
            console.error(error);
            statusElement.textContent = "❌ Error parsing JSON or uploading data.";
            statusElement.className = "mt-4 font-bold text-red-600";
        }
    };
    
    reader.readAsText(file);
}
