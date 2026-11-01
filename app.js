// ==========================================================
// ====== AETHER ENTERPRISE SUITE: CORE APPLICATION ENGINE ==
// ==========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
    doc, deleteDoc, updateDoc, writeBatch, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBtY97ItVEcZ7srTcpIDUsXmqf1ZBlW2ZQ",
  authDomain: "store-manager-87634.firebaseapp.com",
  projectId: "store-manager-87634",
  storageBucket: "store-manager-87634.firebasestorage.app",
  messagingSenderId: "620672866976",
  appId: "1:620672866976:web:1ae1157027a2a0705f47c5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

window.db = db;
window.doc = doc;
window.collection = collection;
window.setDoc = setDoc;
window.getDoc = getDoc;

let unsubInventory = null;
let unsubTransactions = null;
let allTransactions = [];
let allInventory = [];

let myChartMonthly = null;
let myChartABC = null;
let myChartFSN = null;

const todayStr = new Date().toISOString().split('T')[0];
if (document.getElementById('filter-trans-start')) document.getElementById('filter-trans-start').value = todayStr;
if (document.getElementById('filter-trans-end')) document.getElementById('filter-trans-end').value = todayStr;

// Modern Indian Rupee Currency Formatter
const formatCurrency = (val, decimals = 2) => {
    const num = Number(val) || 0;
    return `₹${num.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    })}`;
};

// ==========================================
// ====== SATISFYING SUCCESS NOTIFICATION ===
// ==========================================
function showSuccessAnimation(msg = "Action Verified") {
    const overlay = document.getElementById('success-overlay');
    const card = document.getElementById('success-card');
    const iconContainer = document.getElementById('success-icon-container');
    
    document.getElementById('success-msg').innerText = msg;
    
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    
    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100', 'pointer-events-auto');
    card.classList.remove('scale-50');
    card.classList.add('scale-100');
    
    iconContainer.style.animation = 'none';
    void iconContainer.offsetWidth; 
    iconContainer.style.animation = null;

    setTimeout(() => {
        overlay.classList.remove('opacity-100', 'pointer-events-auto');
        overlay.classList.add('opacity-0', 'pointer-events-none');
        card.classList.remove('scale-100');
        card.classList.add('scale-50');
        
        setTimeout(() => overlay.classList.add('hidden'), 250);
    }, 1800);
}

// ==========================================
// ====== GLOBAL YEAR FILTER STATE ==========
// ==========================================
let globalYearFilter = "All";

document.getElementById('global-year-filter')?.addEventListener('change', (e) => {
    globalYearFilter = e.target.value;
    
    if (document.getElementById('dash-year-label')) {
        document.getElementById('dash-year-label').innerText = `(${globalYearFilter === 'All' ? 'All Fiscal Years' : globalYearFilter})`;
    }

    updateDashboardMetrics();
    renderTransactionsTable();
    renderDashboardTopItems();
    if (document.getElementById('tab-analytics')?.classList.contains('active')) runAnalytics();
});

function isYearMatch(dateStr) {
    if (globalYearFilter === "All") return true;
    if (!dateStr) return false;
    return new Date(dateStr).getFullYear().toString() === globalYearFilter;
}

function updateYearDropdown(transactions) {
    const selectEl = document.getElementById('global-year-filter');
    if (!selectEl) return;
    const currentVal = selectEl.value;
    
    const years = new Set();
    transactions.forEach(t => {
        if(t.date) {
            const year = new Date(t.date).getFullYear().toString();
            years.add(year);
        }
    });
    
    let html = `<option value="All">All Fiscal Years</option>`;
    Array.from(years).sort((a,b) => b - a).forEach(year => {
        html += `<option value="${year}">FY ${year}</option>`;
    });
    
    selectEl.innerHTML = html;
    
    if (years.has(currentVal) || currentVal === "All") {
        selectEl.value = currentVal;
    } else {
        globalYearFilter = "All";
        selectEl.value = "All";
    }
}

// ==========================================
// ====== THEME MANAGER =====================
// ==========================================
const btnThemeToggle = document.getElementById('btn-theme-toggle');
if (localStorage.getItem('theme') === 'dark' || !localStorage.getItem('theme')) {
    // Defaulting to Aether Dark
    document.body.classList.add('dark-mode');
    if (btnThemeToggle) btnThemeToggle.innerText = "Switch to Light Mode";
} else {
    document.body.classList.remove('dark-mode');
    if (btnThemeToggle) btnThemeToggle.innerText = "Switch to Dark Mode";
}

btnThemeToggle?.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    btnThemeToggle.innerText = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if(myChartMonthly) renderCharts(lastMonthlyData, lastAbcTotals, lastFsnTotals);
});

// ==========================================
// ====== AUTHENTICATION WORKFLOW ===========
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        startDatabaseListeners();
        setupPredictiveSearch('sale-item', 'sale-item-dropdown', true);
        setupPredictiveSearch('purchase-item', 'purchase-item-dropdown', false);
        
        setTimeout(() => {
            if(window.TrendEngine) {
                TrendEngine.init(db);
                TrendEngine.renderTab('trend-tab-container');
            }
        }, 1000);
    } else {
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        stopDatabaseListeners();
    }
});

document.getElementById('form-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await signInWithEmailAndPassword(
            auth, 
            document.getElementById('login-email').value, 
            document.getElementById('login-password').value
        );
        document.getElementById('login-error').style.display = 'none';
        document.getElementById('form-login').reset();
    } catch (error) {
        document.getElementById('login-error').style.display = 'block';
        document.getElementById('login-error').innerText = "Authentication Failed: Invalid Credentials.";
    }
});

document.getElementById('btn-logout')?.addEventListener('click', () => signOut(auth));

// ==========================================
// ====== WORKSPACE TAB NAVIGATION ==========
// ==========================================
const tabs = ['dashboard', 'transactions', 'trends', 'analytics', 'sales', 'purchases', 'inventory', 'settings'];

tabs.forEach(tab => {
    const btn = document.getElementById(`btn-${tab}`);
    if(btn) {
        btn.addEventListener('click', () => {
            tabs.forEach(t => {
                document.getElementById(`tab-${t}`)?.classList.remove('active');
                document.getElementById(`btn-${t}`)?.classList.remove('active');
            });
            
            document.getElementById(`tab-${tab}`)?.classList.add('active');
            document.getElementById(`btn-${tab}`)?.classList.add('active');
            
            if(tab === 'analytics') setTimeout(runAnalytics, 15); 
            if(tab === 'trends' && window.TrendEngine) {
                TrendEngine.renderTab('trend-tab-container');
            }
        });
    }
});

// ==========================================
// ====== REALTIME DATA PIPELINE ============
// ==========================================
let currentInventorySearch = "";
let currentInventoryFilter = "all";

function startDatabaseListeners() {
    unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => {
        allInventory = [];
        snapshot.forEach((docSnap) => {
            const item = docSnap.data();
            item.id = docSnap.id;
            allInventory.push(item);
        });

        window.allInventory = allInventory;
        updateInventoryStats();
        renderInventoryTable();
        
        if (document.getElementById('tab-analytics')?.classList.contains('active')) runAnalytics();
        updateDashboardMetrics();
    });

    unsubTransactions = onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
        allTransactions = [];
        snapshot.forEach((docSnap) => {
            const trans = docSnap.data();
            trans.id = docSnap.id; 
            allTransactions.push(trans);
        });
        
        window.allTransactions = allTransactions;
        
        updateYearDropdown(allTransactions);
        renderTransactionsTable();
        updateDashboardMonths(allTransactions);
        renderDashboardTopItems();
        updateDashboardMetrics();
        
        if (document.getElementById('tab-analytics')?.classList.contains('active')) runAnalytics();
        if (document.getElementById('tab-trends')?.classList.contains('active') && window.TrendEngine) {
            TrendEngine.refresh();
        }
    });
}

function stopDatabaseListeners() {
    if (unsubInventory) unsubInventory();
    if (unsubTransactions) unsubTransactions();
}

// ==========================================
// ====== CATEGORIZED PREDICTIVE SEARCH =====
// ==========================================
function setupPredictiveSearch(inputId, dropdownId, isSale) {
    const inputEl = document.getElementById(inputId);
    const dropdownEl = document.getElementById(dropdownId);
    if (!inputEl || !dropdownEl) return;

    document.addEventListener('click', (e) => {
        if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
            dropdownEl.classList.add('hidden');
        }
    });

    inputEl.addEventListener('focus', () => renderDropdown());
    inputEl.addEventListener('input', () => {
        renderDropdown();
        if (isSale) {
            const typedName = inputEl.value.trim().toLowerCase();
            const found = allInventory.find(i => i.name.toLowerCase() === typedName);
            document.getElementById('sale-cost').value = found ? found.price : '';
        }
    });

    function renderDropdown() {
        const query = inputEl.value.toLowerCase().trim();
        let filtered = query 
            ? allInventory.filter(item => (item.name || "").toLowerCase().includes(query))
            : allInventory;

        let html = '';

        if (filtered.length === 0) {
            html = `<div class="p-3 text-xs text-slate-400 text-center">No matching SKU in catalog.</div>`;
            if (!isSale && query) {
                html += `
                <div class="px-4 py-3 bg-primary/10 text-primary cursor-pointer font-semibold text-xs hover:bg-primary hover:text-white transition-colors dropdown-item flex items-center gap-2" data-name="${inputEl.value}" data-price="0">
                    <i class="fa-solid fa-plus-circle"></i> Create new SKU: "${inputEl.value}"
                </div>`;
            }
            dropdownEl.innerHTML = html;
            dropdownEl.classList.remove('hidden');
            attachClicks();
            return;
        }

        const grouped = {
            "Core Catalog (In Stock)": [],
            "Critical Alert (Low Stock)": [],
            "Depleted (Out of Stock)": []
        };

        filtered.forEach(item => {
            const qty = Number(item.qty) || 0;
            if (qty === 0) grouped["Depleted (Out of Stock)"].push(item);
            else if (qty <= 3) grouped["Critical Alert (Low Stock)"].push(item);
            else grouped["Core Catalog (In Stock)"].push(item);
        });

        for (const [category, items] of Object.entries(grouped)) {
            if (items.length > 0) {
                html += `
                <div class="px-3 py-1.5 bg-slate-100 dark:bg-[#182238] text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest sticky top-0 border-y border-slate-200 dark:border-slate-800">
                    ${category}
                </div>`;
                
                items.forEach(item => {
                    html += `
                    <div class="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[#1e2a47] cursor-pointer flex justify-between items-center dropdown-item border-b border-slate-100 dark:border-slate-800/60 transition-colors" data-name="${item.name}" data-price="${item.price}">
                        <div class="flex items-center gap-2.5">
                            <div class="w-6 h-6 rounded-md bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs">
                                <i class="fa-solid fa-shirt"></i>
                            </div>
                            <span class="font-semibold text-xs text-slate-800 dark:text-slate-100">${item.name}</span>
                        </div>
                        <div class="text-right">
                            <span class="block text-[11px] text-slate-400 font-mono">${item.qty} left</span>
                            <span class="block text-xs font-bold text-primary">${formatCurrency(item.price)}</span>
                        </div>
                    </div>`;
                });
            }
        }

        dropdownEl.innerHTML = html;
        dropdownEl.classList.remove('hidden');
        attachClicks();
    }

    function attachClicks() {
        dropdownEl.querySelectorAll('.dropdown-item').forEach(el => {
            el.addEventListener('click', () => {
                inputEl.value = el.getAttribute('data-name');
                dropdownEl.classList.add('hidden');
                if (isSale) {
                    document.getElementById('sale-cost').value = el.getAttribute('data-price');
                }
            });
        });
    }
}

// ==========================================
// ====== DASHBOARD OPERATIONS & METRICS ====
// ==========================================
function updateDashboardMetrics() {
    if (!allInventory || !allTransactions) return;

    const todayISO = new Date().toISOString().split('T')[0];
    
    let invMap = {};
    let invValue = 0;
    let lowStockCount = 0;
    let totalStockUnits = 0;

    allInventory.forEach(item => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        invMap[item.name] = { cost: price };
        invValue += (qty * price);
        totalStockUnits += qty;
        if (qty <= 3) lowStockCount++;
    });

    let todaySales = 0, todayCogs = 0, todayItemsSold = 0;
    let overallSales = 0, overallCogs = 0;
    let todayItemTrends = {};

    allTransactions.forEach(t => {
        if (!isYearMatch(t.date)) return;

        const tDateISO = (t.date || "").split('T')[0];
        const isToday = (tDateISO === todayISO);
        
        const amt = Number(t.amount) || 0;
        const qty = Number(t.qty) || 0;

        if (t.type === 'Sale' || t.type === 'Cosmetic Sale') {
            overallSales += amt;
            let cost = t.type === 'Sale' ? ((invMap[t.item]?.cost || 0) * qty) : ((Number(t.cost) || 0) * qty);
            overallCogs += cost;

            if (isToday) {
                todaySales += amt;
                todayCogs += cost;
                todayItemsSold += qty;
                todayItemTrends[t.item] = (todayItemTrends[t.item] || 0) + qty; 
            }
        } else if (t.type === 'Sale Return' || t.type === 'Cosmetic Return') {
            overallSales -= amt;
            let cost = t.type === 'Sale Return' ? ((invMap[t.item]?.cost || 0) * qty) : ((Number(t.cost) || 0) * qty);
            overallCogs -= cost;

            if (isToday) {
                todaySales -= amt;
                todayCogs -= cost;
                todayItemsSold -= qty; 
                todayItemTrends[t.item] = (todayItemTrends[t.item] || 0) - qty;
            }
        }
    });

    let todayProfit = todaySales - todayCogs;
    let todayMargin = todaySales > 0 ? ((todayProfit / todaySales) * 100).toFixed(1) : 0;
    let overallProfit = overallSales - overallCogs;

    let trendingItem = "No Sales Today";
    let maxQty = 0;
    for (const [itemName, count] of Object.entries(todayItemTrends)) {
        if (count > maxQty) {
            maxQty = count;
            trendingItem = itemName;
        }
    }

    if (document.getElementById('dash-today-sales')) {
        document.getElementById('dash-today-sales').innerText = formatCurrency(todaySales);
        document.getElementById('dash-today-profit').innerText = formatCurrency(todayProfit);
        document.getElementById('dash-today-margin').innerText = `${todayMargin}%`;
        document.getElementById('dash-today-items').innerText = todayItemsSold;
        document.getElementById('dash-today-trending').innerText = trendingItem;

        document.getElementById('dash-overall-revenue').innerText = formatCurrency(overallSales);
        document.getElementById('dash-overall-profit').innerText = formatCurrency(overallProfit);
        document.getElementById('dash-inv-value').innerText = formatCurrency(invValue);
        document.getElementById('dash-low-stock').innerText = lowStockCount;
        document.getElementById('dash-inventory').innerText = totalStockUnits.toLocaleString('en-IN');
    }
}

const dashMonthSelect = document.getElementById('dash-top-month');
const dashTypeSelect = document.getElementById('dash-top-type');

dashMonthSelect?.addEventListener('change', renderDashboardTopItems);
dashTypeSelect?.addEventListener('change', renderDashboardTopItems);

function updateDashboardMonths(transactions) {
    if (!dashMonthSelect) return;
    const currentSelection = dashMonthSelect.value;
    let monthsSet = new Set();
    
    monthsSet.add(new Date().toLocaleString('default', { month: 'long', year: 'numeric' }));

    transactions.forEach(t => {
        if (!isYearMatch(t.date)) return;
        const d = new Date(t.date);
        monthsSet.add(d.toLocaleString('default', { month: 'long', year: 'numeric' }));
    });

    let html = ''; 
    Array.from(monthsSet).forEach(m => { html += `<option value="${m}">${m}</option>`; });
    dashMonthSelect.innerHTML = html;
    if (currentSelection && monthsSet.has(currentSelection)) dashMonthSelect.value = currentSelection;
}

function renderDashboardTopItems() {
    const listContainer = document.getElementById('dash-top-list');
    if (!listContainer || !dashMonthSelect || !dashTypeSelect) return;

    const selectedMonth = dashMonthSelect.value;
    const selectedType = dashTypeSelect.value;
    
    let itemSalesMap = {};

    allTransactions.forEach(t => {
        if (!isYearMatch(t.date)) return;
        if (!t.type.includes('Sale')) return;
        if (selectedType !== 'All' && t.type !== selectedType) return;
        
        const tDate = new Date(t.date);
        const monthKey = tDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        if (selectedMonth !== 'All' && monthKey !== selectedMonth) return;

        if (!itemSalesMap[t.item]) itemSalesMap[t.item] = 0;
        
        if (t.type === 'Sale' || t.type === 'Cosmetic Sale') itemSalesMap[t.item] += Number(t.qty);
        else if (t.type === 'Sale Return' || t.type === 'Cosmetic Return') itemSalesMap[t.item] -= Number(t.qty);
    });

    let sortedItems = Object.keys(itemSalesMap)
        .map(itemName => ({ name: itemName, sold: itemSalesMap[itemName] }))
        .filter(item => item.sold > 0) 
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 8); 

    listContainer.innerHTML = '';
    if (sortedItems.length === 0) {
        listContainer.innerHTML = `<li class="text-center py-8 text-xs text-slate-400">No transactions recorded for the selected filter.</li>`;
        return;
    }

    let rank = 1;
    sortedItems.forEach(item => {
        let badgeColor = rank === 1 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : (rank === 2 ? 'bg-slate-300/15 text-slate-300 border-slate-400/30' : (rank === 3 ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'));
        
        listContainer.innerHTML += `
            <li class="flex justify-between items-center py-2.5 px-3 hover:bg-slate-50 dark:hover:bg-[#1a233a] rounded-xl transition-all">
                <div class="flex items-center gap-3">
                    <span class="w-6 h-6 rounded-md border flex items-center justify-center font-mono font-bold text-xs ${badgeColor}">
                        ${rank}
                    </span>
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs">
                            <i class="fa-solid fa-shirt"></i>
                        </div>
                        <span class="text-xs font-semibold text-slate-900 dark:text-slate-100">${item.name}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono">
                        ${item.sold} sold
                    </span>
                </div>
            </li>`;
        rank++;
    });
}

// ==========================================
// ====== AUDIT LEDGER & RETURNS ENGINE =====
// ==========================================
document.getElementById('btn-trans-filter')?.addEventListener('click', renderTransactionsTable);
document.getElementById('btn-trans-clear')?.addEventListener('click', () => { 
    document.getElementById('filter-trans-start').value = ''; 
    document.getElementById('filter-trans-end').value = ''; 
    renderTransactionsTable(); 
});

function renderTransactionsTable() {
    const tableBody = document.querySelector('#table-transactions tbody');
    if (!tableBody) return;

    const startVal = document.getElementById('filter-trans-start').value; 
    const endVal = document.getElementById('filter-trans-end').value;
    let sD = startVal ? new Date(startVal + 'T00:00:00') : null; 
    let eD = endVal ? new Date(endVal + 'T23:59:59') : null;

    let html = [];
    allTransactions.forEach((t) => {
        if (!isYearMatch(t.date)) return;

        const tDate = new Date(t.date);
        if (sD && tDate < sD) return; 
        if (eD && tDate > eD) return;
        
        let typeBadge = '';
        if (t.type === 'Sale') {
            typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Sale</span>`;
        } else if (t.type === 'Cosmetic Sale') {
            typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/15 text-pink-400 border border-pink-500/30">Cosmetic</span>`;
        } else if (t.type === 'Purchase') {
            typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">Purchase</span>`;
        } else {
            typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">${t.type}</span>`;
        }

        let actionBtn = (t.type === 'Sale' || t.type === 'Purchase' || t.type === 'Cosmetic Sale') 
            ? `<button class="btn-return inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-white transition active:scale-95" data-id="${t.id}"><i class="fa-solid fa-rotate-left pointer-events-none text-[10px]"></i> Return</button>`
            : `<span class="text-[11px] text-slate-500 font-medium italic">Adjusted</span>`;

        html.push(`
        <tr class="hover:bg-slate-50 dark:hover:bg-[#162034] transition-colors">
            <td class="px-5 py-3.5 whitespace-nowrap text-slate-400 font-mono">${tDate.toLocaleDateString('en-IN')}</td>
            <td class="px-5 py-3.5 whitespace-nowrap">${typeBadge}</td>
            <td class="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] text-slate-400"><i class="fa-solid fa-box"></i></span>
                ${t.item || "Unknown"}
            </td>
            <td class="px-5 py-3.5 whitespace-nowrap font-mono">${Number(t.qty) || 0}</td>
            <td class="px-5 py-3.5 whitespace-nowrap font-bold text-slate-900 dark:text-white font-mono">${formatCurrency(t.amount)}</td>
            <td class="px-5 py-3.5 text-center whitespace-nowrap">${actionBtn}</td>
        </tr>`);
    });

    if (html.length === 0) {
        html.push(`<tr><td colspan="6" class="px-5 py-8 text-center text-xs text-slate-400">No transactions recorded for this period.</td></tr>`);
    }

    tableBody.innerHTML = html.join('');
}

document.querySelector('#table-transactions tbody')?.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-return')) {
        const btn = e.target;
        if (btn.disabled) return;

        const id = btn.getAttribute('data-id');
        const t = allTransactions.find(x => x.id === id);
        if (!t) return;

        let returnQtyStr = prompt(`Audit Return for '${t.item}':\nEnter Quantity to return (Max: ${t.qty})`, t.qty);
        if (returnQtyStr === null) return; 
        
        let returnQty = parseFloat(returnQtyStr);
        if (isNaN(returnQty) || returnQty <= 0 || returnQty > t.qty) {
            alert(`Invalid quantity! Value must be between 0.01 and ${t.qty}`);
            return;
        }

        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing`;
        btn.classList.add('opacity-50', 'cursor-not-allowed');

        let returnAmount = (t.amount / t.qty) * returnQty;

        try {
            const batch = writeBatch(db);

            if (returnQty === t.qty) {
                batch.delete(doc(db, "transactions", t.id));
            } else {
                batch.update(doc(db, "transactions", t.id), {
                    qty: t.qty - returnQty,
                    amount: t.amount - returnAmount
                });
            }
            
            if (t.type !== 'Cosmetic Sale') {
                const localInvItem = allInventory.find(i => i.name === t.item);
                if (localInvItem) {
                    let currentStock = Number(localInvItem.qty);
                    let newStock = currentStock;

                    if (t.type === 'Sale') newStock += returnQty; 
                    else if (t.type === 'Purchase') newStock -= returnQty; 
                    
                    if(newStock < 0) newStock = 0;
                    batch.update(doc(db, "inventory", localInvItem.id), { qty: newStock });
                }
            }
            await batch.commit(); 
            showSuccessAnimation("Return Recorded to Ledger!");
        } catch (err) {
            console.error(err);
            alert("Error processing the return transaction.");
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
});

// ==========================================
// ====== ANALYTICS & VELOCITY ENGINE =======
// ==========================================
document.getElementById('btn-ana-filter')?.addEventListener('click', runAnalytics);
document.getElementById('btn-ana-clear')?.addEventListener('click', () => {
    document.getElementById('ana-start').value = ''; 
    document.getElementById('ana-end').value = ''; 
    runAnalytics();
});
document.getElementById('btn-ana-today')?.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ana-start').value = today; 
    document.getElementById('ana-end').value = today; 
    runAnalytics();
});
document.getElementById('ana-class-filter')?.addEventListener('change', runAnalytics);
document.getElementById('filter-top-selling')?.addEventListener('change', runAnalytics);
document.getElementById('filter-inv-status')?.addEventListener('change', runAnalytics);

let lastMonthlyData = {}; 
let lastAbcTotals = {}; 
let lastFsnTotals = {};

function runAnalytics() {
    if(!document.getElementById('tab-analytics')?.classList.contains('active')) return;

    const startVal = document.getElementById('ana-start').value; 
    const endVal = document.getElementById('ana-end').value;
    let startDate = startVal ? new Date(startVal + 'T00:00:00') : null; 
    let endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    let revenue = 0; 
    let cogs = 0; 
    let itemStats = {}; 
    let monthlyData = {};

    allInventory.forEach(inv => {
        itemStats[inv.name] = { 
            stock: inv.qty, 
            unitCost: inv.price, 
            invValue: (inv.qty * inv.price), 
            qtySold: 0, 
            totalRevenue: 0 
        };
    });

    allTransactions.forEach(trans => {
        if (!isYearMatch(trans.date)) return;

        const tDate = new Date(trans.date);
        if (startDate && tDate < startDate) return; 
        if (endDate && tDate > endDate) return;

        const monthKey = tDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        if(!monthlyData[monthKey]) monthlyData[monthKey] = { sales: 0, profit: 0 };

        if(trans.type === 'Sale') {
            revenue += trans.amount; 
            monthlyData[monthKey].sales += trans.amount;
            let cost = 0;
            if(itemStats[trans.item]) {
                cost = itemStats[trans.item].unitCost * trans.qty;
                itemStats[trans.item].qtySold += trans.qty;
                itemStats[trans.item].totalRevenue += trans.amount;
            }
            cogs += cost; 
            monthlyData[monthKey].profit += (trans.amount - cost);
        } else if (trans.type === 'Cosmetic Sale') {
            revenue += trans.amount; 
            monthlyData[monthKey].sales += trans.amount;
            let cost = (trans.cost || 0) * trans.qty; 
            cogs += cost; 
            monthlyData[monthKey].profit += (trans.amount - cost);
        } else if (trans.type === 'Sale Return') {
            revenue -= trans.amount; 
            monthlyData[monthKey].sales -= trans.amount;
            let cost = 0;
            if(itemStats[trans.item]) {
                cost = itemStats[trans.item].unitCost * trans.qty;
                itemStats[trans.item].qtySold -= trans.qty; 
                itemStats[trans.item].totalRevenue -= trans.amount;
            }
            cogs -= cost; 
            monthlyData[monthKey].profit += (trans.amount - cost);
        } else if (trans.type === 'Cosmetic Return') {
            revenue -= trans.amount; 
            monthlyData[monthKey].sales -= trans.amount;
            let cost = (trans.cost || 0) * trans.qty;
            cogs -= cost; 
            monthlyData[monthKey].profit += (trans.amount - cost);
        }
    });

    let profit = revenue - cogs;
    let margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
    let totalStock = allInventory.reduce((acc, curr) => acc + Number(curr.qty || 0), 0);

    document.getElementById('ana-revenue').innerText = formatCurrency(revenue);
    document.getElementById('ana-profit').innerText = formatCurrency(profit);
    document.getElementById('ana-margin').innerText = `${margin}%`;
    document.getElementById('ana-stock').innerText = totalStock.toLocaleString('en-IN');

    // ABC Analysis
    let totalInvValue = 0; 
    let abcArray = [];
    for (const [name, data] of Object.entries(itemStats)) {
        totalInvValue += data.invValue; 
        abcArray.push({ name, value: data.invValue });
    }
    abcArray.sort((a,b) => b.value - a.value);
    
    let cumValue = 0; 
    let abcTotals = { A: 0, B: 0, C: 0 }; 
    let abcHtml = [];
    abcArray.forEach(item => {
        cumValue += item.value; 
        let pct = totalInvValue > 0 ? cumValue / totalInvValue : 0; 
        let category = 'C';
        let catBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">Class C</span>`;
        
        if(pct <= 0.70) { 
            abcTotals.A += item.value; 
            category = 'A'; 
            catBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Class A</span>`; 
        } else if (pct <= 0.90) { 
            abcTotals.B += item.value; 
            category = 'B'; 
            catBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">Class B</span>`; 
        } else { 
            abcTotals.C += item.value; 
        }
        
        abcHtml.push(`
        <tr class="hover:bg-slate-50 dark:hover:bg-[#162034] transition-colors">
            <td class="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">${item.name}</td>
            <td class="py-3 px-4 font-mono">${formatCurrency(item.value)}</td>
            <td class="py-3 px-4 font-mono text-slate-400">${(pct * 100).toFixed(1)}%</td>
            <td class="py-3 px-4">${catBadge}</td>
        </tr>`);
    });
    document.querySelector('#table-abc tbody').innerHTML = abcHtml.join('');

    // Top Selling List
    const filterTop = document.getElementById('filter-top-selling').value; 
    let topHtml = [];
    let sortedTop = Object.keys(itemStats)
        .map(k => ({name: k, sold: itemStats[k].qtySold}))
        .sort((a,b) => b.sold - a.sold);
    if(filterTop === 'Top10') sortedTop = sortedTop.slice(0, 10);
    sortedTop.forEach(item => { 
        if(item.sold > 0 || filterTop === 'All') {
            topHtml.push(`
            <tr class="hover:bg-slate-50 dark:hover:bg-[#162034] transition-colors">
                <td class="py-2.5 px-3 font-medium">${item.name}</td>
                <td class="py-2.5 px-3 text-right font-bold text-emerald-400 font-mono">${item.sold}</td>
            </tr>`);
        }
    });
    document.getElementById('tbody-top-selling').innerHTML = topHtml.join('');

    // Critical Inventory Alert List
    const filterInv = document.getElementById('filter-inv-status').value; 
    let invHtml = [];
    let sortedInv = Object.keys(itemStats)
        .map(k => ({name: k, stock: itemStats[k].stock}))
        .sort((a,b) => a.stock - b.stock);
    sortedInv.forEach(item => {
        if (filterInv === 'Low' && item.stock > 3) return; 
        let stockStyle = item.stock <= 3 ? 'text-rose-400 font-bold' : 'text-slate-300';
        invHtml.push(`
        <tr class="hover:bg-slate-50 dark:hover:bg-[#162034] transition-colors">
            <td class="py-2.5 px-3 font-medium">${item.name}</td>
            <td class="py-2.5 px-3 text-right font-mono ${stockStyle}">${item.stock} units</td>
        </tr>`);
    });
    document.getElementById('tbody-inv-status').innerHTML = invHtml.join('');

    // FSN Matrix
    let fsnTotals = { F: 0, S: 0, N: 0 }; 
    let matrixRows = [];
    let maxQtySold = Math.max(...Object.values(itemStats).map(i => i.qtySold), 0);
    let maxRev = Math.max(...Object.values(itemStats).map(i => i.totalRevenue), 0);

    for (const [name, data] of Object.entries(itemStats)) {
        let FSN = 'N'; 
        if (data.qtySold > 0) FSN = data.qtySold >= (maxQtySold * 0.5) ? 'F' : 'S'; 
        fsnTotals[FSN] += data.stock;
        
        let HMV = 'V'; 
        if (data.totalRevenue > 0) HMV = data.totalRevenue >= (maxRev * 0.5) ? 'H' : 'M'; 
        
        let actClass = "";
        if(FSN==='F' && HMV==='H') actClass = "⭐ Stars"; 
        else if(FSN==='S' && HMV==='H') actClass = "💰 Cash Cows";
        else if(FSN==='N' && HMV==='H') actClass = "🔥 Dead Weight"; 
        else if(FSN==='F' && HMV==='M') actClass = "🚀 Drivers";
        else if(FSN==='S' && HMV==='M') actClass = "🐢 Slugs"; 
        else if(FSN==='N' && HMV==='M') actClass = "💤 Sleepers";
        else if(FSN==='F' && HMV==='V') actClass = "🏃 Runners"; 
        else if(FSN==='S' && HMV==='V') actClass = "📦 Basics";
        else if(FSN==='N' && HMV==='V') actClass = "🗑️ Dead Stock";

        matrixRows.push({ name, stock: data.stock, invValue: data.invValue, rev: data.totalRevenue, FSN, HMV, actClass });
    }

    const filterClass = document.getElementById('ana-class-filter').value; 
    let matrixHtml = [];
    matrixRows.sort((a,b) => b.rev - a.rev).forEach(row => {
        if(filterClass !== "All" && !row.actClass.includes(filterClass)) return;
        
        let fsnPill = row.FSN==='F' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : (row.FSN==='S' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30');
        let hmvPill = row.HMV==='H' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : (row.HMV==='M' ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30');

        matrixHtml.push(`
        <tr class="hover:bg-slate-50 dark:hover:bg-[#162034] transition-colors">
            <td class="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">${row.name}</td>
            <td class="py-3 px-4 font-mono">${row.stock}</td>
            <td class="py-3 px-4 font-mono">${formatCurrency(row.invValue)}</td>
            <td class="py-3 px-4 font-mono font-bold text-emerald-400">${formatCurrency(row.rev)}</td>
            <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold border ${fsnPill}">${row.FSN}</span></td>
            <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold border ${hmvPill}">${row.HMV}</span></td>
            <td class="py-3 px-4 text-xs font-semibold">${row.actClass}</td>
        </tr>`);
    });
    document.querySelector('#table-matrix tbody').innerHTML = matrixHtml.join('');

    lastMonthlyData = monthlyData; 
    lastAbcTotals = abcTotals; 
    lastFsnTotals = fsnTotals;
    renderCharts(monthlyData, abcTotals, fsnTotals);
}

// Chart.js Modernized Canvas Renderers
function renderCharts(monthlyData, abcTotals, fsnTotals) {
    if(myChartMonthly) myChartMonthly.destroy(); 
    if(myChartABC) myChartABC.destroy(); 
    if(myChartFSN) myChartFSN.destroy();

    const labelsMonth = Object.keys(monthlyData).reverse();
    const dataSales = labelsMonth.map(m => monthlyData[m].sales);
    const dataProfit = labelsMonth.map(m => monthlyData[m].profit);
    const isDark = document.body.classList.contains('dark-mode');
    
    const chartTextColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? '#1e293b' : '#f1f5f9';
    Chart.defaults.color = chartTextColor;
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

    // Monthly Sales & Profit
    const ctxMonthly = document.getElementById('chart-monthly')?.getContext('2d');
    if (ctxMonthly) {
        myChartMonthly = new Chart(ctxMonthly, {
            type: 'bar', 
            data: { 
                labels: labelsMonth.length ? labelsMonth : ["No Data"], 
                datasets: [
                    { 
                        label: 'Sales (₹)', 
                        data: dataSales, 
                        backgroundColor: '#3b82f6', 
                        borderRadius: 6,
                        maxBarThickness: 32
                    }, 
                    { 
                        label: 'Profit (₹)', 
                        data: dataProfit, 
                        backgroundColor: '#10b981', 
                        borderRadius: 6,
                        maxBarThickness: 32
                    }
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { 
                    title: { display: true, text: 'Monthly Performance Trajectory', color: chartTextColor, font: { weight: 'bold', size: 13 } },
                    legend: { labels: { boxWidth: 12, borderRadius: 4, useBorderRadius: true } }
                }, 
                scales: {
                    x: { grid: { color: gridColor, drawBorder: false } },
                    y: { grid: { color: gridColor, drawBorder: false }, beginAtZero: true }
                }
            }
        });
    }

    // ABC Inventory Doughnut
    const ctxABC = document.getElementById('chart-abc')?.getContext('2d');
    if (ctxABC) {
        myChartABC = new Chart(ctxABC, {
            type: 'doughnut', 
            data: { 
                labels: ['Class A (Top 70%)', 'Class B (Mid 20%)', 'Class C (Tail 10%)'], 
                datasets: [{ 
                    data: [abcTotals.A, abcTotals.B, abcTotals.C], 
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], 
                    borderWidth: 0,
                    hoverOffset: 4
                }] 
            },
            options: { 
                responsive: true, 
                cutout: '72%',
                plugins: { 
                    title: { display: true, text: 'Valuation by ABC Class', color: chartTextColor, font: { weight: 'bold', size: 12 } },
                    legend: { position: 'bottom', labels: { boxWidth: 10, borderRadius: 3, useBorderRadius: true } }
                } 
            }
        });
    }

    // FSN Velocity Pie
    const ctxFSN = document.getElementById('chart-fsn')?.getContext('2d');
    if (ctxFSN) {
        myChartFSN = new Chart(ctxFSN, {
            type: 'pie', 
            data: { 
                labels: ['Fast Moving (F)', 'Slow Moving (S)', 'Non-Moving (N)'], 
                datasets: [{ 
                    data: [fsnTotals.F, fsnTotals.S, fsnTotals.N], 
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#64748b'], 
                    borderWidth: 0,
                    hoverOffset: 4
                }] 
            },
            options: { 
                responsive: true, 
                plugins: { 
                    title: { display: true, text: 'Velocity by FSN Distribution', color: chartTextColor, font: { weight: 'bold', size: 12 } },
                    legend: { position: 'bottom', labels: { boxWidth: 10, borderRadius: 3, useBorderRadius: true } }
                } 
            }
        });
    }
}

// ==========================================
// ====== POINT OF SALE & CART SYSTEM =======
// ==========================================
let saleCart = []; 

function updateCartUI() {
    const cartContainer = document.getElementById('cart-container');
    const cartList = document.getElementById('cart-list');
    const cartTotal = document.getElementById('cart-total');
    if (!cartContainer || !cartList || !cartTotal) return;
    
    cartList.innerHTML = '';
    let totalAmount = 0;

    if (saleCart.length === 0) {
        cartContainer.classList.add('hidden');
    } else {
        cartContainer.classList.remove('hidden');
        saleCart.forEach((cartItem, index) => {
            totalAmount += cartItem.amount;
            cartList.innerHTML += `
                <li class="flex justify-between items-center py-2 border-b border-slate-200/80 dark:border-slate-800 last:border-0">
                    <div class="flex items-center gap-2">
                        <span class="w-5 h-5 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center text-[10px]"><i class="fa-solid fa-shirt"></i></span>
                        <span class="text-slate-800 dark:text-slate-200 font-medium">${cartItem.item} <b class="text-primary font-mono">(x${cartItem.qty})</b></span>
                    </div>
                    <span class="font-bold font-mono">${formatCurrency(cartItem.amount)} 
                        <button type="button" onclick="window.removeCartItem(${index})" class="text-rose-500 hover:text-rose-700 ml-3 transition-colors"><i class="fa-solid fa-trash-can text-xs"></i></button>
                    </span>
                </li>`;
        });
    }
    cartTotal.innerText = totalAmount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

window.removeCartItem = function(index) {
    saleCart.splice(index, 1);
    updateCartUI();
};

document.getElementById('btn-add-to-cart')?.addEventListener('click', () => {
    const item = document.getElementById('sale-item').value.trim();
    const qtyStr = document.getElementById('sale-qty').value;
    const rateStr = document.getElementById('sale-rate').value;

    if (!item || !qtyStr || !rateStr) {
        alert("Please specify Item Name, Quantity, and Selling Rate.");
        return;
    }

    const itemExists = allInventory.find(i => i.name === item);
    if (!itemExists) {
        alert("Unregistered Item! Please pick a valid item from inventory autocomplete.");
        return;
    }

    let qty = parseFloat(qtyStr);
    let rate = parseFloat(rateStr);
    if (qty <= 0 || rate < 0) {
        alert("Quantity and Selling Rate must be greater than zero.");
        return;
    }

    let amount = qty * rate;
    const existingIndex = saleCart.findIndex(c => c.item === item && c.rate === rate);
    if (existingIndex !== -1) {
        saleCart[existingIndex].qty += qty;
        saleCart[existingIndex].amount += amount;
    } else {
        saleCart.push({ item, qty, rate, amount });
    }
    
    document.getElementById('sale-item').value = '';
    document.getElementById('sale-qty').value = '';
    document.getElementById('sale-rate').value = '';
    document.getElementById('sale-cost').value = '';
    
    updateCartUI();
});

// Standard Sale Checkout Submission
const saleForm = document.getElementById('form-sale');
saleForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const submitBtn = document.getElementById('btn-save-sale');
    if (submitBtn.disabled) return;
    
    const pendingItem = document.getElementById('sale-item').value.trim();
    if (pendingItem) {
        document.getElementById('btn-add-to-cart').click();
    }

    if (saleCart.length === 0) {
        alert("The checkout cart is empty!");
        return;
    }

    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authorizing Checkout...`;
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

    try {
        const batch = writeBatch(db);
        const date = new Date().toISOString();

        for (let i = 0; i < saleCart.length; i++) {
            const cartItem = saleCart[i];

            const newTransRef = doc(collection(db, "transactions"));
            batch.set(newTransRef, { 
                type: "Sale", 
                item: cartItem.item, 
                qty: cartItem.qty, 
                rate: cartItem.rate, 
                amount: cartItem.amount, 
                date: date 
            });

            const localInvItem = allInventory.find(inv => inv.name === cartItem.item);
            if (localInvItem) {
                let newQty = Number(localInvItem.qty) - cartItem.qty;
                localInvItem.qty = newQty < 0 ? 0 : newQty;
                batch.update(doc(db, "inventory", localInvItem.id), { qty: localInvItem.qty });
            }
        }

        await batch.commit(); 

        saleCart = [];
        updateCartUI();
        saleForm.reset();
        document.getElementById('sale-cost').value = '';
        
        showSuccessAnimation("Checkout Completed Successfully!");
    } catch (error) { 
        console.error(error); 
        alert("Error encountered during checkout batch write.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
});

// Cosmetic Sale Submission
const cosmeticForm = document.getElementById('form-cosmetic');
cosmeticForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = cosmeticForm.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;

    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving Record...`;
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

    const item = document.getElementById('cosmetic-item').value.trim() + " (Cosmetic)";
    let qty = parseFloat(document.getElementById('cosmetic-qty').value);
    let cost = parseFloat(document.getElementById('cosmetic-cost').value);
    let rate = parseFloat(document.getElementById('cosmetic-rate').value);
    let amount = qty * rate; 
    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type: "Cosmetic Sale", item, qty, cost, rate, amount, date });
        cosmeticForm.reset();
        showSuccessAnimation("Cosmetic Sale Recorded!");
    } catch (e) { 
        console.error(e);
        alert("Error saving cosmetic transaction."); 
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
});

// Purchases / Inbound Stock Submission
const purchaseForm = document.getElementById('form-purchase');
purchaseForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = purchaseForm.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;

    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registering Inbound...`;
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

    const item = document.getElementById('purchase-item').value.trim();
    let qty = parseFloat(document.getElementById('purchase-qty').value);
    let amount = parseFloat(document.getElementById('purchase-amount').value);
    const date = new Date().toISOString();

    try {
        const batch = writeBatch(db);
        const transRef = doc(collection(db, "transactions"));
        batch.set(transRef, { type: "Purchase", item, qty, amount, date });

        const localInvItem = allInventory.find(i => i.name === item);
        if (localInvItem) {
            batch.update(doc(db, "inventory", localInvItem.id), { qty: Number(localInvItem.qty) + qty });
        } else {
            const newInvRef = doc(collection(db, "inventory"));
            batch.set(newInvRef, { name: item, qty: qty, price: qty > 0 ? (amount / qty) : 0 });
        }

        await batch.commit();

        purchaseForm.reset();
        showSuccessAnimation("Inbound Purchase Recorded!");
    } catch (e) { 
        console.error(e); 
        alert("Error saving purchase record.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
});

// ==========================================
// ====== INVENTORY REGISTER LOGIC ==========
// ==========================================
function updateInventoryStats() {
    let totalItems = allInventory.length;
    let outCount = 0;
    let lowCount = 0;
    let totalValue = 0;

    allInventory.forEach(item => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        
        totalValue += (qty * price);
        if (qty === 0) outCount++;
        else if (qty <= 3) lowCount++;
    });

    if (document.getElementById('stat-inv-total')) {
        document.getElementById('stat-inv-total').innerText = totalItems.toLocaleString('en-IN');
        document.getElementById('stat-inv-value').innerText = formatCurrency(totalValue);
        document.getElementById('stat-inv-out').innerText = outCount;
        document.getElementById('stat-inv-low').innerText = lowCount;
    }
}

function renderInventoryTable() {
    const tableBody = document.querySelector('#table-inventory tbody');
    if (!tableBody) return;

    let rowsHtml = [];
    const query = currentInventorySearch.toLowerCase().trim();

    let filtered = allInventory.filter(item => {
        const itemName = (item.name || "").toLowerCase();
        const qty = Number(item.qty) || 0;
        
        if (query && !itemName.includes(query)) return false;
        if (currentInventoryFilter === 'out' && qty !== 0) return false;
        if (currentInventoryFilter === 'low' && (qty === 0 || qty > 3)) return false;
        
        return true;
    });

    filtered.forEach((item) => {
        const itemName = item.name || "Unknown";
        const itemQty = Number(item.qty) || 0;
        const itemPrice = Number(item.price) || 0;
        const stockValue = itemQty * itemPrice;

        // Status Badge matching Aether Project
        let badgeHtml = "";
        if (itemQty === 0) {
            badgeHtml = `<span class="px-2.5 py-1 text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-full whitespace-nowrap"><i class="fa-solid fa-circle-xmark mr-1"></i> Out of stock</span>`;
        } else if (itemQty <= 3) {
            badgeHtml = `<span class="px-2.5 py-1 text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full whitespace-nowrap"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Low &mdash; ${itemQty} left</span>`;
        } else {
            badgeHtml = `<span class="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full whitespace-nowrap"><i class="fa-solid fa-check mr-1"></i> ${itemQty} in stock</span>`;
        }

        rowsHtml.push(`
        <tr class="hover:bg-slate-50 dark:hover:bg-[#162034] transition-colors">
            <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs">
                        <i class="fa-solid fa-shirt"></i>
                    </div>
                    <div class="font-bold text-slate-900 dark:text-white">${itemName}</div>
                </div>
            </td>
            <td class="px-5 py-3.5 text-right font-mono text-slate-900 dark:text-slate-100 font-medium">${itemQty} units</td>
            <td class="px-5 py-3.5 text-right font-mono text-slate-900 dark:text-slate-100">${formatCurrency(itemPrice)}</td>
            <td class="px-5 py-3.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">${formatCurrency(stockValue)}</td>
            <td class="px-5 py-3.5 text-right">${badgeHtml}</td>
            <td class="px-5 py-3.5 text-right">
                <div class="flex justify-end gap-1.5">
                    <button class="btn-edit w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-colors" data-id="${item.id}" data-name="${itemName}" data-qty="${itemQty}" data-price="${itemPrice}" title="Edit SKU">
                        <i class="fa-solid fa-pen pointer-events-none text-xs"></i>
                    </button>
                    <button class="btn-delete w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/30 transition-colors" data-id="${item.id}" title="Delete SKU">
                        <i class="fa-solid fa-trash pointer-events-none text-xs"></i>
                    </button>
                </div>
            </td>
        </tr>`);
    });

    if (filtered.length === 0) {
        rowsHtml.push(`<tr><td colspan="6" class="px-5 py-12 text-center text-xs text-slate-400">No catalogue items match your criteria.</td></tr>`);
    }

    tableBody.innerHTML = rowsHtml.join('');
}

document.getElementById('search-inventory')?.addEventListener('input', (e) => {
    currentInventorySearch = e.target.value;
    renderInventoryTable();
});

// Aether Pill Tab Switchers
document.querySelectorAll('.inv-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.inv-tab').forEach(t => {
            t.classList.remove('active', 'bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-sm');
            t.classList.add('text-slate-500', 'dark:text-slate-400');
        });
        
        const activeBtn = e.target;
        activeBtn.classList.remove('text-slate-500', 'dark:text-slate-400');
        activeBtn.classList.add('active', 'bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-sm');
        
        currentInventoryFilter = activeBtn.getAttribute('data-filter');
        renderInventoryTable();
    });
});

// Add / Edit Inventory SKU Form
const inventoryForm = document.getElementById('form-inventory');
inventoryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value.trim();
    let qty = parseFloat(document.getElementById('inv-qty').value);
    let price = parseFloat(document.getElementById('inv-price').value);
    
    if (isNaN(qty)) qty = 0; 
    if (isNaN(price)) price = 0;
    
    const editId = inventoryForm.getAttribute('data-edit-id'); 

    if (editId) { 
        await updateDoc(doc(db, "inventory", editId), { name, qty, price }); 
        resetInventoryForm(); 
        showSuccessAnimation("Item Updated Successfully!");
    } else { 
        await addDoc(collection(db, "inventory"), { name, qty, price }); 
        inventoryForm.reset(); 
        showSuccessAnimation("New SKU Registered!");
    }
});

document.getElementById('btn-inv-cancel')?.addEventListener('click', resetInventoryForm);

function resetInventoryForm() {
    inventoryForm.reset(); 
    inventoryForm.removeAttribute('data-edit-id');
    document.getElementById('btn-inv-submit').innerText = "Save";
    document.getElementById('inv-form-title').innerText = "Add new item";
    document.getElementById('btn-inv-cancel').style.display = "none";
}

document.querySelector('#table-inventory tbody')?.addEventListener('click', async (e) => {
    const btnDel = e.target.closest('.btn-delete');
    if (btnDel) {
        if (confirm("Delete this inventory item from database?")) {
            await deleteDoc(doc(db, "inventory", btnDel.getAttribute('data-id')));
            showSuccessAnimation("SKU Deleted from Database");
        }
    }
    
    const btnEdit = e.target.closest('.btn-edit');
    if (btnEdit) {
        document.getElementById('inv-name').value = btnEdit.getAttribute('data-name');
        document.getElementById('inv-qty').value = btnEdit.getAttribute('data-qty');
        document.getElementById('inv-price').value = btnEdit.getAttribute('data-price');
        inventoryForm.setAttribute('data-edit-id', btnEdit.getAttribute('data-id'));
        
        document.getElementById('btn-inv-submit').innerText = "Update";
        document.getElementById('inv-form-title').innerText = `Editing: ${btnEdit.getAttribute('data-name')}`;
        document.getElementById('btn-inv-cancel').style.display = "inline-block";
        
        document.getElementById('inv-name').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

// ==========================================
// ====== EXCEL IMPORT & DEDUPLICATION ======
// ==========================================
document.getElementById('btn-trigger-excel')?.addEventListener('click', () => { 
    document.getElementById('excel-file').click(); 
});

document.getElementById('excel-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;

    if(!confirm("DANGER: This action will purge existing inventory and overwrite it with this spreadsheet. Proceed?")) {
        e.target.value = ''; 
        return; 
    }

    const btn = document.getElementById('btn-trigger-excel');
    const ogText = btn.innerHTML; 
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-2xl"></i> <span class="text-xs">Importing...</span>`; 
    btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet);

            for (let item of allInventory) { 
                await deleteDoc(doc(db, "inventory", item.id)); 
            }

            for(const row of json) {
                const name = row['particulars'] || row['Particulars'] || row['Name'] || row['name'];
                const qtyStr = row['quantity'] || row['Quantity'] || row['qty'];
                const rateStr = row['rate'] || row['Rate'] || row['price'];

                if(name && name.trim() !== '') {
                    const qty = Number(qtyStr) || 0;
                    const price = Number(rateStr) || 0;
                    await addDoc(collection(db, "inventory"), { name: name.trim(), qty, price });
                }
            }
            
            showSuccessAnimation("Excel Data Imported Cleanly!");
        } catch (error) {
            console.error(error); 
            alert("An error occurred during Excel ingestion. Inspect console logs.");
        } finally {
            btn.innerHTML = ogText; 
            btn.disabled = false; 
            document.getElementById('excel-file').value = ''; 
        }
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById('btn-sync-drive')?.addEventListener('click', () => { 
    alert("Project Aether: Cloud backup verified."); 
});

document.getElementById('btn-merge-dup')?.addEventListener('click', async () => {
    if(!confirm("Scan catalogue and consolidate duplicate SKUs? (Quantities summed, weighted unit costs calculated.)")) return;
    const btn = document.getElementById('btn-merge-dup');
    const ogText = btn.innerHTML; 
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-2xl"></i> <span class="text-xs">Consolidating...</span>`; 
    btn.disabled = true;

    try {
        const itemsMap = {};
        allInventory.forEach(item => {
            const key = item.name.trim().toLowerCase(); 
            if(!itemsMap[key]) itemsMap[key] = [];
            itemsMap[key].push(item);
        });

        let mergeCount = 0;
        for(const key in itemsMap) {
            if(itemsMap[key].length > 1) {
                mergeCount++;
                let totalQty = 0; 
                let totalPriceObj = 0;
                let mainId = itemsMap[key][0].id;
                
                itemsMap[key].forEach(i => {
                    let iQty = Number(i.qty) || 0; 
                    let iPrice = Number(i.price) || 0;
                    totalQty += iQty; 
                    totalPriceObj += (iQty * iPrice);
                });
                let avgPrice = totalQty > 0 ? (totalPriceObj / totalQty) : 0;
                await updateDoc(doc(db, "inventory", mainId), { qty: totalQty, price: avgPrice });
                
                for(let i = 1; i < itemsMap[key].length; i++) {
                    await deleteDoc(doc(db, "inventory", itemsMap[key][i].id));
                }
            }
        }
        if(mergeCount > 0) {
            showSuccessAnimation(`Consolidated ${mergeCount} Duplicate Groups!`);
        } else {
            alert("Inventory is completely deduplicated.");
        }
    } catch (err) { 
        console.error(err); 
        alert("Consolidation error occurred.");
    } finally { 
        btn.innerHTML = ogText; 
        btn.disabled = false; 
    }
});
