import { db } from './firebase-config.js';
import { doc, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

document.getElementById('btn-import-json').addEventListener('click', () => {
    const file = document.getElementById('json-import-file').files[0];
    const statusText = document.getElementById('import-status');
    
    if(!file) return alert("Please select the JSON file first!");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            statusText.innerText = "Parsing JSON...";
            const data = JSON.parse(e.target.result);
            await processMigration(data, statusText);
        } catch (error) {
            statusText.innerText = "Error parsing file.";
            console.error(error);
        }
    };
    reader.readAsText(file);
});

async function processMigration(data, statusText) {
    statusText.innerText = "Preparing Firebase Batch Upload...";
    
    // Firestore allows 500 writes per batch. We will chunk them.
    let batch = writeBatch(db);
    let operationCount = 0;

    const commitBatch = async () => {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
    };

    // 1. PROCESS INVENTORY (Merge duplicates during import)
    const inventoryMap = {};
    data.inventory.forEach(item => {
        const id = item.particulars.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        if (inventoryMap[id]) {
            // Merge duplicate logic (Weighted Average)
            const oldQty = inventoryMap[id].qty;
            const oldVal = oldQty * inventoryMap[id].avgCost;
            const newVal = item.quantity * item.rate;
            const newQty = oldQty + item.quantity;
            inventoryMap[id].qty = newQty;
            inventoryMap[id].avgCost = newQty === 0 ? item.rate : (oldVal + newVal) / newQty;
        } else {
            inventoryMap[id] = {
                name: item.particulars.trim(),
                qty: item.quantity,
                avgCost: item.rate,
                isCosmetic: item.particulars.toLowerCase().includes("(cosmetic)")
            };
        }
    });

    for (const [id, item] of Object.entries(inventoryMap)) {
        const ref = doc(db, "inventory", id);
        batch.set(ref, item);
        operationCount++;
        if (operationCount >= 450) await commitBatch();
    }
    statusText.innerText = "Inventory migrated... processing transactions.";

    // 2. PROCESS TRANSACTIONS & CREDIT LEDGERS
    const creditMap = {}; // To track customers who didn't pay in full

    data.transactions.forEach(tx => {
        const txId = tx.id.toString();
        const year = tx.date.substring(0, 4); // Extract Year (e.g., "2026")
        
        let calculatedProfit = 0;
        let formattedItems =[];

        // Calculate exact profit and format items
        if (tx.items) {
            tx.items.forEach(i => {
                const isPurchase = tx.type === "Purchase";
                const price = isPurchase ? i.rate : i.sellingRate;
                const cost = isPurchase ? i.rate : i.costRate;
                
                if (!isPurchase) {
                    calculatedProfit += (price - cost) * i.quantity;
                }

                formattedItems.push({
                    name: i.particulars,
                    qty: i.quantity,
                    price: price,
                    cost: cost
                });
            });
        }

        const txDoc = {
            date: tx.date.split('T')[0],
            year: year, // ADDED FOR YEAR-WISE FILTERING
            timestamp: tx.date,
            type: tx.type === "Purchase" ? "Purchase" : (tx.saleType || "Cash"),
            customer: tx.partyName || (tx.type === "Purchase" ? "Supplier" : "Walk-in"),
            items: formattedItems,
            total: tx.total,
            profit: calculatedProfit,
            isReturn: false,
            isPurchase: tx.type === "Purchase"
        };

        const txRef = doc(db, "transactions", txId);
        batch.set(txRef, txDoc);
        operationCount++;

        // Handle Credit Sales where paidAmount < total
        if (tx.saleType === "Credit" && tx.partyName) {
            const amountOwed = tx.total - (tx.paidAmount || 0);
            if (amountOwed > 0) {
                creditMap[tx.partyName] = (creditMap[tx.partyName] || 0) + amountOwed;
            }
        }

        if (operationCount >= 450) commitBatch(); // Trigger commit if batch is getting full
    });

    statusText.innerText = "Transactions migrated... processing ledgers.";

    // 3. PROCESS CREDIT LEDGERS
    for (const [customerName, amount] of Object.entries(creditMap)) {
        const ref = doc(db, "credit_ledgers", customerName);
        batch.set(ref, { name: customerName, amount: amount });
        operationCount++;
        if (operationCount >= 450) await commitBatch();
    }

    await commitBatch(); // Final commit
    statusText.innerText = "✅ Migration Complete! Data is now live.";
    alert("Data successfully imported to Firebase!");
}
