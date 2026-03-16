import { db } from './firebase-config.js';
import { collection, getDocs, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Merge Duplicates Logic
document.getElementById('btn-merge').addEventListener('click', async () => {
    if(!confirm("This will scan and merge similarly named items. Proceed?")) return;
    
    const snap = await getDocs(collection(db, "inventory"));
    let items =[];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));

    let mergedCount = 0;

    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            // Trim and lowercase comparison to catch "Shirt " and "shirt"
            if (items[i].name.trim().toLowerCase() === items[j].name.trim().toLowerCase() && items[i].id !== items[j].id) {
                
                const itemA = items[i];
                const itemB = items[j];

                const totalQty = itemA.qty + itemB.qty;
                const totalVal = (itemA.qty * itemA.avgCost) + (itemB.qty * itemB.avgCost);
                const newAvg = totalQty === 0 ? 0 : (totalVal / totalQty);

                // Update A
                await updateDoc(doc(db, "inventory", itemA.id), { qty: totalQty, avgCost: newAvg });
                // Delete B
                await deleteDoc(doc(db, "inventory", itemB.id));
                
                // Remove B from array so it isn't processed again
                items.splice(j, 1);
                j--; 
                mergedCount++;
            }
        }
    }
    alert(`Cleanup complete. Merged ${mergedCount} duplicates.`);
});

// Excel Bulk Import Placeholder Logic
document.getElementById('btn-import').addEventListener('click', () => {
    const file = document.getElementById('excel-import').files[0];
    if(!file) return alert("Select an Excel file first.");
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet);
        
        alert(`Found ${json.length} rows. Please map columns to proceed (Implementation dependent on your excel format).`);
        // Here you would map json rows to addStock() from inventory.js
    };
    reader.readAsArrayBuffer(file);
});
