// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } 
from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBtY97ItVEcZ7srTcpIDUsXmqf1ZBlW2ZQ",
  authDomain: "store-manager-87634.firebaseapp.com",
  projectId: "store-manager-87634",
  storageBucket: "store-manager-87634.firebasestorage.app",
  messagingSenderId: "620672866976",
  appId: "1:620672866976:web:1ae1157027a2a0705f47c5"
};

// Initialize Firebase & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ----- TAB NAVIGATION LOGIC -----
const tabs = ['dashboard', 'transactions', 'inventory'];
tabs.forEach(tab => {
    document.getElementById(`btn-${tab}`).addEventListener('click', () => {
        // Hide all tabs & remove active class from buttons
        tabs.forEach(t => {
            document.getElementById(`tab-${t}`).classList.remove('active');
            document.getElementById(`btn-${t}`).classList.remove('active');
        });
        // Show clicked tab
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.getElementById(`btn-${tab}`).classList.add('active');
    });
});

// ----- INVENTORY LOGIC -----
const inventoryForm = document.getElementById('form-inventory');
inventoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value;
    const qty = parseInt(document.getElementById('inv-qty').value);
    const price = parseFloat(document.getElementById('inv-price').value);

    try {
        await addDoc(collection(db, "inventory"), { name, qty, price });
        inventoryForm.reset();
        alert("Item added successfully!");
    } catch (e) {
        console.error("Error adding document: ", e);
    }
});

// Real-time Inventory Updates
onSnapshot(collection(db, "inventory"), (snapshot) => {
    const tbody = document.querySelector('#table-inventory tbody');
    tbody.innerHTML = '';
    let totalItems = 0;

    snapshot.forEach((doc) => {
        const item = doc.data();
        totalItems += item.qty;
        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${item.qty}</td>
                <td>₹${item.price.toFixed(2)}</td>
            </tr>
        `;
    });
    // Update Dashboard
    document.getElementById('dash-inventory').innerText = totalItems;
});


// ----- TRANSACTIONS LOGIC -----
const transactionForm = document.getElementById('form-transaction');
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('trans-type').value;
    const item = document.getElementById('trans-item').value;
    const qty = parseInt(document.getElementById('trans-qty').value);
    const amount = parseFloat(document.getElementById('trans-amount').value);
    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type, item, qty, amount, date });
        transactionForm.reset();
        alert("Transaction recorded!");
        // Note: For a fully complete system, this step should also automatically 
        // query the inventory collection and update the stock levels.
    } catch (e) {
        console.error("Error recording transaction: ", e);
    }
});

// Real-time Transaction Updates & Dashboard Calculation
const q = query(collection(db, "transactions"), orderBy("date", "desc"));
onSnapshot(q, (snapshot) => {
    const tbody = document.querySelector('#table-transactions tbody');
    tbody.innerHTML = '';
    
    let totalSales = 0;
    let totalPurchases = 0;

    snapshot.forEach((doc) => {
        const trans = doc.data();
        const dateStr = new Date(trans.date).toLocaleDateString();
        
        if(trans.type === 'Sale') totalSales += trans.amount;
        if(trans.type === 'Purchase') totalPurchases += trans.amount;

        tbody.innerHTML += `
            <tr>
                <td>${dateStr}</td>
                <td style="color: ${trans.type === 'Sale' ? 'green' : 'red'}">${trans.type}</td>
                <td>${trans.item}</td>
                <td>${trans.qty}</td>
                <td>₹${trans.amount.toFixed(2)}</td>
            </tr>
        `;
    });

    // Update Dashboard
    document.getElementById('dash-sales').innerText = `₹${totalSales.toFixed(2)}`;
    document.getElementById('dash-purchases').innerText = `₹${totalPurchases.toFixed(2)}`;
});
