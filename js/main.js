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
        const targetBtn = e.currentTarget;
        const targetId = targetBtn.getAttribute('data-target');
        
        // Sync active state across all nav elements (Mobile + Desktop sync)
        navButtons.forEach(b => {
            if(b.getAttribute('data-target') === targetId) {
                b.setAttribute('data-active', 'true');
            } else {
                b.setAttribute('data-active', 'false');
            }
        });

        sections.forEach(sec => sec.classList.add('hidden'));
        document.getElementById(targetId).classList.remove('hidden');
    });
});

// --- 2. AUTHENTICATION & DATA FETCHING ---
setupAuth((user) => {
    console.log("Logged in as:", user.email);
    
    listenToInventory((items) => {
        globalInventory = items;
        updateDashboard();
        updateInventoryTable();
    });

    // Auto-Fetches historical JSON data from Firebase
    onSnapshot(collection(db, 'transactions'), (snapshot) => {
        globalTransactions =[];
        const years = new Set();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id; 
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
    globalInventory =[]; 
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
                li.className = "p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 text-sm font-medium text-slate-700 transition-colors flex justify-between items-center";
                li.innerHTML = `<span><i class="fas fa-search text-slate-400 mr-2"></i>${item.name}</span> <span class="text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md text-xs font-bold shadow-sm">₹${item.price}</span>`;
                
                li.addEventListener('click', () => {
                    purchaseNameInput.value = item.name;
                    document.getElementById('purchase-rate').value = item.price;
                    purchaseSuggestions.classList.add('hidden');
                });
                purchaseSuggestions.appendChild(li);
            });
        } else {
            purchaseSuggestions.classList.remove('hidden');
            purchaseSuggestions.innerHTML = '<li class="p-4 text-emerald-600 bg-emerald-50 text-sm font-semibold flex items-center gap-2"><i class="fas fa-plus-circle"></i> New item will be created</li>';
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
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';

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

            msgEl.innerHTML = '<i class="fas fa-check-circle"></i> Purchase Recorded!';
            msgEl.className = "mt-3 text-sm font-bold text-emerald-600 text-center";
            e.target.reset();
        } catch(err) {
            msgEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + err.message;
            msgEl.className = "mt-3 text-sm font-bold text-red-500 text-center";
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save to Inventory';
        setTimeout(() => msgEl.textContent = '', 4000);
    });
}

function updateInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    if(!tbody) return;
    tbody.innerHTML = ''; 
    
    const sortedInventory =[...globalInventory].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    sortedInventory.forEach(item => {
        const tr = document.createElement('tr');
        const stockColor = item.quantity <= 0 ? 'text-red-500 bg-red-50 px-2 py-0.5 rounded-md' : 'text-slate-800';
        tr.className = "hover:bg-slate-50 transition-colors group";
        tr.innerHTML = `
            <td class="p-4 border-b border-gray-100 group-last:border-0 font-medium text-slate-700">${item.name}</td>
            <td class="p-4 border-b border-gray-100 group-last:border-0 text-right"><span class="font-bold ${stockColor}">${item.quantity}</span></td>
            <td class="p-4 border-b border-gray-100 group-last:border-0 text-right font-medium text-slate-500">₹${item.price}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- 4. SALES CART LOGIC ---
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
                li.className = "p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 text-sm font-medium text-slate-700 transition-colors flex justify-between items-center";
                li.innerHTML = `<span><i class="fas fa-box text-slate-400 mr-2"></i>${item.name}</span> <div class="flex gap-2 text-[10px]"><span class="bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold border border-slate-200">Stock: ${item.quantity}</span><span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-bold border border-indigo-100">₹${item.price}</span></div>`;
                
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
            suggestionsBox.innerHTML = '<li class="p-4 text-red-500 bg-red-50 text-sm font-bold flex items-center gap-2"><i class="fas fa-exclamation-circle"></i> No items found / Out of Stock</li>';
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
        if(radioInventory) { radioInventory.checked = true; toggleSaleType(); }
    });
}

function renderCart() {
    const tbody = document.getElementById('sale-cart-body');
    const grandTotalEl = document.getElementById('sale-grand-total');
    if(!tbody || !grandTotalEl) return;

    let grandTotal = 0;
    if(currentCart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-16"><div class="flex flex-col items-center justify-center text-slate-400"><i class="fas fa-shopping-basket text-5xl mb-4 opacity-30"></i><p class="font-medium text-sm">Your order is empty</p></div></td></tr>';
        grandTotalEl.textContent = '₹0';
        document.getElementById('record-sale-btn').disabled = true;
        return;
    }

    document.getElementById('record-sale-btn').disabled = false;
    tbody.innerHTML = '';
    
    currentCart.forEach((item, index) => {
        const itemTotal = item.qty * item.salesRate;
        grandTotal += itemTotal;
        const textStyle = item.type === 'cosmetic' ? 'text-purple-600 font-semibold' : 'text-slate-700 font-semibold';
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors group";
        tr.innerHTML = `
            <td class="p-3 border-b border-gray-100 group-last:border-0 ${textStyle}"><div class="truncate max-w-[150px] md:max-w-xs" title="${item.name}">${item.name}</div></td>
            <td class="p-3 border-b border-gray-100 group-last:border-0 text-center font-medium text-slate-600">${item.qty}</td>
            <td class="p-3 border-b border-gray-100 group-last:border-0 text-right text-slate-500">₹${item.salesRate}</td>
            <td class="p-3 border-b border-gray-100 group-last:border-0 text-right font-extrabold text-emerald-600">₹${itemTotal}</td>
            <td class="p-3 border-b border-gray-100 group-last:border-0 text-center">
                <button type="button" onclick="window.removeFromCart(${index})" class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center mx-auto shadow-sm">
                    <i class="fas fa-times"></i>
                </button>
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
        recordSaleBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        msgEl.textContent = "";
        
        const result = await processCartSale(currentCart);
        
        if(result.success) {
            msgEl.innerHTML = '<i class="fas fa-check-circle"></i> ' + result.message;
            msgEl.className = "mt-3 text-sm font-bold text-emerald-600 text-center";
            currentCart =[]; 
            renderCart();
        } else {
            msgEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + result.message;
            msgEl.className = "mt-3 text-sm font-bold text-red-500 text-center";
        }
        
        recordSaleBtn.innerHTML = '<i class="fas fa-check-circle"></i> Complete Sale';
        recordSaleBtn.disabled = currentCart.length === 0;
        setTimeout(() => { msgEl.textContent = ''; }, 4000);
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

    const sorted =[...globalTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        const tr = document.createElement('tr');
        
        const dateObj = new Date(t.date);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const itemsStr = t.items ? t.items.map(i => `${i.particulars || i.name || 'Item'} (x${i.quantity})`).join(', ') : 'N/A';
        
        const typeColor = t.type === 'Sale' ? 'text-emerald-700 bg-emerald-100 border-emerald-200' : 'text-amber-700 bg-amber-100 border-amber-200';
        const rowOpacity = t.status === 'Returned' ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50 transition-colors group';

        let actionHtml = '';
        if(t.type === 'Sale' && t.status !== 'Returned') {
            actionHtml = `<button type="button" onclick="window.handleReturn('${t.id}')" class="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5 ml-auto w-full max-w-[100px]"><i class="fas fa-undo"></i> Return</button>`;
        } else if (t.status === 'Returned') {
            actionHtml = `<span class="inline-flex items-center justify-end gap-1.5 text-red-500 font-bold text-xs ml-auto w-full"><i class="fas fa-check-circle"></i> Refunded</span>`;
        } else {
            actionHtml = `<span class="inline-flex items-center justify-end gap-1.5 text-slate-400 font-semibold text-xs ml-auto w-full"><i class="fas fa-arrow-down"></i> Stock Added</span>`; 
        }

        tr.className = rowOpacity;
        tr.innerHTML = `
            <td class="p-4 border-b border-gray-100 group-last:border-0 text-sm font-medium text-slate-500"><i class="far fa-clock mr-1.5 opacity-50"></i> ${dateStr}</td>
            <td class="p-4 border-b border-gray-100 group-last:border-0">
                <span class="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${typeColor}">${t.type}</span>
            </td>
            <td class="p-4 border-b border-gray-100 group-last:border-0 text-sm text-slate-700 max-w-[200px] truncate" title="${itemsStr}">${itemsStr}</td>
            <td class="p-4 border-b border-gray-100 group-last:border-0 font-extrabold text-slate-800 text-base">₹${t.total}</td>
            <td class="p-4 border-b border-gray-100 group-last:border-0 text-right">${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.handleReturn = async (transactionId) => {
    if(!confirm("Return this sale? Inventory items from this receipt will be restocked.")) return;
    
    const result = await returnTransaction(transactionId);
    if(result.success) {
        alert("✅ Success: " + result.message);
    } else {
        alert("❌ Error: " + result.message);
    }
};

// --- 7. JSON IMPORT LOGIC ---
const uploadInput = document.getElementById('json-upload');
const importBtn = document.getElementById('import-btn');
let selectedFile = null;

if(uploadInput && importBtn) {
    uploadInput.addEventListener('change', (e) => {
        selectedFile = e.target.files[0];
        if(selectedFile) {
            importBtn.classList.remove('hidden');
            const statusEl = document.getElementById('import-status');
            statusEl.innerHTML = `<span class="text-indigo-600 font-semibold"><i class="fas fa-file-code"></i> Selected: ${selectedFile.name}</span>`;
        }
    });

    importBtn.addEventListener('click', () => {
        if(selectedFile) {
            const statusEl = document.getElementById('import-status');
            importBtn.classList.add('hidden'); 
            statusEl.innerHTML = '<i class="fas fa-spinner fa-spin text-purple-600"></i> Processing...';
            processJSONUpload(selectedFile, statusEl);
        }
    });
}
--- START OF FILE auth.js ---
import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export function setupAuth(onLogin, onLogout) {
    // Listen for state changes (keeps user logged in on refresh)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-wrapper').classList.remove('hidden');
            onLogin(user);
        } else {
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('app-wrapper').classList.add('hidden');
            onLogout();
        }
    });

    // Handle Login Submit
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('auth-error');
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            errorEl.classList.add('hidden');
        } catch (error) {
            errorEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Invalid email or password.';
            errorEl.classList.remove('hidden');
        }
    });

    // Handle Logout
    const logout = () => signOut(auth);
    const logoutBtn = document.getElementById('logout-btn');
    const logoutBtnMobile = document.getElementById('logout-btn-mobile');
    
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (logoutBtnMobile) logoutBtnMobile.addEventListener('click', logout);
}
--- START OF FILE import.js ---
import { db } from './firebase-config.js';
import { collection, setDoc, doc, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function processJSONUpload(file, statusElement) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading Inventory... Please do not close window.';
            statusElement.className = "mt-4 font-bold text-indigo-600 text-center text-sm";
            
            // 1. Upload Inventory
            if(data.inventory && data.inventory.length > 0) {
                const invRef = collection(db, 'inventory');
                for (let item of data.inventory) {
                    await addDoc(invRef, {
                        name: item.particulars,
                        quantity: Number(item.quantity),
                        price: Number(item.rate),
                        createdAt: new Date().toISOString()
                    });
                }
            }

            statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading Transaction History... Please wait.';
            
            // 2. Upload Transactions
            if(data.transactions && data.transactions.length > 0) {
                const transRef = collection(db, 'transactions');
                for (let t of data.transactions) {
                    const dateObj = new Date(t.date);
                    
                    await setDoc(doc(transRef, t.id.toString()), {
                        type: t.type,
                        saleType: t.saleType || "Cash", 
                        partyName: t.partyName || null,
                        date: t.date,
                        year: dateObj.getFullYear(),
                        total: Number(t.total),
                        paidAmount: Number(t.paidAmount),
                        status: "Completed", 
                        items: t.items.map(i => ({
                            // Maps your exact JSON fields
                            particulars: i.particulars || i.name || "Unknown Item",
                            quantity: i.quantity,
                            sellingRate: i.sellingRate || 0,
                            costRate: i.costRate || i.rate || 0,
                            type: (i.particulars && i.particulars.toLowerCase().includes('cosmetic')) ? 'cosmetic' : 'inventory'
                        }))
                    });
                }
            }
            
            statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Import Complete! Refresh the page to see History.';
            statusElement.className = "mt-4 font-bold text-emerald-600 text-center text-sm";
        } catch (error) {
            console.error(error);
            statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error: ' + error.message;
            statusElement.className = "mt-4 font-bold text-red-500 text-center text-sm";
        }
    };
    
    reader.readAsText(file);
}
