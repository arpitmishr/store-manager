import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const creditList = document.getElementById('credit-list');
const payCustomerSelect = document.getElementById('pay-customer');

onSnapshot(collection(db, "credit_ledgers"), (snapshot) => {
    creditList.innerHTML = '';
    payCustomerSelect.innerHTML = '<option value="">Select Customer</option>';
    
    snapshot.forEach(d => {
        const data = d.data();
        if(data.amount > 0) {
            creditList.innerHTML += `
                <li class="flex justify-between border-b dark:border-gray-700 py-2">
                    <span class="font-semibold">${data.name}</span>
                    <span class="text-red-500 font-bold">₹${data.amount.toFixed(2)}</span>
                </li>`;
            payCustomerSelect.innerHTML += `<option value="${d.id}">${data.name} (Owes: ₹${data.amount.toFixed(2)})</option>`;
        }
    });
});

document.getElementById('process-payment').addEventListener('click', async () => {
    const custId = payCustomerSelect.value;
    const amt = parseFloat(document.getElementById('pay-amount').value);
    
    if(!custId || !amt) return alert("Select customer and enter valid amount.");
    
    await updateDoc(doc(db, "credit_ledgers", custId), { amount: increment(-amt) });
    document.getElementById('pay-amount').value = '';
    alert("Payment recorded!");
});6
