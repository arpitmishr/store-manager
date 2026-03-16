import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const invTable = document.getElementById('inventory-table');
const addBtn = document.getElementById('btn-add-stock');

// Real-time table
onSnapshot(collection(db, "inventory"), (snapshot) => {
    invTable.innerHTML = '';
    snapshot.forEach(docSnap => {
        const item = docSnap.data();
        const rowClass = item.qty > 10 ? 'stock-good' : (item.qty > 3 ? 'stock-warning' : 'stock-danger');
        invTable.innerHTML += `
            <tr class="border-b dark:border-gray-700 ${item.isCosmetic ? '' : rowClass}">
                <td class="p-3 font-semibold">${item.name}</td>
                <td class="p-3">${item.isCosmetic ? 'Cosmetic' : 'Physical'}</td>
                <td class="p-3">${item.isCosmetic ? '-' : item.qty}</td>
                <td class="p-3">₹${item.avgCost.toFixed(2)}</td>
                <td class="p-3"><button class="text-blue-500" onclick="window.editStock('${docSnap.id}')">Edit</button></td>
            </tr>
        `;
    });
});

addBtn.addEventListener('click', () => {
    const name = prompt("Enter Item Name:");
    if(!name) return;
    const qty = parseFloat(prompt("Enter Quantity:")) || 0;
    const price = parseFloat(prompt("Enter Total Purchase Cost for these units:")) || 0;
    const unitPrice = price/qty;
    addStock(name.trim().toLowerCase(), name, qty, unitPrice);
});

async function addStock(id, name, newQty, newCost) {
    const ref = doc(db, "inventory", id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const d = snap.data();
        const oldVal = d.qty * d.avgCost;
        const newVal = newQty * newCost;
        const fQty = d.qty + newQty;
        const fAvg = (oldVal + newVal) / fQty;
        await updateDoc(ref, { qty: fQty, avgCost: fAvg });
    } else {
        await setDoc(ref, { name, qty: newQty, avgCost: newCost, isCosmetic: false });
    }
}
window.editStock = async (id) => {
    const newVal = prompt("Adjust quantity explicitly (+ or -):");
    if(newVal) {
        const ref = doc(db, "inventory", id);
        const snap = await getDoc(ref);
        await updateDoc(ref, { qty: snap.data().qty + parseFloat(newVal) });
    }
}
