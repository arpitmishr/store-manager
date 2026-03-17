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
const tabs =['dashboard', 'sales', 'purchases', 'inventory']; // Updated tabs
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
        alert("Item added to inventory!");
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


// ----- SALES LOGIC -----
const saleForm = document.getElementById('form-sale');
saleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('sale-item').value;
    const qty = parseInt(document.getElementById('sale-qty').value);
    const amount = parseFloat(document.getElementById('sale-amount').value);
    const date = new Date().toISOString();

    try {
        // Save as type "Sale"
        await addDoc(collection(db, "transactions"), { type: "Sale", item, qty, amount, date });
        saleForm.reset();
        alert("Sale recorded successfully!");
    } catch (e) {
        console.error("Error recording sale: ", e);
    }
});

// ----- PURCHASES LOGIC -----
const purchaseForm = document.getElementById('form-purchase');
purchaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('purchase-item').value;
    const qty = parseInt(document.getElementById('purchase-qty').value);
    const amount = parseFloat(document.getElementById('purchase-amount').value);
    const date = new Date().toISOString();

    try {
        // Save as type "Purchase"
        await addDoc(collection(db, "transactions"), { type: "Purchase", item, qty, amount, date });
        purchaseForm.reset();
        alert("Purchase recorded successfully!");
    } catch (e) {
        console.error("Error recording purchase: ", e);
    }
});

// ----- REAL-TIME TRANSACTIONS (SALES & PURCHASES) & DASHBOARD -----
const q = query(collection(db, "transactions"), orderBy("date", "desc"));
onSnapshot(q, (snapshot) => {
    // Get both tables
    const salesTbody = document.querySelector('#table-sales tbody');
    const purchasesTbody = document.querySelector('#table-purchases tbody');
    
    // Clear both tables
    salesTbody.innerHTML = '';
    purchasesTbody.innerHTML = '';
    
    let totalSales = 0;
    let totalPurchases = 0;

    snapshot.forEach((doc) => {
        const trans = doc.data();
        const dateStr = new Date(trans.date).toLocaleDateString();
        
        // Generate the row HTML
        const rowHtml = `
            <tr>
                <td>${dateStr}</td>
                <td>${trans.item}</td>
                <td>${trans.qty}</td>
                <td>₹${trans.amount.toFixed(2)}</td>
            </tr>
        `;
        
        // Put in correct table and add to dashboard totals
        if(trans.type === 'Sale') {
            totalSales += trans.amount;
            salesTbody.innerHTML += rowHtml;
        } else if (trans.type === 'Purchase') {
            totalPurchases += trans.amount;
            purchasesTbody.innerHTML += rowHtml;
        }
    });

    // Update Dashboard
    document.getElementById('dash-sales').innerText = `₹${totalSales.toFixed(2)}`;
    document.getElementById('dash-purchases').innerText = `₹${totalPurchases.toFixed(2)}`;
});
