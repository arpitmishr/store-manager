import { db } from './firebase-config.js';
import { doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Ensure the page is fully loaded before attaching events
document.addEventListener('DOMContentLoaded', () => {
    const importBtn = document.getElementById('btn-import-json');
    
    if (!importBtn) {
        console.error("Migration button not found! Check if ID 'btn-import-json' exists in index.html");
        return;
    }

    importBtn.addEventListener('click', () => {
        console.log("Migration button clicked!");
        
        const fileInput = document.getElementById('json-import-file');
        const statusText = document.getElementById('import-status');
        
        if (!fileInput.files || fileInput.files.length === 0) {
            alert("Please select the JSON file first!");
            return;
        }

        const file = fileInput.files[0];
        console.log("File selected:", file.name);
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                statusText.innerText = "Parsing JSON...";
                console.log("File read successfully, parsing JSON...");
                const data = JSON.parse(e.target.result);
                await processMigration(data, statusText);
            } catch (error) {
                statusText.innerText = "Error parsing file. Check console.";
                console.error("JSON Parsing Error:", error);
                alert("Failed to parse JSON. Ensure the file format is correct.");
            }
        };
        
        reader.onerror = (err) => {
            console.error("File Reader Error:", err);
            statusText.innerText = "Error reading file.";
        };

        reader.readAsText(file);
    });
});

async function processMigration(data, statusText) {
    statusText.innerText = "Preparing Firebase Batch Upload... Please wait.";
    console.log("Starting Firebase Batch Migration...");
    
    try {
        let batch = writeBatch(db);
        let operationCount = 0;

        const commitBatch = async () => {
            console.log("Committing batch of 450 items...");
            await batch.commit();
            batch = writeBatch(db);
            operationCount = 0;
        };

        // 1. PROCESS INVENTORY
        const inventoryMap = {};
        if(data.inventory && Array.isArray(data.inventory)) {
            console.log(`Processing ${data.inventory.length} inventory items...`);
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
        } else {
            console.warn("No 'inventory' array found in JSON");
        }
        
        statusText.innerText = "Inventory mapped... processing transactions.";

        // 2. PROCESS TRANSACTIONS & CREDIT
        const creditMap = {}; 
        
        if(data.transactions && Array.isArray(data.transactions)) {
            console.log(`Processing ${data.transactions.length} transactions...`);
            data.transactions.forEach(tx => {
                const txId = tx.id.toString();
                const txYear = tx.date ? tx.date.substring(0, 4) : new Date().getFullYear().toString();
                
                let calculatedProfit = 0;
                let formattedItems =[];

                if (tx.items && Array.isArray(tx.items)) {
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
                            price: price || 0,
                            cost: cost || 0,
                            isCosmetic: i.particulars.toLowerCase().includes("(cosmetic)")
                        });
                    });
                }

                const txDoc = {
                    date: tx.date.split('T')[0],
                    year: txYear,
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
        } else {
            console.warn("No 'transactions' array found in JSON");
        }

        // 3. PROCESS CREDIT LEDGERS
        console.log("Processing Credit Ledgers...");
        for (const[customerName, amount] of Object.entries(creditMap)) {
            batch.set(doc(db, "credit_ledgers", customerName), { name: customerName, amount: amount });
            operationCount++;
            if (operationCount >= 450) await commitBatch();
        }

        await commitBatch(); // Final push
        console.log("Migration completely finished!");
        statusText.innerText = "✅ Migration Complete! Data is now live.";
        alert("System Data Migrated Successfully. Please refresh the page.");
        
    } catch (err) {
        console.error("Firebase Batch Error:", err);
        statusText.innerText = "❌ Firebase Error. Check Console.";
        alert("Error connecting to Firebase. Make sure your Firestore rules allow writing.");
    }
}
