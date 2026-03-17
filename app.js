// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
    doc, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
const tabs = ['dashboard', 'sales', 'purchases', 'inventory'];
tabs.forEach(tab => {
    document.getElementById(`btn-${tab}`).addEventListener('click', () => {
        tabs.forEach(t => {
            document.getElementById(`tab-${t}`).classList.remove('active');
            document.getElementById(`btn-${t}`).classList.remove('active');
        });
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.getElementById(`btn-${tab}`).classList.add('active');
    });
});

// ----- INVENTORY LOGIC (ADD, EDIT, DELETE) -----
const inventoryForm = document.getElementById('form-inventory');
const btnInvSubmit = document.getElementById('btn-inv-submit');
const btnInvCancel = document.getElementById('btn-inv-cancel');
const invFormTitle = document.getElementById('inv-form-title');

// Handle Add / Update Submit
inventoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value;
    const qty = parseInt(document.getElementById('inv-qty').value);
    const price = parseFloat(document.getElementById('inv-price').value);
    const editId = inventoryForm.getAttribute('data-edit-id'); // Check if we are editing

    try {
        if (editId) {
            // Update existing item
            await updateDoc(doc(db, "inventory", editId), { name, qty, price });
            alert("Item updated successfully!");
            resetInventoryForm();
        } else {
            // Add new item
            await addDoc(collection(db, "inventory"), { name, qty, price });
            alert("Item added to inventory!");
            inventoryForm.reset();
        }
    } catch (error) {
        console.error("Error saving item: ", error);
    }
});

// Cancel Edit Button
btnInvCancel.addEventListener('click', () => {
    resetInventoryForm();
});

function resetInventoryForm() {
    inventoryForm.reset();
    inventoryForm.removeAttribute('data-edit-id');
    btnInvSubmit.innerText = "Add Item";
    invFormTitle.innerText = "Add New Item";
    btnInvCancel.style.display = "none";
}

// Real-time Inventory Updates & Table Generation
onSnapshot(collection(db, "inventory"), (snapshot) => {
    const tbody = document.querySelector('#table-inventory tbody');
    tbody.innerHTML = '';
    let totalItems = 0;

    snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        const id = docSnap.id; // Firebase Document ID
        totalItems += item.qty;
        
        // Build the table row with Edit and Delete buttons
        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${item.qty}</td>
                <td>₹${item.price.toFixed(2)}</td>
                <td>
                    <button class="btn-edit" style="background:#f39c12; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer;" 
                        data-id="${id}" data-name="${item.name}" data-qty="${item.qty}" data-price="${item.price}">Edit</button>
                    <button class="btn-delete" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; margin-left:5px;" 
                        data-id="${id}">Delete</button>
                </td>
            </tr>
        `;
    });
    
    // Update Dashboard Inventory Count
    document.getElementById('dash-inventory').innerText = totalItems;
});

// Handle Edit and Delete Button Clicks inside the Table
document.querySelector('#table-inventory tbody').addEventListener('click', async (e) => {
    // DELETE ACTION
    if (e.target.classList.contains('btn-delete')) {
        const id = e.target.getAttribute('data-id');
        if (confirm("Are you sure you want to delete this item?")) {
            try {
                await deleteDoc(doc(db, "inventory", id));
            } catch (error) {
                console.error("Error deleting item: ", error);
            }
        }
    }
    
    // EDIT ACTION
    if (e.target.classList.contains('btn-edit')) {
        const id = e.target.getAttribute('data-id');
        const name = e.target.getAttribute('data-name');
        const qty = e.target.getAttribute('data-qty');
        const price = e.target.getAttribute('data-price');

        // Populate the form with the item's current details
        document.getElementById('inv-name').value = name;
        document.getElementById('inv-qty').value = qty;
        document.getElementById('inv-price').value = price;

        // Change the form into "Edit Mode"
        inventoryForm.setAttribute('data-edit-id', id);
        btnInvSubmit.innerText = "Update Item";
        invFormTitle.innerText = `Editing: ${name}`;
        btnInvCancel.style.display = "inline-block";
        
        // Scroll to top smoothly so the user sees the form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
    const salesTbody = document.querySelector('#table-sales tbody');
    const purchasesTbody = document.querySelector('#table-purchases tbody');
    
    salesTbody.innerHTML = '';
    purchasesTbody.innerHTML = '';
    
    let totalSales = 0;
    let totalPurchases = 0;

    snapshot.forEach((docSnap) => {
        const trans = docSnap.data();
        const dateStr = new Date(trans.date).toLocaleDateString();
        
        const rowHtml = `
            <tr>
                <td>${dateStr}</td>
                <td>${trans.item}</td>
                <td>${trans.qty}</td>
                <td>₹${trans.amount.toFixed(2)}</td>
            </tr>
        `;
        
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
