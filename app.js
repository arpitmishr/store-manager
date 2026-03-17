// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
    doc, deleteDoc, updateDoc, getDocs, where 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBtY97ItVEcZ7srTcpIDUsXmqf1ZBlW2ZQ",
  authDomain: "store-manager-87634.firebaseapp.com",
  projectId: "store-manager-87634",
  storageBucket: "store-manager-87634.firebasestorage.app",
  messagingSenderId: "620672866976",
  appId: "1:620672866976:web:1ae1157027a2a0705f47c5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Variables to hold Database Listeners (so we can turn them off when logged out)
let unsubInventory = null;
let unsubTransactions = null;

// ----- AUTHENTICATION LOGIC -----
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('form-login');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');

// Watch user state (Logged In vs Logged Out)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is logged in -> Show App, Start Database
        loginContainer.style.display = 'none';
        appContainer.style.display = 'flex';
        startDatabaseListeners();
    } else {
        // User is logged out -> Show Login Screen, Stop Database
        loginContainer.style.display = 'flex';
        appContainer.style.display = 'none';
        stopDatabaseListeners();
    }
});

// Handle Login Button Click
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginError.style.display = 'none';
        loginForm.reset();
    } catch (error) {
        loginError.style.display = 'block';
        loginError.innerText = "Error: Invalid Email or Password.";
        console.error("Login Failed:", error.message);
    }
});

// Handle Logout Button Click
btnLogout.addEventListener('click', () => {
    signOut(auth);
});

// ----- TAB NAVIGATION LOGIC -----
const tabs =['dashboard', 'sales', 'purchases', 'inventory'];
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

// ----- DATABASE LISTENERS (ONLY RUN WHEN LOGGED IN) -----
function startDatabaseListeners() {
    // 1. Listen to Inventory
    unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => {
        try {
            const tbody = document.querySelector('#table-inventory tbody');
            const datalist = document.getElementById('inventory-items-list'); 
            
            tbody.innerHTML = '';
            datalist.innerHTML = ''; 
            let totalItems = 0;

            snapshot.forEach((docSnap) => {
                const item = docSnap.data();
                const id = docSnap.id;
                
                const itemName = item.name || "Unknown Item";
                const itemQty = Number(item.qty) || 0;
                const itemPrice = Number(item.price) || 0;

                totalItems += itemQty;
                
                tbody.innerHTML += `
                    <tr>
                        <td>${itemName}</td>
                        <td>${itemQty}</td>
                        <td>₹${itemPrice.toFixed(2)}</td>
                        <td>
                            <button class="btn-edit" style="background:#f39c12; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer;" 
                                data-id="${id}" data-name="${itemName}" data-qty="${itemQty}" data-price="${itemPrice}">Edit</button>
                            <button class="btn-delete" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; margin-left:5px;" 
                                data-id="${id}">Delete</button>
                        </td>
                    </tr>
                `;
                datalist.innerHTML += `<option value="${itemName}"></option>`;
            });
            
            document.getElementById('dash-inventory').innerText = totalItems;
        } catch (error) {
            console.error(error);
        }
    });

    // 2. Listen to Transactions
    const qTrans = query(collection(db, "transactions"), orderBy("date", "desc"));
    unsubTransactions = onSnapshot(qTrans, (snapshot) => {
        try {
            const salesTbody = document.querySelector('#table-sales tbody');
            const purchasesTbody = document.querySelector('#table-purchases tbody');
            
            salesTbody.innerHTML = '';
            purchasesTbody.innerHTML = '';
            
            let totalSales = 0;
            let totalPurchases = 0;

            snapshot.forEach((docSnap) => {
                const trans = docSnap.data();
                const dateStr = new Date(trans.date).toLocaleDateString();
                const tItem = trans.item || "Unknown";
                const tQty = Number(trans.qty) || 0;
                const tAmount = Number(trans.amount) || 0;

                const rowHtml = `<tr><td>${dateStr}</td><td>${tItem}</td><td>${tQty}</td><td>₹${tAmount.toFixed(2)}</td></tr>`;
                
                if(trans.type === 'Sale') {
                    totalSales += tAmount;
                    salesTbody.innerHTML += rowHtml;
                } else if (trans.type === 'Purchase') {
                    totalPurchases += tAmount;
                    purchasesTbody.innerHTML += rowHtml;
                }
            });

            document.getElementById('dash-sales').innerText = `₹${totalSales.toFixed(2)}`;
            document.getElementById('dash-purchases').innerText = `₹${totalPurchases.toFixed(2)}`;
        } catch (error) {
            console.error(error);
        }
    });
}

function stopDatabaseListeners() {
    // Detach listeners so they don't crash when user logs out
    if (unsubInventory) { unsubInventory(); unsubInventory = null; }
    if (unsubTransactions) { unsubTransactions(); unsubTransactions = null; }
}

// ----- INVENTORY ADD/EDIT/DELETE -----
const inventoryForm = document.getElementById('form-inventory');
const btnInvSubmit = document.getElementById('btn-inv-submit');
const btnInvCancel = document.getElementById('btn-inv-cancel');
const invFormTitle = document.getElementById('inv-form-title');

inventoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value.trim();
    let qty = parseInt(document.getElementById('inv-qty').value);
    let price = parseFloat(document.getElementById('inv-price').value);
    
    if (isNaN(qty)) qty = 0;
    if (isNaN(price)) price = 0;

    const editId = inventoryForm.getAttribute('data-edit-id'); 

    try {
        if (editId) {
            await updateDoc(doc(db, "inventory", editId), { name, qty, price });
            resetInventoryForm();
        } else {
            await addDoc(collection(db, "inventory"), { name, qty, price });
            inventoryForm.reset();
        }
    } catch (error) {
        console.error("Error saving item: ", error);
        alert("Action Denied! Make sure you are logged in.");
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

document.querySelector('#table-inventory tbody').addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-delete')) {
        const id = e.target.getAttribute('data-id');
        if (confirm("Delete this item?")) {
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

// ----- TRANSACTIONS LOGIC -----
const saleForm = document.getElementById('form-sale');
saleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('sale-item').value.trim();
    let qty = parseInt(document.getElementById('sale-qty').value);
    let amount = parseFloat(document.getElementById('sale-amount').value);
    if (isNaN(qty)) qty = 0; if (isNaN(amount)) amount = 0;
    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type: "Sale", item, qty, amount, date });
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const invDoc = querySnapshot.docs[0];
            let newQty = Number(invDoc.data().qty) - qty;
            if(newQty < 0) newQty = 0; 
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: newQty });
        }
        saleForm.reset();
    } catch (e) {
        console.error("Error recording sale: ", e);
    }
});

const purchaseForm = document.getElementById('form-purchase');
purchaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('purchase-item').value.trim();
    let qty = parseInt(document.getElementById('purchase-qty').value);
    let amount = parseFloat(document.getElementById('purchase-amount').value);
    if (isNaN(qty)) qty = 0; if (isNaN(amount)) amount = 0;
    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type: "Purchase", item, qty, amount, date });
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const invDoc = querySnapshot.docs[0];
            const newQty = Number(invDoc.data().qty) + qty;
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: newQty });
        } else {
            let price = (qty > 0) ? (amount / qty) : 0; 
            await addDoc(collection(db, "inventory"), { name: item, qty: qty, price: price });
        }
        purchaseForm.reset();
    } catch (e) {
        console.error("Error recording purchase: ", e);
    }
});
