// --- ALL IMPORTS AT THE TOP ---
import { setupAuth } from './auth.js';
import { addItem, listenToInventory } from './inventory.js';
import { processCartSale } from './sales.js';
import { processJSONUpload } from './import.js';
import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- GLOBAL VARIABLES ---
let globalInventory = [];
let globalTransactions =[];
let selectedYear = "All"; 
let currentCart =[]; // Holds items currently in the POS Cart

// --- 1. NAVIGATION LOGIC ---
const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.page-section');

navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        navButtons.forEach(b => {
            b.classList.remove('bg-gray-800');
            b.classList.add('hover:bg-gray-800');
        });
        e.target.classList.add('bg-gray-800');
        e.target.classList.remove('hover:bg-gray-800');

        sections.forEach(sec => sec.classList.add('hidden'));
        const targetId = e.target.getAttribute('data-target');
        document.getElementById(targetId).classList.remove('hidden');
    });
});

// --- 2. INITIALIZE AUTHENTICATION & LOAD DATA ---
setupAuth((user) => {
    console.log("Logged in as:", user.email);
    
    // Load Inventory
    listenToInventory((items) => {
        globalInventory = items;
        updateDashboard();
        updateInventoryTable();
        updateSalesDropdown();
    });

    // Load Transactions (For Dashboard Year Filter)
    onSnapshot(collection(db, 'transactions'), (snapshot) => {
        globalTransactions =[];
        const years = new Set();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            globalTransactions.push(data);
            if(data.year) years.add(data.year.toString());
        });
        
        // Update Year Dropdown dynamically
        const select = document.getElementById('year-filter');
        if(select) {
            select.innerHTML = '<option value="All">All Time</option>';
            Array.from(years).sort().reverse().forEach(year => {
                const opt = document.createElement('option');
                opt.value = year;
                opt.textContent = year;
                select.appendChild(opt);
            });
        }
        
        updateDashboard();
    });

}, () => {
    console.log("Logged out");
    globalInventory = []; 
    globalTransactions =[];
});

// --- 3. INVENTORY LOGIC ---
const addItemForm = document.getElementById('add-item-form');
if (addItemForm) {
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('item-name').value;
        const qty = document.getElementById('item-qty').value;
        const price = document.getElementById('item-price').value;

        const success = await addItem(name, qty, price);
        if(success) e.target.reset();
    });
}

function updateInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    if(!tbody) return;
    tbody.innerHTML = ''; 
    
    globalInventory.forEach(item => {
        const tr = document.createElement('tr');
        const stockColor = item.quantity < 5 ? 'text-red-600' : 'text-green-600';
        tr.innerHTML = `
            <td class="p-4">${item.name}</td>
            <td class="p-4 font-bold ${stockColor}">${item.quantity}</td>
            <td class="p-4">₹${item.price}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- 4. SALES CART LOGIC ---
const radioInventory = document.querySelector('input[value="inventory"]');
const radioCosmetic = document.querySelector('input[value="cosmetic"]');
const divInventory = document.getElementById('inventory-selection');
const divCosmetic = document.getElementById('cosmetic-name-div');
const selectItem = document.getElementById('sale-item-select');
const inputCosmetic = document.getElementById('cosmetic-name');

function toggleSaleType() {
    if (!radioInventory || !radioCosmetic) return;
    if(radioInventory.checked) {
        divInventory.classList.remove('hidden');
        divCosmetic.classList.add('hidden');
        selectItem.required = true;
        inputCosmetic.required = false;
        inputCosmetic.value = '';
    } else {
        divInventory.classList.add('hidden');
        divCosmetic.classList.remove('hidden');
        selectItem.required = false;
        selectItem.value = '';
        document.getElementById('sale-cost-rate').value = '';
        document.getElementById('sale-sales-rate').value = '';
    }
}

if (radioInventory) radioInventory.addEventListener('change', toggleSaleType);
if (radioCosmetic) radioCosmetic.addEventListener('change', toggleSaleType);

function updateSalesDropdown() {
    if(!selectItem) return;
    selectItem.innerHTML = '<option value="">-- Choose Item --</option>';
    
    globalInventory.forEach(item => {
        if(item.quantity > 0) {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.name} (Stock: ${item.quantity})`;
            selectItem.appendChild(opt);
        }
    });
}

if (selectItem) {
    selectItem.addEventListener('change', (e) => {
        const itemId = e.target.value;
        const item = globalInventory.find(i => i.id === itemId);
        if(item) {
            document.getElementById('sale-cost-rate').value = item.price; 
            document.getElementById('sale-sales-rate').value = item.price; 
        }
    });
}

const addToSaleForm = document.getElementById('add-to-sale-form');
if (addToSaleForm) {
    addToSaleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const type = document.querySelector('input[name="item-type"]:checked').value;
        let id = null;
        let name = "";
        
        if(type === 'inventory') {
            id = selectItem.value;
            name = selectItem.options[selectItem.selectedIndex].text.split(' (Stock')[0];
        } else {
            name = "(Cosmetic) " + inputCosmetic.value;
        }

        const costRate = parseFloat(document.getElementById('sale-cost-rate').value);
        const salesRate = parseFloat(document.getElementById('sale-sales-rate').value);
        const qty = parseInt(document.getElementById('sale-qty').value);

        currentCart.push({ id, name, type, costRate, salesRate, qty });
        
        renderCart();
        e.target.reset();
        if(radioInventory) radioInventory.checked = true; 
        toggleSaleType();
    });
}

function renderCart() {
    const tbody = document.getElementById('sale-cart-body');
    const grandTotalEl = document.getElementById('sale-grand-total');
    if(!tbody || !grandTotalEl) return;

    let grandTotal = 0;
    
    if(currentCart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-400">Cart is empty</td></tr>';
        grandTotalEl.textContent = '₹0';
        document.getElementById('record-sale-btn').disabled = true;
        return;
    }

    document.getElementById('record-sale-btn').disabled = false;
    tbody.innerHTML = '';
    
    currentCart.forEach((item, index) => {
        const itemTotal = item.qty * item.salesRate;
        grandTotal += itemTotal;
        
        const tr = document.createElement('tr');
        const textStyle = item.type === 'cosmetic' ? 'text-purple-600 font-medium' : 'text-gray-800 font-medium';
        
        tr.innerHTML = `
            <td class="py-2 ${textStyle}">${item.name}</td>
            <td class="py-2">${item.qty}</td>
            <td class="py-2">₹${item.salesRate}</td>
            <td class="py-2 text-right font-bold text-green-600">₹${itemTotal}</td>
            <td class="py-2 text-center">
                <button type="button" onclick="window.removeFromCart(${index})" class="text-red-500 hover:text-red-700 font-bold">X</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    grandTotalEl.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
}

// Function to remove an item from cart
window.removeFromCart = (index) => {
    currentCart.splice(index, 1);
    renderCart();
};

// Handle Complete Sale Button
const recordSaleBtn = document.getElementById('record-sale-btn');
if (recordSaleBtn) {
    recordSaleBtn.addEventListener('click', async () => {
        if(currentCart.length === 0) return;
        
        const msgEl = document.getElementById('sale-msg');
        
        recordSaleBtn.disabled = true;
        recordSaleBtn.textContent = "Processing...";
        msgEl.textContent = "";
        
        // Ensure processCartSale is imported from sales.js at the top!
        const result = await processCartSale(currentCart);
        
        msgEl.textContent = result.message;
        msgEl.className = result.success ? "mt-3 font-bold text-green-600 text-center" : "mt-3 font-bold text-red-600 text-center";
        
        if(result.success) {
            currentCart =[]; // Empty the cart
            renderCart();
            setTimeout(() => { msgEl.textContent = ''; }, 4000);
        }
        
        recordSaleBtn.textContent = "Complete Sale";
        recordSaleBtn.disabled = false;
    });
}

// --- 5. DASHBOARD & YEAR FILTER LOGIC ---
const yearFilter = document.getElementById('year-filter');
if (yearFilter) {
    yearFilter.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        const displayYear = document.getElementById('display-year');
        if (displayYear) displayYear.textContent = selectedYear === "All" ? "All Time" : selectedYear;
        updateDashboard();
    });
}

function updateDashboard() {
    const statProducts = document.getElementById('stat-products');
    const statSales = document.getElementById('stat-sales');
    
    if (statProducts) statProducts.textContent = globalInventory.length;
    
    let totalSales = 0;
    globalTransactions.forEach(transaction => {
        if(transaction.type === "Sale") {
            if (selectedYear === "All" || transaction.year.toString() === selectedYear) {
                totalSales += transaction.total;
            }
        }
    });
    
    if (statSales) statSales.textContent = `₹${totalSales.toLocaleString('en-IN')}`;
}

// --- 6. JSON IMPORT LOGIC ---
let selectedFile = null;
const uploadInput = document.getElementById('json-upload');
const importBtn = document.getElementById('import-btn');

if(uploadInput && importBtn) {
    uploadInput.addEventListener('change', (e) => {
        selectedFile = e.target.files[0];
        if(selectedFile) importBtn.classList.remove('hidden');
    });

    importBtn.addEventListener('click', () => {
        if(selectedFile) {
            const statusEl = document.getElementById('import-status');
            importBtn.classList.add('hidden'); // Prevent double clicking
            processJSONUpload(selectedFile, statusEl);
        }
    });
}
