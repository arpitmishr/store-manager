import { db } from './firebase-config.js';
import { collection, setDoc, doc, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function processJSONUpload(file, statusElement) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            statusElement.textContent = "Uploading Inventory... Please do not close window.";
            
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

            statusElement.textContent = "Uploading Transaction History... Please wait.";
            
            // 2. Upload Transactions
            if(data.transactions && data.transactions.length > 0) {
                const transRef = collection(db, 'transactions');
                for (let t of data.transactions) {
                    const dateObj = new Date(t.date);
                    
                    await setDoc(doc(transRef, t.id.toString()), {
                        type: t.type,
                        saleType: t.saleType || "Cash", 
                        partyName: t.partyName || null,
                        date: t.date,
                        year: dateObj.getFullYear(),
                        total: Number(t.total),
                        paidAmount: Number(t.paidAmount),
                        status: "Completed", 
                        items: t.items.map(i => ({
                            // Maps your exact JSON fields
                            particulars: i.particulars || i.name || "Unknown Item",
                            quantity: i.quantity,
                            sellingRate: i.sellingRate || 0,
                            costRate: i.costRate || i.rate || 0,
                            type: (i.particulars && i.particulars.toLowerCase().includes('cosmetic')) ? 'cosmetic' : 'inventory'
                        }))
                    });
                }
            }
            
            statusElement.textContent = "✅ Import Complete! Refresh the page to see History.";
            statusElement.className = "mt-4 font-bold text-green-600";
        } catch (error) {
            console.error(error);
            statusElement.textContent = "❌ Error: " + error.message;
            statusElement.className = "mt-4 font-bold text-red-600";
        }
    };
    
    reader.readAsText(file);
}
