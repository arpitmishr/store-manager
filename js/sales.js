import { db } from './firebase-config.js';
import { collection, getDocs, addDoc, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let cart = [];
let inventoryCache =[];

// Load Inventory for Search
const loadInv = async () => {
    const snap = await getDocs(collection(db, "inventory"));
    inventoryCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
document.addEventListener('DOMContentLoaded', loadInv);

const searchInput = document.getElementById('pos-search');
const resultsBox = document.getElementById('pos-results');
const cartTable = document.getElementById('cart-table');
const saleType = document.getElementById('sale-type');
const customerInput = document.getElementById('credit-customer');

saleType.addEventListener('change', (e) => {
    customerInput.classList.toggle('hidden', e.target.value !== 'credit');
});

searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    resultsBox.innerHTML = '';
    if(q.length < 1) { resultsBox.classList.add('hidden'); return; }
    
    const matches = inventoryCache.filter(i => i.name.toLowerCase().includes(q) && (i.qty > 0 || i.isCosmetic));
    matches.forEach(m => {
        const li = document.createElement('li');
        li.className = "p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex justify-between";
        li.innerHTML = `<span>${m.name}</span> <span class="text-gray-500">Stock: ${m.isCosmetic ? '∞' : m.qty} | WAC: ₹${m.avgCost.toFixed(2)}</span>`;
        li.onclick = () => addToCart(m);
        resultsBox.appendChild(li);
    });
    resultsBox.classList.remove('hidden');
});

document.getElementById('pos-add-cosmetic').addEventListener('click', () => {
    const name = prompt("Cosmetic Service/Item Name:");
    const price = parseFloat(prompt("Price:"));
    if(name && price) addToCart({ id: 'cosm_'+Date.now(), name, qty: 1, avgCost: 0, isCosmetic: true, customPrice: price });
});

function addToCart(item) {
    resultsBox.classList.add('hidden'); searchInput.value = '';
    const existing = cart.find(c => c.id === item.id);
    if(existing) {
        if(!item.isCosmetic && existing.sellQty >= item.qty) return alert("Not enough stock!");
        existing.sellQty++;
    } else {
        const sellPrice = item.customPrice || parseFloat(prompt(`Selling price for ${item.name} (WAC: ₹${item.avgCost.toFixed(2)}):`));
        if(!sellPrice) return;
        cart.push({ ...item, sellQty: 1, sellPrice });
    }
    renderCart();
}

function renderCart() {
    cartTable.innerHTML = '';
    let total = 0, qty = 0;
    cart.forEach((c, i) => {
        total += (c.sellQty * c.sellPrice); qty += c.sellQty;
        cartTable.innerHTML += `
            <tr class="border-b dark:border-gray-700">
                <td class="py-2">${c.name}</td>
                <td><input type="number" min="1" max="${c.isCosmetic?'':c.qty}" value="${c.sellQty}" onchange="updateCart(${i}, this.value)" class="w-16 p-1 border rounded dark:bg-gray-800"></td>
                <td>₹${c.sellPrice}</td>
                <td>₹${c.sellQty * c.sellPrice}</td>
                <td><button onclick="removeFromCart(${i})" class="text-red-500 font-bold">X</button></td>
            </tr>
        `;
    });
    document.getElementById('cart-qty').innerText = qty;
    document.getElementById('cart-total').innerText = total.toFixed(2);
}

window.updateCart = (idx, val) => { cart[idx].sellQty = parseInt(val); renderCart(); }
window.removeFromCart = (idx) => { cart.splice(idx, 1); renderCart(); }

document.getElementById('checkout-btn').addEventListener('click', async () => {
    if(cart.length === 0) return alert("Cart is empty");
    
    let totalRevenue = 0;
    let totalCost = 0;
    
    cart.forEach(c => {
        totalRevenue += c.sellQty * c.sellPrice;
        totalCost += c.sellQty * c.avgCost;
    });

    const isCredit = saleType.value === 'credit';
    const customer = customerInput.value;
    if(isCredit && !customer) return alert("Need customer name for credit sale");

    const txData = {
        date: new Date().toISOString().split('T')[0],
        year: new Date().getFullYear().toString(), // <-- THIS LINE IS ADDED
        timestamp: new Date().toISOString(),
        items: cart.map(c => ({ id: c.id, name: c.name, qty: c.sellQty, price: c.sellPrice, cost: c.avgCost, isCosmetic: c.isCosmetic })),
        total: totalRevenue,
        profit: totalRevenue - totalCost,
        type: isCredit ? 'Credit' : 'Cash',
        customer: customer || 'Walk-in',
        isReturn: false
    };

    await addDoc(collection(db, "transactions"), txData);

    // Deduct stock
    for(const c of cart) {
        if(!c.isCosmetic) await updateDoc(doc(db, "inventory", c.id), { qty: increment(-c.sellQty) });
    }

    // Add to credit ledger
    if(isCredit) {
        const credRef = doc(db, "credit_ledgers", customer);
        const credSnap = await getDoc(credRef);
        if(credSnap.exists()) await updateDoc(credRef, { amount: increment(totalRevenue) });
        else await setDoc(credRef, { name: customer, amount: totalRevenue });
    }

    alert("Sale Successful!");
    cart =[]; renderCart(); loadInv();
});
