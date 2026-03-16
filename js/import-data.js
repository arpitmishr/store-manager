import { db } from './firebase-config.js';
import { doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
            statusText.innerText = "Error parsing file. Ensure it's valid JSON.";
            console.error(error);
        }
    };
    reader.readAsText(file);
});

async function processMigration(data, statusText) {
    statusText.innerText = "Preparing Firebase Batch Upload...";
    
    // Firestore allows max 500 writes per batch
    let batch = writeBatch(db);
    let operationCount = 0;

    const commitBatch = async () => {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
    };

    // 1. PROCESS INVENTORY (Merge duplicates securely)
    const inventoryMap = {};
    if(data.inventory) {
        data.inventory.forEach(item => {
            const nameTrim = item.particulars.trim();
            const id = nameTrim.toLowerCase().replace(/[^a-z0-9]/g, '_');
            
            if (inventoryMap[id]) {
                const oldQty = inventoryMap[id].qty;
                const oldVal = oldQty * inventoryMap[id].avgCost;
                const newVal = item.quantity * item.rate;
                const newQty = oldQty + item.quantity;
                inventoryMap[id].qty = newQty;
                inventoryMap[id].avgCost = newQty === 0 ? item.rate : (oldVal + newVal) / newQty;
            } else {
                inventoryMap[id] = {
                    name: nameTrim,
                    qty: item.quantity,
                    avgCost: item.rate,
                    isCosmetic: nameTrim.toLowerCase().includes("(cosmetic)") || nameTrim.toLowerCase().includes("abnormal profit")
                };
            }
        });

        for (const [id, item] of Object.entries(inventoryMap)) {
            batch.set(doc(db, "inventory", id), item);
            operationCount++;
            if (operationCount >= 450) await commitBatch();
        }
    }
    statusText.innerText = "Inventory mapped... processing transactions.";

    // 2. PROCESS TRANSACTIONS & CREDIT
    const creditMap = {}; 
    
    if(data.transactions) {
        data.transactions.forEach(tx => {
            const txId = tx.id.toString();
            // Extract the year (e.g., "2026") directly from your ISO date strings
            const txYear = tx.date ? tx.date.substring(0, 4) : new Date().getFullYear().toString();
            
            let calculatedProfit = 0;
            let formattedItems =[];

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
                        id: i.particulars.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'),
                        qty: i.quantity,
                        price: price,
                        cost: cost,
                        isCosmetic: i.particulars.toLowerCase().includes("(cosmetic)")
                    });
                });
            }

            const txDoc = {
                date: tx.date.split('T')[0],
                year: txYear, // Added for filtering!
                timestamp: tx.date,
                type: tx.type === "Purchase" ? "Purchase" : (tx.saleType || "Cash"),
                customer: tx.partyName || (tx.type === "Purchase" ? "Supplier" : "Walk-in"),
                items: formattedItems,
                total: tx.total || 0,
                profit: calculatedProfit,
                isReturn: false,
                isPurchase: tx.type === "Purchase"
            };

            batch.set(doc(db, "transactions", txId), txDoc);
            operationCount++;

            // Track pending Credit balances
            if (tx.saleType === "Credit" && tx.partyName) {
                const amountOwed = (tx.total || 0) - (tx.paidAmount || 0);
                if (amountOwed > 0) {
                    creditMap[tx.partyName] = (creditMap[tx.partyName] || 0) + amountOwed;
                }
            }

            if (operationCount >= 450) commitBatch(); 
        });
    }

    // 3. PROCESS CREDIT LEDGERS
    for (const [customerName, amount] of Object.entries(creditMap)) {
        batch.set(doc(db, "credit_ledgers", customerName), { name: customerName, amount: amount });
        operationCount++;
        if (operationCount >= 450) await commitBatch();
    }

    await commitBatch(); // Final push
    statusText.innerText = "✅ Migration Complete! Data is now live.";
    alert("System Data Migrated Successfully. Please refresh the page.");
}
