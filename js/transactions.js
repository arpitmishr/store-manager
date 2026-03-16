import { db } from './firebase-config.js';
import { collection, onSnapshot, query, where, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const txTable = document.getElementById('tx-table');
const yearFilter = document.getElementById('global-year-filter');
let activeListener = null;
let txCache =[];

// Function to load transactions based on selected year
export function loadTransactions() {
    const selectedYear = yearFilter.value;
    
    let q;
    if (selectedYear === "All") {
        q = query(collection(db, "transactions"));
    } else {
        q = query(collection(db, "transactions"), where("year", "==", selectedYear));
    }

    // Unsubscribe from old listener if year is changed
    if (activeListener) activeListener();

    activeListener = onSnapshot(q, (snapshot) => {
        txCache =[];
        txTable.innerHTML = '';
        
        snapshot.forEach(d => txCache.push({ id: d.id, ...d.data() }));
        
        // Sort descending by timestamp (newest first)
        txCache.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        txCache.forEach(tx => {
            const itemStr = tx.items ? tx.items.map(i => `${i.qty}x ${i.name}`).join(', ') : 'N/A';
            
            txTable.innerHTML += `
                <tr class="border-b dark:border-gray-700 ${tx.isReturn ? 'bg-red-50 dark:bg-red-900/20 text-gray-500 line-through' : ''}">
                    <td class="p-3">${tx.date}</td>
                    <td class="p-3">
                        <span class="px-2 py-1 rounded text-xs font-bold ${tx.type === 'Purchase' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                            ${tx.type}
                        </span>
                        <br><span class="text-xs text-gray-500">${tx.customer || ''}</span>
                    </td>
                    <td class="p-3 text-xs max-w-xs truncate" title="${itemStr}">${itemStr}</td>
                    <td class="p-3 font-bold">₹${(tx.total || 0).toFixed(2)}</td>
                    <td class="p-3 ${tx.profit > 0 ? 'text-green-600' : (tx.profit < 0 ? 'text-red-600' : '')}">
                        ${tx.type !== 'Purchase' ? `₹${(tx.profit || 0).toFixed(2)}` : '-'}
                    </td>
                    <td class="p-3">
                        ${!tx.isReturn && tx.type !== 'Purchase' ? `<button onclick="processReturn('${tx.id}')" class="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold shadow hover:bg-red-600">Return</button>` : (tx.isReturn ? '<span class="text-red-500 font-bold text-xs">Returned</span>' : '')}
                    </td>
                </tr>
            `;
        });
    });
}

// Global Event Dispatcher: When year changes, update all modules!
yearFilter.addEventListener('change', () => {
    loadTransactions();
    window.dispatchEvent(new Event('yearChanged')); // Tells Dashboard & Analytics to reload
});

// Initial load
loadTransactions();

// Excel Export
document.getElementById('export-excel').addEventListener('click', () => {
    const ws = XLSX.utils.json_to_sheet(txCache.map(t => ({
        Date: t.date,
        Year: t.year,
        Type: t.type,
        Customer: t.customer, 
        Items: t.items ? t.items.map(i=>i.name).join(', ') : '', 
        Total_Revenue: t.total,
        Profit: t.type !== 'Purchase' ? t.profit : 0,
        Status: t.isReturn ? "Returned" : "Valid"
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Transactions_${yearFilter.value}`);
    XLSX.writeFile(wb, `Tinny_Transactions_${yearFilter.value}.xlsx`);
});

// Return Logic (Restores Stock & Adjusts Ledgers)
window.processReturn = async (id) => {
    if(!confirm("Process complete return? This restores inventory and deducts the sale.")) return;
    const tx = txCache.find(t => t.id === id);
    
    try {
        for(const item of tx.items) {
            // Find inventory document ID. In import, we set ID as lowercase name with underscores.
            const invId = item.id || item.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
            if(!item.isCosmetic) {
                await updateDoc(doc(db, "inventory", invId), { qty: increment(item.qty) });
            }
        }
        if(tx.type === 'Credit' && tx.customer) {
            await updateDoc(doc(db, "credit_ledgers", tx.customer), { amount: increment(-tx.total) });
        }
        await updateDoc(doc(db, "transactions", id), { isReturn: true });
        alert("Return processed successfully.");
    } catch (e) {
        console.error(e);
        alert("Error processing return. See console.");
    }
};
