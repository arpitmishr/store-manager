import { setupAuth } from './auth.js';
import { listenToInventory } from './inventory.js';
import { processCartSale, returnTransaction } from './sales.js';
import { processJSONUpload } from './import.js'; 
import { db } from './firebase-config.js';
import { collection, doc, writeBatch, query, where, getDocs, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- GLOBAL VARIABLES ---
let selectedYear = "All"; 
let currentCart = []; 
let globalInventory =[]; 

// Pagination States
let invPage = 0;
const pageSize = 15;

let transCursors = [null];
let transPage = 0;

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

function initializeYears() {
    const yearSelect = document.getElementById('year-filter');
    if(yearSelect) {
        yearSelect.innerHTML = '<option value="All">All Time</option>';
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= 2020; y--) {
            yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
        }
    }
}

// --- 2. AUTHENTICATION & DATA FETCHING ---
setupAuth((user) => {
    console.log("Logged in as:", user.email);
    initializeYears();
    
    // Load Inventory entirely for quick search, paginate only the view
    listenToInventory((items) => {
        globalInventory = items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        renderInventoryPage();
        updateDashboardProducts();
    });

    renderTransactionsPage(0);
    updateDashboardSales(); 

}, () => {
    transCursors =[null]; transPage = 0; invPage = 0; globalInventory =[];
});


// --- 3. DASHBOARD LOGIC (FIXED) ---
const yearFilter = document.getElementById('year-filter');
if (yearFilter) {
    yearFilter.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        const displayYear = document.getElementById('display-year');
        if (displayYear) displayYear.textContent = selectedYear === "All" ? "All Time" : selectedYear;
        updateDashboardSales();
    });
}

function updateDashboardProducts() {
    document.getElementById('stat-products').textContent = globalInventory.length;
}

// Single-Index Query bypasses Firebase Composite Index requirement
async function updateDashboardSales() {
    try {
        const transRef = collection(db, 'transactions');
        const q = query(transRef, where('type', '==', 'Sale')); 
        const snap = await getDocs(q); 
        
        let totalAmount = 0;
        snap.forEach(docSnap => {
            const t = docSnap.data();
            if (t.status === 'Completed') {
                if (selectedYear === "All" || String(t.year) === String(selectedYear)) {
                    totalAmount += (t.total || 0);
                }
            }
        });

        document.getElementById('stat-sales').textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
    } catch(err) {
        console.error("Sales Aggregation Error:", err);
        document.getElementById('stat-sales').textContent = "Error";
    }
}


// --- 4. INVENTORY LOGIC (Client-Side Paginated) ---
function renderInventoryPage() {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const start = invPage * pageSize;
    const end = start + pageSize;
    const pageItems = globalInventory.slice(start, end);

    pageItems.forEach(item => {
        const tr = document.createElement('tr');
        const stockColor = item.quantity <= 0 ? 'text-red-600' : 'text-gray-800';
        tr.innerHTML = `
            <td class="p-3">${item.name}</td>
            <td class="p-3 text-right font-bold ${stockColor}">${item.quantity}</td>
            <td class="p-3 text-right">₹${item.price}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('inv-page-indicator').textContent = `Page ${invPage + 1}`;
    document.getElementById('inv-prev-btn').disabled = (invPage === 0);
    document.getElementById('inv-next-btn').disabled = (end >= globalInventory.length);
}

document.getElementById('inv-prev-btn').addEventListener('click', () => { if(invPage > 0) { invPage--; renderInventoryPage(); } });
document.getElementById('inv-next-btn').addEventListener('click', () => { if((invPage + 1) * pageSize < globalInventory.length) { invPage++; renderInventoryPage(); } });

// Search Logic (Restored to `.includes()` for perfect UX)
const purchaseNameInput = document.getElementById('purchase-item-name');
const purchaseSuggestions = document.getElementById('purchase-item-suggestions');

if (purchaseNameInput) {
    purchaseNameInput.addEventListener('input', (e) => {
        const queryText = e.target.value.toLowerCase().trim();
        purchaseSuggestions.innerHTML = '';
        if(!queryText) {
            purchaseSuggestions.classList.add('hidden');
            return;
        }

        const matches = globalInventory.filter(item => item.name && item.name.toLowerCase().includes(queryText));
        const uniqueMatches =[];
        const seen = new Set();
        matches.forEach(m => {
            const key = m.name + m.price; 
            if(!seen.has(key)) { seen.add(key); uniqueMatches.push(m); }
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
            
            renderTransactionsPage(0); // Refresh history
            updateDashboardSales();
        } catch(err) {
            msgEl.textContent = "Error: " + err.message;
            msgEl.className = "mt-3 font-bold text-red-600 text-center";
        }

        btn.disabled = false;
        btn.textContent = "Record Purchase";
        setTimeout(() => msgEl.textContent = '', 3000);
    });
}

// --- 5. SALES LOGIC (Restored `.includes()` UX) ---
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
        const queryText = e.target.value.toLowerCase().trim();
        suggestionsBox.innerHTML = ''; 
        hiddenItemId.value = ''; 
        
        if (!queryText) {
            suggestionsBox.classList.add('hidden');
            return;
        }

        const matches = globalInventory.filter(item => 
            item.name && item.name.toLowerCase().includes(queryText) && item.quantity > 0
        );
        
        if (matches.length > 0) {
            suggestionsBox.classList.remove('hidden');
            matches.slice(0, 15).forEach(item => {
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
            renderTransactionsPage(0);
            updateDashboardSales();
            setTimeout(() => { msgEl.textContent = ''; }, 4000);
        }
        recordSaleBtn.textContent = "Complete Sale";
        recordSaleBtn.disabled = false;
    });
}

// --- 6. TRANSACTIONS HISTORY (Server-Side Paginated) ---
async function renderTransactionsPage(pageIndex) {
    const tbody = document.getElementById('transactions-table-body');
    let q = query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(15));
    if (transCursors[pageIndex]) {
        q = query(collection(db, 'transactions'), orderBy('date', 'desc'), startAfter(transCursors[pageIndex]), limit(15));
    }

    const snap = await getDocs(q);
    if (snap.empty && pageIndex > 0) return;
    
    tbody.innerHTML = '';
    transCursors[pageIndex + 1] = snap.docs.length === 15 ? snap.docs[snap.docs.length - 1] : null;
    transPage = pageIndex;

    snap.forEach(docSnap => {
        const t = docSnap.data();
        t.id = docSnap.id;
        const tr = document.createElement('tr');
        
        const dateObj = new Date(t.date);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const itemsStr = t.items ? t.items.map(i => `${i.particulars || i.name || 'Item'} (x${i.quantity})`).join(', ') : 'N/A';
        
        const typeColor = t.type === 'Sale' ? 'text-green-600' : 'text-yellow-600';
        const rowOpacity = t.status === 'Returned' ? 'opacity-50 bg-gray-50' : '';

        let actionHtml = '';
        if(t.type === 'Sale' && t.status !== 'Returned') {
            actionHtml = `<button type="button" onclick="window.handleReturn('${t.id}')" class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 font-bold text-xs shadow-sm">Return Items</button>`;
        } else if (t.status === 'Returned') {
            actionHtml = `<span class="text-red-500 font-bold text-xs border border-red-500 px-2 py-1 rounded">Refunded</span>`;
        } else {
            actionHtml = `<span class="text-gray-400 text-xs">Stock Added</span>`; 
        }

        tr.className = rowOpacity;
        tr.innerHTML = `
            <td class="p-4 text-xs font-medium text-gray-500 whitespace-nowrap">${dateStr}</td>
            <td class="p-4 font-bold ${typeColor}">${t.type}</td>
            <td class="p-4 text-xs text-gray-700 max-w-xs truncate" title="${itemsStr}">${itemsStr}</td>
            <td class="p-4 font-bold text-gray-800">₹${t.total}</td>
            <td class="p-4">${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('trans-page-indicator').textContent = `Page ${transPage + 1}`;
    document.getElementById('trans-prev-btn').disabled = (transPage === 0);
    document.getElementById('trans-next-btn').disabled = (!transCursors[transPage + 1]);
}

document.getElementById('trans-prev-btn').addEventListener('click', () => { if(transPage > 0) renderTransactionsPage(transPage - 1); });
document.getElementById('trans-next-btn').addEventListener('click', () => { if(transCursors[transPage + 1]) renderTransactionsPage(transPage + 1); });

window.handleReturn = async (transactionId) => {
    if(!confirm("Are you sure you want to return this sale? All inventory items from this receipt will be restocked.")) return;
    
    const result = await returnTransaction(transactionId);
    if(result.success) {
        alert("Success: " + result.message);
        renderTransactionsPage(transPage); 
        updateDashboardSales();
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
