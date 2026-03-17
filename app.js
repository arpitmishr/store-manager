// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
    doc, deleteDoc, updateDoc, getDocs, where 
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

inventoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value.trim();
    const qty = parseInt(document.getElementById('inv-qty').value);
    const price = parseFloat(document.getElementById('inv-price').value);
    const editId = inventoryForm.getAttribute('data-edit-id'); 

    try {
        if (editId) {
            await updateDoc(doc(db, "inventory", editId), { name, qty, price });
            alert("Item updated successfully!");
            resetInventoryForm();
        } else {
            await addDoc(collection(db, "inventory"), { name, qty, price });
            alert("Item added to stock!");
            inventoryForm.reset();
        }
    } catch (error) {
        console.error("Error saving item: ", error);
        alert("Error saving item. Check your database permissions.");
    }
});

btnInvCancel.addEventListener('click', resetInventoryForm);

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
    const datalist = document.getElementById('inventory-items-list'); // Dropdown suggestions
    
    tbody.innerHTML = '';
    datalist.innerHTML = ''; 
    let totalItems = 0;

    snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        const id = docSnap.id;
        totalItems += item.qty;
        
        // Add to Table
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

        // Add to Search Suggestions
        datalist.innerHTML += `<option value="${item.name}">`;
    });
    
    document.getElementById('dash-inventory').innerText = totalItems;
});

// Edit & Delete Clicks
document.querySelector('#table-inventory tbody').addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-delete')) {
        const id = e.target.getAttribute('data-id');
        if (confirm("Are you sure you want to delete this item?")) {
            await deleteDoc(doc(db, "inventory", id));
        }
    }
    
    if (e.target.classList.contains('btn-edit')) {
        const id = e.target.getAttribute('data-id');
        document.getElementById('inv-name').value = e.target.getAttribute('data-name');
        document.getElementById('inv-qty').value = e.target.getAttribute('data-qty');
        document.getElementById('inv-price').value = e.target.getAttribute('data-price');

        inventoryForm.setAttribute('data-edit-id', id);
        btnInvSubmit.innerText = "Update Item";
        invFormTitle.innerText = `Editing: ${e.target.getAttribute('data-name')}`;
        btnInvCancel.style.display = "inline-block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});


// ----- SALES LOGIC (Decreases Inventory) -----
const saleForm = document.getElementById('form-sale');
saleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('sale-item').value.trim();
    const qty = parseInt(document.getElementById('sale-qty').value);
    const amount = parseFloat(document.getElementById('sale-amount').value);
    const date = new Date().toISOString();

    try {
        // 1. Record the Sale Transaction
        await addDoc(collection(db, "transactions"), { type: "Sale", item, qty, amount, date });
        
        // 2. Decrease Stock in Inventory
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const invDoc = querySnapshot.docs[0];
            let newQty = invDoc.data().qty - qty;
            if(newQty < 0) newQty = 0; // Prevent negative stock numbers
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: newQty });
            alert("Sale recorded and Stock Decreased!");
        } else {
            alert("Sale recorded! (Note: Item wasn't found in Inventory, so stock wasn't updated).");
        }

        saleForm.reset();
    } catch (e) {
        console.error("Error recording sale: ", e);
    }
});

// ----- PURCHASES LOGIC (Increases Inventory) -----
const purchaseForm = document.getElementById('form-purchase');
purchaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('purchase-item').value.trim();
    const qty = parseInt(document.getElementById('purchase-qty').value);
    const amount = parseFloat(document.getElementById('purchase-amount').value);
    const date = new Date().toISOString();

    try {
        // 1. Record the Purchase Transaction
        await addDoc(collection(db, "transactions"), { type: "Purchase", item, qty, amount, date });
        
        // 2. Increase Stock in Inventory
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            // Item exists, add to quantity
            const invDoc = querySnapshot.docs[0];
            const newQty = invDoc.data().qty + qty;
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: newQty });
            alert("Purchase recorded and Stock Increased!");
        } else {
            // Item is completely new, create it in inventory automatically
            const price = amount / qty; // Guessing the unit price based on amount paid
            await addDoc(collection(db, "inventory"), { name: item, qty: qty, price: price });
            alert("Purchase recorded and New Item added to Inventory!");
        }

        purchaseForm.reset();
    } catch (e) {
        console.error("Error recording purchase: ", e);
    }
});

// ----- REAL-TIME TRANSACTIONS HISTORY & DASHBOARD -----
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

    // Update Dashboard Money values
    document.getElementById('dash-sales').innerText = `₹${totalSales.toFixed(2)}`;
    document.getElementById('dash-purchases').innerText = `₹${totalPurchases.toFixed(2)}`;
});
