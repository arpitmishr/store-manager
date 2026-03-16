import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const txTable = document.getElementById('tx-table');
let txCache =[];

onSnapshot(collection(db, "transactions"), (snapshot) => {
    txCache =[]; txTable.innerHTML = '';
    snapshot.forEach(d => txCache.push({ id: d.id, ...d.data() }));
    txCache.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)); // Descending

    txCache.forEach(tx => {
        const itemStr = tx.items.map(i => `${i.qty}x ${i.name}`).join(', ');
        txTable.innerHTML += `
            <tr class="border-b dark:border-gray-700 ${tx.isReturn ? 'line-through text-gray-500' : ''}">
                <td class="p-2">${tx.date}</td>
                <td class="p-2">${tx.type} ${tx.customer !== 'Walk-in' ? `(${tx.customer})` : ''}</td>
                <td class="p-2">${itemStr}</td>
                <td class="p-2">₹${tx.total.toFixed(2)}</td>
                <td class="p-2">₹${tx.profit.toFixed(2)}</td>
                <td class="p-2">
                    ${!tx.isReturn ? `<button onclick="processReturn('${tx.id}')" class="bg-red-500 text-white px-2 py-1 rounded text-xs">Return</button>` : 'Returned'}
                </td>
            </tr>
        `;
    });
});

window.processReturn = async (id) => {
    if(!confirm("Process complete return for this transaction?")) return;
    const tx = txCache.find(t => t.id === id);
    
    // Add stock back
    for(const item of tx.items) {
        if(!item.isCosmetic) await updateDoc(doc(db, "inventory", item.id), { qty: increment(item.qty) });
    }
    
    // Deduct from credit if it was a credit sale
    if(tx.type === 'Credit') {
        await updateDoc(doc(db, "credit_ledgers", tx.customer), { amount: increment(-tx.total) });
    }

    // Mark as return
    await updateDoc(doc(db, "transactions", id), { isReturn: true });
    alert("Returned successfully.");
};

document.getElementById('export-excel').addEventListener('click', () => {
    const ws = XLSX.utils.json_to_sheet(txCache.map(t => ({
        Date: t.date, Type: t.type, Customer: t.customer, 
        Items: t.items.map(i=>i.name).join(', '), 
        Total: t.total, Profit: t.profit, Status: t.isReturn ? "Returned" : "Valid"
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `Tinny_Transactions_${new Date().toISOString().split('T')[0]}.xlsx`);
});
