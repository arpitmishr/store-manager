import { setupAuth } from './auth.js';
import { processCartSale, returnTransaction } from './sales.js';
import { processJSONUpload } from './import.js'; 
import { db } from './firebase-config.js';
import { collection, doc, writeBatch, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- GLOBAL VARIABLES & STATE ---
let globalInventory =[];
let globalTransactions = [];
let currentCart =[]; 
let salesChartInstance = null;

let transPage = 0;
const pageSize = 15;

let orderSearchQuery = "";
let stockSearchQuery = "";

// --- 1. NAVIGATION LOGIC (BOTTOM NAV) ---
const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.page-section');

navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        const targetId = targetBtn.getAttribute('data-target');
        
        navButtons.forEach(b => {
            if(!b.querySelector('.w-14')) {
                b.classList.remove('text-slate-900');
                b.classList.add('text-slate-400');
            }
        });

        if(!targetBtn.querySelector('.w-14')) {
            targetBtn.classList.add('text-slate-900');
            targetBtn.classList.remove('text-slate-400');
        }

        sections.forEach(sec => sec.classList.add('hidden'));
        document.getElementById(targetId).classList.remove('hidden');

        if(targetId === 'page-analytics') renderAnalytics();
    });
});

// --- 2. AUTHENTICATION & DIRECT DATA FETCHING ---
setupAuth((user) => {
    // 1. Fetch Inventory Directly (Bulletproofs legacy data and missing files)
    onSnapshot(collection(db, 'inventory'), (snapshot) => {
        globalInventory =[];
        snapshot.forEach(doc => {
            globalInventory.push({ id: doc.id, ...doc.data() });
        });
        globalInventory.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        
        updateDashboard();
        renderInventoryList();
    });

    // 2. Fetch Transactions Directly
    onSnapshot(collection(db, 'transactions'), (snapshot) => {
        globalTransactions =[];
        snapshot.forEach(doc => {
            globalTransactions.push({ id: doc.id, ...doc.data() });
        });
        globalTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        updateDashboard();
        renderTransactionsPage();
        if(salesChartInstance) renderAnalytics();
    });

}, () => {
    globalInventory = []; globalTransactions =[]; transPage = 0;
});


// --- 3. DASHBOARD LOGIC ---
function updateDashboard() {
    let totalRevenue = 0;
    let todaySales = 0;
    let returnCount = 0;
    let orderCount = 0;
    
    const todayStr = new Date().toDateString();

    globalTransactions.forEach(t => {
        const type = String(t.type || '').toLowerCase();
        
        if (type.includes('sale') && t.status !== 'Returned') {
            totalRevenue += (Number(t.total) || 0);
            orderCount++;
            
            const transDate = new Date(t.date).toDateString();
            if(transDate === todayStr) {
                todaySales += (Number(t.total) || 0);
            }
        }
        if (t.status === 'Returned') returnCount++;
    });

    document.getElementById('dash-total-sales').textContent = `₹${totalRevenue.toLocaleString('en-IN')}`;
    document.getElementById('dash-products').textContent = globalInventory.length;
    document.getElementById('dash-orders').textContent = orderCount;
    document.getElementById('dash-today-sales').textContent = `₹${todaySales.toLocaleString('en-IN')}`;
    document.getElementById('dash-returns').textContent = returnCount;

    const recentList = document.getElementById('recent-transactions-list');
    if (recentList) {
        recentList.innerHTML = '';
        globalTransactions.slice(0, 4).forEach(t => {
            recentList.appendChild(createTransactionCard(t));
        });
    }
}


// --- 4. TRANSACTIONS UI LOGIC & ORDER SEARCH ---
const orderSearchInput = document.getElementById('order-search-input');
if (orderSearchInput) {
    orderSearchInput.addEventListener('input', (e) => {
        orderSearchQuery = e.target.value.toLowerCase().trim();
        transPage = 0; 
        renderTransactionsPage();
    });
}

function createTransactionCard(t, showAction = false) {
    const div = document.createElement('div');
    const dateObj = new Date(t.date);
    const timeStr = dateObj.toLocaleDateString('en-GB', {day: 'numeric', month:'short'}) + ' • ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const isSale = String(t.type || '').toLowerCase().includes('sale');
    const isReturned = t.status === 'Returned';
    
    let statusHtml = '';
    if(isSale && !isReturned) {
        statusHtml = `<span class="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md">Fulfilled</span>`;
    } else if (isReturned) {
        statusHtml = `<span class="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-md">Returned</span>`;
    } else {
        statusHtml = `<span class="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-1 rounded-md">Restock</span>`;
    }

    let title = t.items && t.items.length > 0 ? (t.items[0].particulars || t.items[0].name || 'Item') : 'Transaction';
    let subtext = t.items ? `${t.items.length} Item(s) • ${timeStr}` : timeStr;
    let initial = title.charAt(0).toUpperCase();

    let returnBtnHtml = (isSale && !isReturned && showAction) 
        ? `<button onclick="window.handleReturn('${t.id}')" class="mt-3 w-full text-xs font-bold text-rose-500 bg-rose-50 py-2 rounded-lg border border-rose-100">Issue Return</button>` 
        : '';

    div.className = "bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col";
    div.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-xl text-slate-400 shrink-0">
                ${initial}
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-slate-900 truncate">${title}</p>
                <p class="text-xs text-slate-500">${subtext}</p>
            </div>
            <div class="text-right shrink-0 flex flex-col items-end gap-1">
                ${statusHtml}
                <p class="text-sm font-bold text-slate-900 mt-1">₹${t.total}</p>
            </div>
        </div>
        ${returnBtnHtml}
    `;
    return div;
}

function renderTransactionsPage() {
    const list = document.getElementById('full-transactions-list');
    if (!list) return;
    list.innerHTML = '';
    
    const filtered = globalTransactions.filter(t => {
        if(!orderSearchQuery) return true;
        const typeMatch = (t.type || '').toLowerCase().includes(orderSearchQuery);
        const itemMatch = t.items && t.items.some(i => (i.particulars || i.name || '').toLowerCase().includes(orderSearchQuery));
        const idMatch = (t.id || '').toLowerCase().includes(orderSearchQuery);
        return typeMatch || itemMatch || idMatch;
    });

    const start = transPage * pageSize;
    const end = start + pageSize;
    const pageItems = filtered.slice(start, end);

    if(pageItems.length === 0) {
        list.innerHTML = `<p class="text-center text-slate-400 text-sm py-4">No matching orders found.</p>`;
    } else {
        pageItems.forEach(t => list.appendChild(createTransactionCard(t, true)));
    }

    document.getElementById('trans-page-indicator').textContent = `Page ${transPage + 1}`;
    document.getElementById('trans-prev-btn').disabled = (transPage === 0);
    document.getElementById('trans-next-btn').disabled = (end >= filtered.length);
}

document.getElementById('trans-prev-btn').addEventListener('click', () => { if(transPage > 0) { transPage--; renderTransactionsPage(); } });
document.getElementById('trans-next-btn').addEventListener('click', () => { transPage++; renderTransactionsPage(); });

window.handleReturn = async (transactionId) => {
    if(!confirm("Are you sure you want to return this sale?")) return;
    const result = await returnTransaction(transactionId);
    if(result.success) alert("Success: " + result.message);
    else alert("Error: " + result.message);
};


// --- 5. ANALYTICS LOGIC (CHART.JS) ---
function renderAnalytics() {
    const ctx = document.getElementById('salesChart');
    if(!ctx) return;

    const months =["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonth = new Date().getMonth();
    
    let labels =[];
    let dataPoints = [0,0,0,0,0,0];
    
    for(let i = 5; i >= 0; i--) {
        let m = currentMonth - i;
        if(m < 0) m += 12;
        labels.push(months[m]);
    }

    let sixMonthTotal = 0;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(currentMonth - 5);
    sixMonthsAgo.setDate(1);

    globalTransactions.forEach(t => {
        const d = new Date(t.date);
        const type = String(t.type || '').toLowerCase();
        
        if (type.includes('sale') && t.status !== 'Returned' && d >= sixMonthsAgo) {
            let mDiff = currentMonth - d.getMonth();
            if(mDiff < 0) mDiff += 12;
            let index = 5 - mDiff;
            
            if(index >= 0 && index <= 5) {
                dataPoints[index] += Number(t.total) || 0;
                sixMonthTotal += Number(t.total) || 0;
            }
        }
    });

    document.getElementById('chart-total-label').textContent = `₹${sixMonthTotal.toLocaleString('en-IN')}`;

    if(salesChartInstance) salesChartInstance.destroy();

    salesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets:[{
                label: 'Revenue',
                data: dataPoints,
                borderColor: '#0f172a', 
                backgroundColor: 'rgba(15, 23, 42, 0.05)',
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#0f172a',
                pointBorderWidth: 2,
                pointRadius: 4,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8' } },
                y: { border: { display: false }, grid: { color: '#f1f5f9' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8', callback: (val) => '₹'+val } }
            }
        }
    });

    const breakdownList = document.getElementById('inventory-breakdown-list');
    breakdownList.innerHTML = '';
    
    const sortedInv = [...globalInventory].sort((a,b) => b.quantity - a.quantity).slice(0, 4);
    sortedInv.forEach(item => {
        let maxQty = sortedInv[0].quantity || 1;
        let pct = Math.max(10, Math.round((item.quantity / maxQty) * 100));
        let itemName = item.name || item.particulars || 'Item';
        
        breakdownList.innerHTML += `
            <div>
                <div class="flex justify-between text-sm font-medium mb-1">
                    <span class="text-slate-700 truncate w-3/4">${itemName}</span>
                    <span class="text-slate-400">${item.quantity} left</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-1.5">
                    <div class="bg-slate-800 h-1.5 rounded-full" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    });
}


// --- 6. SALES CART & AUTO-SUGGEST LOGIC ---
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

        // Supports both new 'name' format and legacy JSON 'particulars' format
        const matches = globalInventory.filter(item => {
            const itemName = String(item.name || item.particulars || '').toLowerCase();
            const qty = Number(item.quantity) || 0;
            return itemName.includes(queryText) && qty > 0;
        });
        
        if (matches.length > 0) {
            suggestionsBox.classList.remove('hidden');
            matches.slice(0, 10).forEach(item => {
                const displayName = item.name || item.particulars || 'Item';
                const li = document.createElement('li');
                li.className = "p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-100 text-sm font-medium text-slate-900 flex justify-between";
                li.innerHTML = `<span>${displayName}</span> <span class="text-slate-400 font-normal">₹${item.price} (${item.quantity} left)</span>`;
                
                li.addEventListener('click', () => {
                    searchItemInput.value = displayName;
                    hiddenItemId.value = item.id;
                    document.getElementById('sale-cost-rate').value = item.price; 
                    document.getElementById('sale-sales-rate').value = item.price;
                    suggestionsBox.classList.add('hidden'); 
                });
                suggestionsBox.appendChild(li);
            });
        } else {
            suggestionsBox.classList.remove('hidden');
            suggestionsBox.innerHTML = '<li class="p-4 text-rose-500 text-sm font-bold">No items found / Out of Stock</li>';
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
            if (!id) return;
        } else {
            name = "(Cosmetic) " + inputCosmetic.value;
        }

        const costRate = parseFloat(document.getElementById('sale-cost-rate').value || 0);
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
        tbody.innerHTML = '<p class="text-center text-slate-500 text-sm py-4 border-dashed border-2 border-slate-700 rounded-xl">Cart is empty</p>';
        grandTotalEl.textContent = '₹0';
        document.getElementById('record-sale-btn').disabled = true;
        return;
    }

    document.getElementById('record-sale-btn').disabled = false;
    tbody.innerHTML = '';
    
    currentCart.forEach((item, index) => {
        const itemTotal = item.qty * item.salesRate;
        grandTotal += itemTotal;
        
        const div = document.createElement('div');
        div.className = "flex justify-between items-center bg-slate-700/50 p-3 rounded-xl";
        div.innerHTML = `
            <div class="flex-1 min-w-0 pr-2">
                <p class="text-sm font-medium text-white truncate">${item.name}</p>
                <p class="text-xs text-slate-400">${item.qty} x ₹${item.salesRate}</p>
            </div>
            <div class="flex items-center gap-3">
                <p class="text-sm font-bold text-emerald-400">₹${itemTotal}</p>
                <button type="button" onclick="window.removeFromCart(${index})" class="w-6 h-6 bg-rose-500/10 text-rose-500 rounded flex items-center justify-center font-bold hover:bg-rose-500 hover:text-white">✕</button>
            </div>
        `;
        tbody.appendChild(div);
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
        
        const result = await processCartSale(currentCart);
        
        msgEl.textContent = result.message;
        msgEl.className = result.success ? "mt-4 font-bold text-emerald-400 text-center text-sm" : "mt-4 font-bold text-rose-400 text-center text-sm";
        
        if(result.success) {
            currentCart =[]; 
            renderCart();
            setTimeout(() => { msgEl.textContent = ''; }, 3000);
        }
        recordSaleBtn.textContent = "Checkout";
        recordSaleBtn.disabled = false;
    });
}


// --- 7. INVENTORY LIST, SEARCH & PURCHASE ---

// Render Stock List
const stockSearchInput = document.getElementById('stock-search-input');
if (stockSearchInput) {
    stockSearchInput.addEventListener('input', (e) => {
        stockSearchQuery = e.target.value.toLowerCase().trim();
        renderInventoryList();
    });
}

function renderInventoryList() {
    const list = document.getElementById('inventory-list');
    if (!list) return;
    list.innerHTML = '';
    
    const filtered = globalInventory.filter(item => 
        String(item.name || item.particulars || '').toLowerCase().includes(stockSearchQuery)
    );

    if (filtered.length === 0) {
        list.innerHTML = `<p class="text-center text-slate-400 text-sm py-4">No items found.</p>`;
        return;
    }

    filtered.forEach(item => {
        const displayName = item.name || item.particulars || 'Item';
        const stockColor = item.quantity <= 0 ? 'text-rose-500' : 'text-slate-500';
        list.innerHTML += `
            <div class="flex justify-between items-center p-3 border-b border-slate-50 last:border-0">
                <span class="text-sm font-medium text-slate-900 truncate pr-2 w-2/3">${displayName}</span>
                <div class="text-right w-1/3">
                    <span class="text-sm font-bold ${stockColor}">${item.quantity} in stock</span>
                    <p class="text-xs text-slate-400">₹${item.price}</p>
                </div>
            </div>
        `;
    });
}

// Purchase Item Suggestions
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

        const matches = globalInventory.filter(item => {
            return String(item.name || item.particulars || '').toLowerCase().includes(queryText);
        });

        const uniqueMatches =[];
        const seen = new Set();
        matches.forEach(m => {
            const key = String(m.name || m.particulars) + String(m.price || 0); 
            if(!seen.has(key)) { seen.add(key); uniqueMatches.push(m); }
        });

        if(uniqueMatches.length > 0) {
            purchaseSuggestions.classList.remove('hidden');
            uniqueMatches.slice(0, 10).forEach(item => {
                const displayName = item.name || item.particulars || 'Item';
                const li = document.createElement('li');
                li.className = "p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-100 text-sm font-medium text-slate-900 flex justify-between";
                li.innerHTML = `<span>${displayName}</span> <span class="text-slate-400 font-normal">₹${item.price}</span>`;
                
                li.addEventListener('click', () => {
                    purchaseNameInput.value = displayName;
                    document.getElementById('purchase-rate').value = item.price;
                    purchaseSuggestions.classList.add('hidden');
                });
                purchaseSuggestions.appendChild(li);
            });
        } else {
            purchaseSuggestions.classList.remove('hidden');
            purchaseSuggestions.innerHTML = '<li class="p-4 text-slate-400 text-sm italic">New item will be created</li>';
        }
    });
}

// Global Click outside to hide dropdowns
document.addEventListener('click', (e) => {
    if (purchaseNameInput && purchaseSuggestions && !purchaseNameInput.contains(e.target) && !purchaseSuggestions.contains(e.target)) {
        purchaseSuggestions.classList.add('hidden');
    }
    if (searchItemInput && suggestionsBox && !searchItemInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.classList.add('hidden');
    }
});

// Purchase Form Submission
const purchaseForm = document.getElementById('purchase-form');
if (purchaseForm) {
    purchaseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('record-purchase-btn');
        const msgEl = document.getElementById('purchase-msg');
        btn.disabled = true;
        btn.textContent = "Wait...";

        const name = document.getElementById('purchase-item-name').value.trim();
        const rate = parseFloat(document.getElementById('purchase-rate').value);
        const qty = parseInt(document.getElementById('purchase-qty').value);

        try {
            const batch = writeBatch(db);
            const existingItem = globalInventory.find(i => String(i.name || i.particulars).toLowerCase() === name.toLowerCase() && Number(i.price) === rate);
            
            if(existingItem) {
                const itemRef = doc(db, 'inventory', existingItem.id);
                batch.update(itemRef, { quantity: existingItem.quantity + qty });
            } else {
                const newInvRef = doc(collection(db, 'inventory'));
                batch.set(newInvRef, { name: name, price: rate, quantity: qty, createdAt: new Date().toISOString() });
            }

            const total = rate * qty;
            const newTransRef = doc(collection(db, 'transactions'));
            batch.set(newTransRef, {
                type: "Purchase", date: new Date().toISOString(), year: new Date().getFullYear(),
                total: total, paidAmount: total, status: "Completed",
                items:[{ particulars: name, quantity: qty, rate: rate }]
            });

            await batch.commit();
            msgEl.textContent = "Stock Added!";
            msgEl.className = "text-center text-sm font-bold mt-2 text-emerald-500";
            e.target.reset();
        } catch(err) {
            msgEl.textContent = "Error";
            msgEl.className = "text-center text-sm font-bold mt-2 text-rose-500";
        }
        btn.disabled = false;
        btn.textContent = "Record Purchase";
        setTimeout(() => msgEl.textContent = '', 3000);
    });
}

// JSON Import
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
