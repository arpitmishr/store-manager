// --- ALL IMPORTS STRICTLY AT THE TOP ---
import { setupAuth } from './auth.js';
import { listenToInventory } from './inventory.js';
import { processCartSale, returnTransaction } from './sales.js';
import { processJSONUpload } from './import.js'; 
import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- GLOBAL VARIABLES ---
let globalInventory =[];
let globalTransactions =[];
let selectedYear = "All"; 
let currentCart =[]; 

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

// --- 2. AUTHENTICATION & DATA LOADING ---
setupAuth((user) => {
    console.log("Logged in as:", user.email);
    
    listenToInventory((items) => {
        globalInventory = items;
        updateDashboard();
        updateInventoryTable();
    });

    onSnapshot(collection(db, 'transactions'), (snapshot) => {
        globalTransactions =[];
        const years = new Set();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id; // Store document ID for Return function
            globalTransactions.push(data);
            if(data.year) years.add(data.year.toString());
        });
        
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
        updateTransactionsTable();
    });

}, () => {
    globalInventory = []; 
    globalTransactions =[];
});

// --- 3. PURCHASE & INVENTORY LOGIC ---
const purchaseNameInput = document.getElementById('purchase-item-name');
const purchaseSuggestions = document.getElementById('purchase-item-suggestions');

if (purchaseNameInput) {
    purchaseNameInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        purchaseSuggestions.innerHTML = '';
        if(!query) {
            purchaseSuggestions.classList.add('hidden');
            return;
        }

        const matches = globalInventory.filter(item => item.name.toLowerCase().includes(query));
        const uniqueMatches =[];
        const seen = new Set();
        
        matches.forEach(m => {
            const key = m.name + m.price; 
            if(!seen.has(key)) {
                seen.add(key);
                uniqueMatches.push(m);
            }
        });

        if(uniqueMatches.length > 0) {
            purchaseSuggestions.classList.remove('hidden');
            uniqueMatches.forEach(item => {
                const li = document.createElement('li');
                li.className = "p-3 hover:bg-yellow-100 cursor-pointer border-b text-sm font-medium text-gray-800";
                li.innerHTML = `${item.name} <span class="float-right text-gray-500">Last Rate: ₹${item.price}</span>`;
                
                li.addEventListener('click', () => {
                    purchaseNameInput.value = item.name;
                    document.getElementById('purchase-rate').value = item.price;
                    purchaseSuggestions.classList.add('hidden');
                });
                purchaseSuggestions.appendChild(li);
            });
        } else {
            purchaseSuggestions.classList.remove('hidden');
            purchaseSuggestions.innerHTML = '<li class="p-3 text-gray-500 text-sm italic">New item will be created</li>';
        }
    });

    document.addEventListener('click', (e) => {
        if (!purchaseNameInput.contains(e.target) && !purchaseSuggestions.contains(e.target)) {
            purchaseSuggestions.classList.add('hidden');
        }
    });
}

const purchaseForm = document.getElementById('purchase-form');
if (purchaseForm) {
    purchaseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('record-purchase-btn');
        const msgEl = document.getElementById('purchase-msg');
        btn.disabled = true;
        btn.textContent = "Processing...";

        const name = purchaseNameInput.value.trim();
        const rate = parseFloat(document.getElementById('purchase-rate').value);
        const qty = parseInt(document.getElementById('purchase-qty').value);

        try {
            const batch = writeBatch(db);
            const existingItem = globalInventory.find(i => i.name.toLowerCase() === name.toLowerCase() && i.price === rate);
            
            if(existingItem) {
                const itemRef = doc(db, 'inventory', existingItem.id);
                batch.update(itemRef, { quantity: existingItem.quantity + qty });
            } else {
                const newInvRef = doc(collection(db, 'inventory'));
                batch.set(newInvRef, {
                    name: name,
                    price: rate,
                    quantity: qty,
                    createdAt: new Date().toISOString()
                });
            }

            const total = rate * qty;
            const newTransRef = doc(collection(db, 'transactions'));
            batch.set(newTransRef, {
                type: "Purchase",
                date: new Date().toISOString(),
                year: new Date().getFullYear(),
                total: total,
                paidAmount: total,
                status: "Completed",
                items:[{ particulars: name, quantity: qty, rate: rate }]
            });

            await batch.commit();

            msgEl.textContent = "Purchase Recorded Successfully!";
            msgEl.className = "mt-3 font-bold text-green-600 text-center";
            e.target.reset();
        } catch(err) {
            msgEl.textContent = "Error: " + err.message;
            msgEl.className = "mt-3 font-bold text-red-600 text-center";
        }

        btn.disabled = false;
        btn.textContent = "Record Purchase";
        setTimeout(() => msgEl.textContent = '', 3000);
    });
}

function updateInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    if(!tbody) return;
    tbody.innerHTML = ''; 
    
    const sortedInventory =[...globalInventory].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    sortedInventory.forEach(item => {
        const tr = document.createElement('tr');
        const stockColor = item.quantity <= 0 ? 'text-red-600' : 'text-gray-800';
        tr.innerHTML = `
            <td class="p-3">${item.name}</td>
            <td class="p-3 text-right font-bold ${stockColor}">${item.quantity}</td>
            <td class="p-3 text-right">₹${item.price}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- 4. SALES CART LOGIC (WITH LIFO SORTING) ---
const radioInventory = document.querySelector('input[value="inventory"]');
const radioCosmetic = document.querySelector('input[value="cosmetic"]');
const divInventory = document.getElementById('inventory-selection');
const divCosmetic = document.getElementById('cosmetic-name-div');
const searchItemInput = document.getElementById('sale-item-search');
const hiddenItemId = document.getElementById('sale-item-id');
const suggestionsBox = document.getElementById('sale-item-suggestions');
const inputCosmetic = document.getElementById('cosmetic-name');

function toggleSaleType() {
    if (!radioInventory || !radioCosmetic) return;
    if(radioInventory.checked) {
        divInventory.classList.remove('hidden');
        divCosmetic.classList.add('hidden');
        searchItemInput.required = true;
        inputCosmetic.required = false;
        inputCosmetic.value = '';
    } else {
        divInventory.classList.add('hidden');
        divCosmetic.classList.remove('hidden');
        searchItemInput.required = false;
        searchItemInput.value = '';
        hiddenItemId.value = '';
        suggestionsBox.classList.add('hidden');
        document.getElementById('sale-cost-rate').value = '';
        document.getElementById('sale-sales-rate').value = '';
    }
}

if (radioInventory) radioInventory.addEventListener('change', toggleSaleType);
if (radioCosmetic) radioCosmetic.addEventListener('change', toggleSaleType);

if (searchItemInput) {
    searchItemInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        suggestionsBox.innerHTML = ''; 
        hiddenItemId.value = ''; 
        
        if (!query) {
            suggestionsBox.classList.add('hidden');
            return;
        }

        const matches = globalInventory
            .filter(item => item.name.toLowerCase().includes(query) && item.quantity > 0)
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); 

        if (matches.length > 0) {
            suggestionsBox.classList.remove('hidden');
            matches.forEach(item => {
                const li = document.createElement('li');
                li.className = "p-3 hover:bg-blue-100 cursor-pointer border-b text-sm font-medium text-gray-800";
                li.innerHTML = `${item.name} <span class="float-right text-gray-500 font-normal">Rate: ₹${item.price} | Stock: ${item.quantity}</span>`;
                
                li.addEventListener('click', () => {
                    searchItemInput.value = item.name;
                    hiddenItemId.value = item.id;
                    document.getElementById('sale-cost-rate').value = item.price; 
                    document.getElementById('sale-sales-rate').value = item.price;
                    suggestionsBox.classList.add('hidden'); 
                });
                suggestionsBox.appendChild(li);
            });
        } else {
            suggestionsBox.classList.remove('hidden');
            suggestionsBox.innerHTML = '<li class="p-3 text-red-500 text-sm font-bold">No items found / Out of Stock</li>';
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchItemInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.classList.add('hidden');
        }
    });
}

const addToSaleForm = document.getElementById('add-to-sale-form');
if (addToSaleForm) {
    addToSaleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const type = document.querySelector('input[name="item-type"]:checked').value;
        let id = null; let name = "";
        
        if(type === 'inventory') {
            id = hiddenItemId.value;
            name = searchItemInput.value;
            if (!id) { alert("Please select a valid item from the search."); return; }
        } else {
            name = "(Cosmetic) " + inputCosmetic.value;
        }

        const costRate = parseFloat(document.getElementById('sale-cost-rate').value);
        const salesRate = parseFloat(document.getElementById('sale-sales-rate').value);
        const qty = parseInt(document.getElementById('sale-qty').value);

        currentCart.push({ id, name, type, costRate, salesRate, qty });
        renderCart();
        e.target.reset();
        searchItemInput.value = ''; hiddenItemId.value = ''; 
        if(radioInventory) radioInventory.checked = true; toggleSaleType();
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
        const textStyle = item.type === 'cosmetic' ? 'text-purple-600 font-medium' : 'text-gray-800 font-medium';
        const tr = document.createElement('tr');
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

window.removeFromCart = (index) => { currentCart.splice(index, 1); renderCart(); };

const recordSaleBtn = document.getElementById('record-sale-btn');
if (recordSaleBtn) {
    recordSaleBtn.addEventListener('click', async () => {
        if(currentCart.length === 0) return;
        const msgEl = document.getElementById('sale-msg');
        recordSaleBtn.disabled = true;
        recordSaleBtn.textContent = "Processing...";
        msgEl.textContent = "";
        
        const result = await processCartSale(currentCart);
        
        msgEl.textContent = result.message;
        msgEl.className = result.success ? "mt-3 font-bold text-green-600 text-center" : "mt-3 font-bold text-red-600 text-center";
        
        if(result.success) {
            currentCart =[]; 
            renderCart();
            setTimeout(() => { msgEl.textContent = ''; }, 4000);
        }
        recordSaleBtn.textContent = "Complete Sale";
        recordSaleBtn.disabled = false;
    });
}

// --- 5. DASHBOARD ---
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
        // Only count valid Sales (not returned, not purchases)
        if(transaction.type === "Sale" && transaction.status !== "Returned") {
            if (selectedYear === "All" || transaction.year.toString() === selectedYear) {
                totalSales += transaction.total;
            }
        }
    });
    if (statSales) statSales.textContent = `₹${totalSales.toLocaleString('en-IN')}`;
}

// --- 6. TRANSACTION HISTORY & RETURNS LOGIC ---
function updateTransactionsTable() {
    const tbody = document.getElementById('transactions-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';

    const sorted = [...globalTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        const tr = document.createElement('tr');
        
        // Format Date nicely
        const dateObj = new Date(t.date);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Format Items list (e.g., FROCK(x2), KURTI(x1))
        const itemsStr = t.items ? t.items.map(i => `${i.particulars} (x${i.quantity})`).join(', ') : 'N/A';
        
        // Color coding
        const typeColor = t.type === 'Sale' ? 'text-green-600' : 'text-yellow-600';
        const rowOpacity = t.status === 'Returned' ? 'opacity-50 bg-gray-50' : '';

        // Generate Action Button
        let actionHtml = '';
        if(t.type === 'Sale' && t.status !== 'Returned') {
            actionHtml = `<button type="button" onclick="window.handleReturn('${t.id}')" class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 font-bold text-xs shadow-sm">Return Items</button>`;
        } else if (t.status === 'Returned') {
            actionHtml = `<span class="text-red-500 font-bold text-xs border border-red-500 px-2 py-1 rounded">Refunded</span>`;
        } else {
            actionHtml = `<span class="text-gray-400 text-xs">Stock Added</span>`; // Purchases
        }

        tr.className = rowOpacity;
        tr.innerHTML = `
            <td class="p-4 text-xs font-medium text-gray-500">${dateStr}</td>
            <td class="p-4 font-bold ${typeColor}">${t.type}</td>
            <td class="p-4 text-xs text-gray-700 max-w-[250px] truncate" title="${itemsStr}">${itemsStr}</td>
            <td class="p-4 font-bold text-gray-800">₹${t.total}</td>
            <td class="p-4">${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.handleReturn = async (transactionId) => {
    if(!confirm("Are you sure you want to return this sale? All inventory items from this receipt will be restocked.")) return;
    
    const result = await returnTransaction(transactionId);
    if(result.success) {
        alert("Success: " + result.message);
    } else {
        alert("Error: " + result.message);
    }
};

// --- 7. JSON IMPORT LOGIC ---
const uploadInput = document.getElementById('json-upload');
const importBtn = document.getElementById('import-btn');
let selectedFile = null;

if(uploadInput && importBtn) {
    uploadInput.addEventListener('change', (e) => {
        selectedFile = e.target.files[0];
        if(selectedFile) importBtn.classList.remove('hidden');
    });

    importBtn.addEventListener('click', () => {
        if(selectedFile) {
            const statusEl = document.getElementById('import-status');
            importBtn.classList.add('hidden'); 
            processJSONUpload(selectedFile, statusEl);
        }
    });
}
