// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, getDocs, where, writeBatch, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Your Firebase configuration
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

// Session flag for dead stock auto-purge
let hasAutoPurgedThisSession = false;

const todayStr = new Date().toISOString().split('T')[0];
if (document.getElementById('filter-trans-start')) document.getElementById('filter-trans-start').value = todayStr;
if (document.getElementById('filter-trans-end')) document.getElementById('filter-trans-end').value = todayStr;


// ==========================================
// ====== SATISFYING SUCCESS ANIMATION ======
// ==========================================
function showSuccessAnimation(msg = "Success!") {
    const overlay = document.getElementById('success-overlay');
    const card = document.getElementById('success-card');
    const iconContainer = document.getElementById('success-icon-container');
    
    if (!overlay || !card) return;
    
    document.getElementById('success-msg').innerText = msg;
    
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    
    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100', 'pointer-events-auto');
    card.classList.remove('scale-50');
    card.classList.add('scale-100');
    
    if (iconContainer) {
        iconContainer.style.animation = 'none';
        void iconContainer.offsetWidth; 
        iconContainer.style.animation = null;
    }

    setTimeout(() => {
        overlay.classList.remove('opacity-100', 'pointer-events-auto');
        overlay.classList.add('opacity-0', 'pointer-events-none');
        card.classList.remove('scale-100');
        card.classList.add('scale-50');
        
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
    }, 2000);
}


// ----- GLOBAL YEAR FILTER STATE -----
let globalYearFilter = "All";

const globalYearSelect = document.getElementById('global-year-filter');
if (globalYearSelect) {
    globalYearSelect.addEventListener('change', (e) => {
        globalYearFilter = e.target.value;
        
        if (document.getElementById('dash-year-label')) {
            document.getElementById('dash-year-label').innerText = `(${globalYearFilter === 'All' ? 'All Years' : globalYearFilter})`;
        }

        updateDashboardMetrics();
        renderTransactionsTable();
        renderDashboardTopItems();
        updateInventoryStats();
        renderInventoryTable();
        if (document.getElementById('tab-analytics')?.classList.contains('active')) runAnalytics();
    });
}

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
    
    let html = `<option value="All">All Years</option>`;
    Array.from(years).sort((a,b) => b - a).forEach(year => {
        html += `<option value="${year}">${year}</option>`;
    });
    
    selectEl.innerHTML = html;
    
    if (years.has(currentVal) || currentVal === "All") {
        selectEl.value = currentVal;
    } else {
        globalYearFilter = "All";
        selectEl.value = "All";
    }
}


// ----- THEME LOGIC -----
const btnThemeToggle = document.getElementById('btn-theme-toggle');
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    if (btnThemeToggle) btnThemeToggle.innerText = "Switch Theme";
}
if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        if(myChartMonthly) renderCharts(lastMonthlyData, lastAbcTotals, lastFsnTotals);
    });
}


// ----- AUTHENTICATION LOGIC -----
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
        }, 1500);
    } else {
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        stopDatabaseListeners();
    }
});

document.getElementById('form-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
        document.getElementById('login-error').style.display = 'none';
        document.getElementById('form-login').reset();
    } catch (error) {
        document.getElementById('login-error').style.display = 'block';
        document.getElementById('login-error').innerText = "Error: Invalid Credentials.";
    }
});
document.getElementById('btn-logout')?.addEventListener('click', () => signOut(auth));


// ----- TAB NAVIGATION -----
const tabs = ['dashboard', 'transactions', 'trends', 'analytics', 'sales', 'purchases', 'inventory', 'settings'];

tabs.forEach(tab => {
    const btn = document.getElementById(`btn-${tab}`);
    if(btn) {
        btn.addEventListener('click', () => {
            tabs.forEach(t => {
                const tabEl = document.getElementById(`tab-${t}`);
                const btnEl = document.getElementById(`btn-${t}`);
                if(tabEl) tabEl.classList.remove('active');
                if(btnEl) btnEl.classList.remove('active');
            });
            
            document.getElementById(`tab-${tab}`)?.classList.add('active');
            document.getElementById(`btn-${tab}`)?.classList.add('active');
            
            if(tab === 'analytics') setTimeout(runAnalytics, 10); 
            if(tab === 'inventory') { updateInventoryStats(); renderInventoryTable(); }
            
            if(tab === 'trends' && window.TrendEngine) {
                if(!document.getElementById('te-root')) {
                    TrendEngine.renderTab('trend-tab-container');
                }
            }
        });
    }
});


// ----- DATABASE LISTENERS -----
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
        updateInventoryStats();
        renderInventoryTable();
        
        if (document.getElementById('tab-analytics')?.classList.contains('active')) runAnalytics();
        
        if (document.getElementById('tab-trends')?.classList.contains('active') && window.TrendEngine) {
            TrendEngine.refresh();
        }

        // Auto-purge items at 0 stock for >6 months (Runs once per session)
        if (!hasAutoPurgedThisSession && allInventory.length > 0 && allTransactions.length > 0) {
            hasAutoPurgedThisSession = true;
            setTimeout(() => {
                purgeDeadStock(true); // Silent run in background
            }, 3000);
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
            const foundItem = allInventory.find(item => item.name.toLowerCase() === typedName);
            document.getElementById('sale-cost').value = foundItem ? foundItem.price : '';
        }
    });

    function renderDropdown() {
        const query = inputEl.value.toLowerCase().trim();
        let filtered = allInventory;
        
        if (query) {
            filtered = allInventory.filter(item => item.name.toLowerCase().includes(query));
        }

        let html = '';

        if (filtered.length === 0) {
            html = `<div class="p-3 text-xs text-slate-400 text-center">No inventory items found.</div>`;
            if (!isSale && query) {
                html += `<div class="px-4 py-2.5 bg-danger/10 text-danger cursor-pointer font-semibold text-xs hover:bg-danger hover:text-white transition-colors dropdown-item" data-name="${inputEl.value}" data-price="0">
                    <i class="fa-solid fa-plus mr-1.5"></i> Add as new item: "${inputEl.value}"
                </div>`;
            }
            dropdownEl.innerHTML = html;
            dropdownEl.classList.remove('hidden');
            attachClicks();
            return;
        }

        const grouped = {
            "🟢 In Stock": [],
            "🟠 Low Stock": [],
            "🔴 Out of Stock": []
        };

        filtered.forEach(item => {
            const qty = Number(item.qty);
            if (qty === 0) grouped["🔴 Out of Stock"].push(item);
            else if (qty <= 3) grouped["🟠 Low Stock"].push(item);
            else grouped["🟢 In Stock"].push(item);
        });

        for (const [category, items] of Object.entries(grouped)) {
            if (items.length > 0) {
                html += `<div class="px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider sticky top-0 backdrop-blur-sm z-10 border-y border-slate-200 dark:border-zinc-700">${category}</div>`;
                
                items.forEach(item => {
                    const priceStr = Number(item.price).toFixed(2);
                    html += `
                    <div class="px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-zinc-700/50 cursor-pointer flex justify-between items-center dropdown-item border-b border-slate-100 dark:border-zinc-800 last:border-0 transition-colors" data-name="${item.name}" data-price="${item.price}">
                        <span class="font-semibold text-xs text-slate-800 dark:text-zinc-100">${item.name}</span>
                        <div class="text-right">
                            <span class="block text-[10px] text-slate-400">Stock: ${item.qty}</span>
                            <span class="block text-xs font-bold text-primary">₹${priceStr}</span>
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
// ====== DASHBOARD WIDGETS & METRICS =======
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

        const tDateISO = t.date.split('T')[0];
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

    let trendingItem = "N/A";
    let maxQty = 0;
    for (const [itemName, count] of Object.entries(todayItemTrends)) {
        if (count > maxQty) {
            maxQty = count;
            trendingItem = itemName;
        }
    }

    if (document.getElementById('dash-today-sales')) {
        document.getElementById('dash-today-sales').innerText = `₹${todaySales.toFixed(2)}`;
        document.getElementById('dash-today-profit').innerText = `₹${todayProfit.toFixed(2)}`;
        document.getElementById('dash-today-margin').innerText = `${todayMargin}%`;
        document.getElementById('dash-today-items').innerText = todayItemsSold;
        document.getElementById('dash-today-trending').innerText = trendingItem;

        document.getElementById('dash-overall-revenue').innerText = `₹${overallSales.toFixed(2)}`;
        document.getElementById('dash-overall-profit').innerText = `₹${overallProfit.toFixed(2)}`;
        document.getElementById('dash-inv-value').innerText = `₹${invValue.toFixed(2)}`;
        document.getElementById('dash-low-stock').innerText = lowStockCount;
        document.getElementById('dash-inventory').innerText = totalStockUnits;
    }
}

const dashMonthSelect = document.getElementById('dash-top-month');
const dashTypeSelect = document.getElementById('dash-top-type');

if (dashMonthSelect) dashMonthSelect.addEventListener('change', renderDashboardTopItems);
if (dashTypeSelect) dashTypeSelect.addEventListener('change', renderDashboardTopItems);

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
    if (!dashMonthSelect || !dashTypeSelect) return;
    const selectedMonth = dashMonthSelect.value;
    const selectedType = dashTypeSelect.value;
    const listContainer = document.getElementById('dash-top-list');
    if (!listContainer) return;
    
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
        .slice(0, 10); 

    listContainer.innerHTML = '';
    if (sortedItems.length === 0) {
        listContainer.innerHTML = `<li class="text-center py-6 text-xs text-slate-400">No sales found for this filter.</li>`;
        return;
    }

    let rank = 1;
    sortedItems.forEach(item => {
        let rankColor = rank === 1 ? '#f59e0b' : (rank === 2 ? '#94a3b8' : (rank === 3 ? '#b45309' : '#64748b'));
        let rankIcon = rank <= 3 ? `<i class="fa-solid fa-medal" style="color: ${rankColor}"></i>` : `<span class="inline-block w-4 text-center text-white rounded-full text-[10px] leading-4" style="background:${rankColor}">${rank}</span>`;
        
        listContainer.innerHTML += `
            <li class="flex justify-between items-center py-2.5 px-3 hover:bg-slate-50 dark:hover:bg-zinc-800/60 rounded-xl transition-colors">
                <div class="text-xs font-semibold text-slate-800 dark:text-zinc-200"><span class="mr-2">${rankIcon}</span> ${item.name}</div>
                <div class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-200/50 dark:border-emerald-800/40">${item.sold} sold</div>
            </li>`;
        rank++;
    });
}


// ==========================================
// ====== TRANSACTIONS & RETURNS LOGIC ======
// ==========================================
document.getElementById('btn-trans-filter')?.addEventListener('click', renderTransactionsTable);
document.getElementById('btn-trans-clear')?.addEventListener('click', () => { 
    document.getElementById('filter-trans-start').value = ''; 
    document.getElementById('filter-trans-end').value = ''; 
    renderTransactionsTable(); 
});

function renderTransactionsTable() {
    const startVal = document.getElementById('filter-trans-start')?.value; 
    const endVal = document.getElementById('filter-trans-end')?.value;
    let sD = startVal ? new Date(startVal + 'T00:00:00') : null; 
    let eD = endVal ? new Date(endVal + 'T23:59:59') : null;

    let html = [];
    allTransactions.forEach((t) => {
        if (!isYearMatch(t.date)) return;

        const tDate = new Date(t.date);
        if (sD && tDate < sD) return; 
        if (eD && tDate > eD) return;
        
        let tColorClass = t.type.includes('Sale') 
            ? (t.type.includes('Cosmetic') ? 'text-pink-600 dark:text-pink-400' : 'text-emerald-600 dark:text-emerald-400') 
            : (t.type.includes('Purchase') ? 'text-danger' : 'text-amber-500');
        
        let actionBtn = (t.type === 'Sale' || t.type === 'Purchase' || t.type === 'Cosmetic Sale') 
            ? `<button class="btn-return bg-amber-50 hover:bg-amber-500 text-amber-600 hover:text-white dark:bg-amber-950/30 dark:hover:bg-amber-500 dark:text-amber-400 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border border-amber-200/60 dark:border-amber-800/50" data-id="${t.id}">Return</button>`
            : `<span class="text-[11px] text-slate-400 font-medium italic">Returned</span>`;
        
        html.push(`
        <tr class="hover:bg-slate-50/60 dark:hover:bg-zinc-800/40 transition-colors">
            <td class="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-zinc-400">${tDate.toLocaleDateString()}</td>
            <td class="px-5 py-3 whitespace-nowrap font-bold ${tColorClass}">${t.type}</td>
            <td class="px-5 py-3 font-semibold text-slate-900 dark:text-white">${t.item || "Unknown"}</td>
            <td class="px-5 py-3 whitespace-nowrap font-medium">${Number(t.qty) || 0}</td>
            <td class="px-5 py-3 whitespace-nowrap font-bold text-slate-900 dark:text-white">₹${(Number(t.amount) || 0).toFixed(2)}</td>
            <td class="px-5 py-3 text-center whitespace-nowrap">${actionBtn}</td>
        </tr>`);
    });
    const tbody = document.querySelector('#table-transactions tbody');
    if (tbody) tbody.innerHTML = html.join('');
}

document.querySelector('#table-transactions tbody')?.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-return')) {
        const btn = e.target;
        if (btn.disabled) return;

        const id = btn.getAttribute('data-id');
        const t = allTransactions.find(x => x.id === id);
        if (!t) return;

        let returnQtyStr = prompt(`How many '${t.item}' do you want to return?\n(Original Quantity: ${t.qty})`, t.qty);
        if (returnQtyStr === null) return; 
        
        let returnQty = parseFloat(returnQtyStr);
        if (isNaN(returnQty) || returnQty <= 0 || returnQty > t.qty) {
            alert(`Invalid quantity! Must be between 0.01 and ${t.qty}`);
            return;
        }

        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
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
                    
                    batch.update(doc(db, "inventory", localInvItem.id), { 
                        qty: newStock,
                        ...(newStock > 0 ? { zeroStockSince: null } : { zeroStockSince: new Date().toISOString() })
                    });
                }
            }
            await batch.commit(); 
            showSuccessAnimation("Return Processed Successfully!");
        } catch (err) {
            console.error(err);
            alert("Error processing the return.");
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
});


// ==========================================
// ====== ADVANCED ANALYTICS ENGINE =========
// ==========================================
document.getElementById('btn-ana-filter')?.addEventListener('click', runAnalytics);
document.getElementById('btn-ana-clear')?.addEventListener('click', () => {
    document.getElementById('ana-start').value = ''; document.getElementById('ana-end').value = ''; runAnalytics();
});
document.getElementById('btn-ana-today')?.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ana-start').value = today; document.getElementById('ana-end').value = today; runAnalytics();
});
document.getElementById('ana-class-filter')?.addEventListener('change', runAnalytics);
document.getElementById('filter-top-selling')?.addEventListener('change', runAnalytics);
document.getElementById('filter-inv-status')?.addEventListener('change', runAnalytics);

let lastMonthlyData = {}; 
let lastAbcTotals = {}; 
let lastFsnTotals = {};
let lastAnalyticsItemStats = {};
let lastAnalyticsAbcArray = [];
let lastAnalyticsMatrixRows = [];

function runAnalytics() {
    if(!document.getElementById('tab-analytics')?.classList.contains('active')) return;

    const startVal = document.getElementById('ana-start')?.value; const endVal = document.getElementById('ana-end')?.value;
    let startDate = startVal ? new Date(startVal + 'T00:00:00') : null; let endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    let revenue = 0; let cogs = 0; 
    let itemStats = {}; 
    let monthlyData = {};

    allInventory.forEach(inv => {
        itemStats[inv.name] = { stock: inv.qty, unitCost: inv.price, invValue: (inv.qty * inv.price), qtySold: 0, totalRevenue: 0 };
    });

    allTransactions.forEach(trans => {
        if (!isYearMatch(trans.date)) return;

        const tDate = new Date(trans.date);
        if (startDate && tDate < startDate) return; if (endDate && tDate > endDate) return;

        const monthKey = tDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        if(!monthlyData[monthKey]) monthlyData[monthKey] = { sales: 0, profit: 0 };

        if(trans.type === 'Sale') {
            revenue += trans.amount; monthlyData[monthKey].sales += trans.amount;
            let cost = 0;
            if(itemStats[trans.item]) {
                cost = itemStats[trans.item].unitCost * trans.qty;
                itemStats[trans.item].qtySold += trans.qty;
                itemStats[trans.item].totalRevenue += trans.amount;
            }
            cogs += cost; monthlyData[monthKey].profit += (trans.amount - cost);
        } else if (trans.type === 'Cosmetic Sale') {
            revenue += trans.amount; monthlyData[monthKey].sales += trans.amount;
            let cost = (trans.cost || 0) * trans.qty; 
            cogs += cost; monthlyData[monthKey].profit += (trans.amount - cost);
        } else if (trans.type === 'Sale Return') {
            revenue -= trans.amount; monthlyData[monthKey].sales -= trans.amount;
            let cost = 0;
            if(itemStats[trans.item]) {
                cost = itemStats[trans.item].unitCost * trans.qty;
                itemStats[trans.item].qtySold -= trans.qty; 
                itemStats[trans.item].totalRevenue -= trans.amount;
            }
            cogs += cost; monthlyData[monthKey].profit += (trans.amount - cost);
        } else if (trans.type === 'Cosmetic Return') {
            revenue -= trans.amount; monthlyData[monthKey].sales -= trans.amount;
            let cost = (trans.cost || 0) * trans.qty;
            cogs -= cost; monthlyData[monthKey].profit += (trans.amount - cost);
        }
    });

    let profit = revenue - cogs;
    let margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
    let totalStock = allInventory.reduce((acc, curr) => acc + Number(curr.qty || 0), 0);

    document.getElementById('ana-revenue').innerText = `₹${revenue.toFixed(2)}`;
    document.getElementById('ana-profit').innerText = `₹${profit.toFixed(2)}`;
    document.getElementById('ana-margin').innerText = `${margin}%`;
    document.getElementById('ana-stock').innerText = totalStock;

    let totalInvValue = 0; let abcArray = [];
    for (const[name, data] of Object.entries(itemStats)) {
        totalInvValue += data.invValue; 
        abcArray.push({ 
            name, 
            value: data.invValue, 
            stock: data.stock, 
            qtySold: data.qtySold, 
            totalRevenue: data.totalRevenue 
        });
    }
    abcArray.sort((a,b) => b.value - a.value);
    
    let cumValue = 0; let abcTotals = { A: 0, B: 0, C: 0 }; let abcHtml = [];
    abcArray.forEach(item => {
        cumValue += item.value; 
        let pct = totalInvValue > 0 ? cumValue / totalInvValue : 0; 
        let category = 'C';
        let catClass = 'text-danger font-bold';
        if(pct <= 0.70) { 
            abcTotals.A += item.value; 
            category = 'A'; 
            catClass = 'text-emerald-600 dark:text-emerald-400 font-bold'; 
        } else if (pct <= 0.90) { 
            abcTotals.B += item.value; 
            category = 'B'; 
            catClass = 'text-amber-500 font-bold'; 
        } else { 
            abcTotals.C += item.value; 
            category = 'C'; 
        }
        item.category = category;
        item.cumPct = pct;
        
        abcHtml.push(`<tr><td class="py-2.5 px-4 font-semibold text-slate-800 dark:text-zinc-200">${item.name}</td><td class="py-2.5 px-4">₹${item.value.toFixed(2)}</td><td class="py-2.5 px-4">${(pct * 100).toFixed(1)}%</td><td class="py-2.5 px-4 ${catClass}">${category}</td></tr>`);
    });
    const abcTbody = document.querySelector('#table-abc tbody');
    if (abcTbody) abcTbody.innerHTML = abcHtml.join('');

    const filterTop = document.getElementById('filter-top-selling')?.value; let topHtml = [];
    let sortedTop = Object.keys(itemStats).map(k => ({name: k, sold: itemStats[k].qtySold})).sort((a,b) => b.sold - a.sold);
    if(filterTop === 'Top10') sortedTop = sortedTop.slice(0, 10);
    sortedTop.forEach(item => { 
        if(item.sold > 0 || filterTop === 'All') {
            topHtml.push(`<tr><td class="py-2 px-3 font-medium text-slate-800 dark:text-zinc-200">${item.name}</td><td class="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">${item.sold}</td></tr>`);
        }
    });
    const topTbody = document.getElementById('tbody-top-selling');
    if (topTbody) topTbody.innerHTML = topHtml.join('');

    const filterInv = document.getElementById('filter-inv-status')?.value; let invHtml = [];
    let sortedInv = Object.keys(itemStats).map(k => ({name: k, stock: itemStats[k].stock})).sort((a,b) => a.stock - b.stock);
    sortedInv.forEach(item => {
        if (filterInv === 'Low' && item.stock > 3) return; 
        invHtml.push(`<tr><td class="py-2 px-3 font-medium text-slate-800 dark:text-zinc-200">${item.name}</td><td class="py-2 px-3 text-right ${item.stock <= 3 ? 'text-danger font-bold' : ''}">${item.stock}</td></tr>`);
    });
    const invTbody = document.getElementById('tbody-inv-status');
    if (invTbody) invTbody.innerHTML = invHtml.join('');

    let fsnTotals = { F: 0, S: 0, N: 0 }; let matrixRows = [];
    let maxQtySold = Math.max(...Object.values(itemStats).map(i => i.qtySold), 0);
    let maxRev = Math.max(...Object.values(itemStats).map(i => i.totalRevenue), 0);

    for (const[name, data] of Object.entries(itemStats)) {
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
        
        matrixRows.push({ 
            name, 
            stock: data.stock, 
            invValue: data.invValue, 
            rev: data.totalRevenue, 
            qtySold: data.qtySold,
            FSN, 
            HMV, 
            actClass 
        });
    }

    const filterClass = document.getElementById('ana-class-filter')?.value; let matrixHtml = [];
    matrixRows.sort((a,b) => b.rev - a.rev).forEach(row => {
        if(filterClass !== "All" && !row.actClass.includes(filterClass)) return;
        let fsnColor = row.FSN==='F'?'text-emerald-600 dark:text-emerald-400':(row.FSN==='S'?'text-amber-500':'text-danger');
        let hmvColor = row.HMV==='H'?'text-primary':(row.HMV==='M'?'text-purple-500':'text-slate-400');
        matrixHtml.push(`<tr><td class="py-2.5 px-4 font-bold text-slate-800 dark:text-zinc-100">${row.name}</td><td class="py-2.5 px-4">${row.stock}</td><td class="py-2.5 px-4">₹${row.invValue.toFixed(2)}</td><td class="py-2.5 px-4">₹${row.rev.toFixed(2)}</td><td class="py-2.5 px-4 font-bold ${fsnColor}">${row.FSN}</td><td class="py-2.5 px-4 font-bold ${hmvColor}">${row.HMV}</td><td class="py-2.5 px-4 font-medium">${row.actClass}</td></tr>`);
    });
    const matrixTbody = document.querySelector('#table-matrix tbody');
    if (matrixTbody) matrixTbody.innerHTML = matrixHtml.join('');

    lastMonthlyData = monthlyData; 
    lastAbcTotals = abcTotals; 
    lastFsnTotals = fsnTotals;
    lastAnalyticsItemStats = itemStats;
    lastAnalyticsAbcArray = abcArray;
    lastAnalyticsMatrixRows = matrixRows;

    renderCharts(monthlyData, abcTotals, fsnTotals);
}

function renderCharts(monthlyData, abcTotals, fsnTotals) {
    if(myChartMonthly) myChartMonthly.destroy(); 
    if(myChartABC) myChartABC.destroy(); 
    if(myChartFSN) myChartFSN.destroy();

    const labelsMonth = Object.keys(monthlyData).reverse();
    const dataSales = labelsMonth.map(m => monthlyData[m].sales);
    const dataProfit = labelsMonth.map(m => monthlyData[m].profit);
    const isDark = document.body.classList.contains('dark-mode');
    const chartTextColor = isDark ? '#cbd5e1' : '#475569';
    Chart.defaults.color = chartTextColor;
    Chart.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';

    const canvasMonthly = document.getElementById('chart-monthly');
    if (canvasMonthly) {
        myChartMonthly = new Chart(canvasMonthly, {
            type: 'bar', 
            data: { 
                labels: labelsMonth.length ? labelsMonth : ["No Data"], 
                datasets: [
                    { label: 'Sales (₹)', data: dataSales, backgroundColor: '#3b82f6', borderRadius: 6 }, 
                    { label: 'Profit (₹)', data: dataProfit, backgroundColor: '#10b981', borderRadius: 6 }
                ] 
            },
            options: { 
                responsive: true, 
                plugins: { 
                    title: { display: true, text: 'Monthly Sales vs Profit', color: chartTextColor } 
                }, 
                animation: { duration: 0 } 
            }
        });
    }

    const canvasAbc = document.getElementById('chart-abc');
    if (canvasAbc) {
        myChartABC = new Chart(canvasAbc, {
            type: 'doughnut', 
            data: { 
                labels: ['A (Top 70%)', 'B (Next 20%)', 'C (Bottom 10%)'], 
                datasets: [{ 
                    data: [abcTotals.A, abcTotals.B, abcTotals.C], 
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], 
                    borderWidth: 0,
                    hoverOffset: 8
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { 
                    title: { display: true, text: 'Inventory Value by ABC (Click Slice)', color: chartTextColor } 
                }, 
                animation: { duration: 0 },
                onClick: (event, elements) => {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index;
                        const categories = ['A', 'B', 'C'];
                        openAbcSliceDrilldown(categories[index]);
                    }
                }
            }
        });
    }

    const canvasFsn = document.getElementById('chart-fsn');
    if (canvasFsn) {
        myChartFSN = new Chart(canvasFsn, {
            type: 'pie', 
            data: { 
                labels: ['Fast Moving', 'Slow Moving', 'Non-Moving'], 
                datasets: [{ 
                    data: [fsnTotals.F, fsnTotals.S, fsnTotals.N], 
                    backgroundColor: ['#3b82f6', '#f59e0b', '#94a3b8'], 
                    borderWidth: 0,
                    hoverOffset: 8
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { 
                    title: { display: true, text: 'Stock Units by FSN (Click Slice)', color: chartTextColor } 
                }, 
                animation: { duration: 0 },
                onClick: (event, elements) => {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index;
                        const fsnKeys = ['F', 'S', 'N'];
                        openFsnSliceDrilldown(fsnKeys[index]);
                    }
                }
            }
        });
    }
}


// ==========================================
// ====== CHART DRILLDOWN MODAL INSPECTOR ===
// ==========================================
let currentDrilldownList = [];

function openAbcSliceDrilldown(category) {
    const badgeText = `Class ${category}`;
    const desc = category === 'A' 
        ? "Top 70% of inventory value (High financial importance)" 
        : (category === 'B' ? "Intermediate 20% of value contribution" : "Bottom 10% of total inventory valuation");
    
    const items = lastAnalyticsAbcArray
        .filter(item => item.category === category)
        .map(item => ({
            name: item.name,
            qtySold: item.qtySold || 0,
            revenue: item.totalRevenue || 0,
            stock: item.stock || 0,
            value: item.value || 0,
            tag: `Class ${category}`,
            tagClass: category === 'A' ? 'bg-emerald-500/10 text-emerald-600' : (category === 'B' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600')
        }));

    launchDrilldownModal(badgeText, `ABC Segment: Category ${category} Products`, desc, items);
}

function openFsnSliceDrilldown(fsnCode) {
    const names = { F: 'Fast Moving', S: 'Slow Moving', N: 'Non-Moving' };
    const badgeText = names[fsnCode] || fsnCode;
    const desc = fsnCode === 'F' 
        ? "High velocity SKUs requiring regular replenishment" 
        : (fsnCode === 'S' ? "Moderate velocity items with steady demand" : "Dormant / zero movement stock tying up working capital");

    const items = lastAnalyticsMatrixRows
        .filter(row => row.FSN === fsnCode)
        .map(row => ({
            name: row.name,
            qtySold: row.qtySold || 0,
            revenue: row.rev || 0,
            stock: row.stock || 0,
            value: row.invValue || 0,
            tag: row.actClass || names[fsnCode],
            tagClass: fsnCode === 'F' ? 'bg-blue-500/10 text-primary' : (fsnCode === 'S' ? 'bg-amber-500/10 text-amber-600' : 'bg-slate-500/10 text-slate-500')
        }));

    launchDrilldownModal(badgeText, `FSN Velocity: ${names[fsnCode]} SKUs`, desc, items);
}

function launchDrilldownModal(badge, title, subtitle, items) {
    const modal = document.getElementById('chart-drilldown-modal');
    const panel = document.getElementById('chart-drilldown-panel');
    if (!modal || !panel) return;

    document.getElementById('drilldown-badge').innerText = badge;
    document.getElementById('drilldown-title').innerText = title;
    document.getElementById('drilldown-subtitle').innerText = subtitle;

    currentDrilldownList = items;
    const searchInput = document.getElementById('drilldown-search');
    if (searchInput) searchInput.value = '';

    renderDrilldownRows(items);

    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    panel.classList.remove('scale-95');
}

function renderDrilldownRows(items) {
    const tbody = document.getElementById('drilldown-tbody');
    const countEl = document.getElementById('drilldown-count');
    if (!tbody) return;

    if (countEl) countEl.innerText = `${items.length} SKUs listed`;

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400">No products match this slice query.</td></tr>`;
        return;
    }

    let html = '';
    items.forEach(i => {
        html += `
        <tr class="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors">
            <td class="py-3 px-5 font-semibold text-slate-900 dark:text-white">${i.name}</td>
            <td class="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">${Number(i.qtySold).toLocaleString('en-IN')}</td>
            <td class="py-3 px-4 text-right font-medium">₹${Number(i.revenue).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="py-3 px-4 text-right font-semibold">${Number(i.stock).toLocaleString('en-IN')}</td>
            <td class="py-3 px-4 text-right font-medium text-slate-600 dark:text-zinc-400">₹${Number(i.value).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="py-3 px-4 text-center">
                <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${i.tagClass}">${i.tag}</span>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

document.getElementById('drilldown-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = currentDrilldownList.filter(item => item.name.toLowerCase().includes(query));
    renderDrilldownRows(filtered);
});


// ==========================================
// ====== DUAL ENTRY MODES & SETTINGS =======
// ==========================================
let currentSaleMode = localStorage.getItem('pref_sale_mode') || 'unit'; 
let currentCosmeticMode = localStorage.getItem('pref_sale_mode') || 'unit';
let currentPurchaseMode = localStorage.getItem('pref_purchase_mode') || 'total';

function updatePillStyles(unitBtnId, totalBtnId, activeMode) {
    const btnUnit = document.getElementById(unitBtnId);
    const btnTotal = document.getElementById(totalBtnId);
    if (!btnUnit || !btnTotal) return;

    if (activeMode === 'unit') {
        btnUnit.className = "px-3 py-1 rounded-md text-white bg-primary shadow-sm font-bold text-xs transition-all";
        btnTotal.className = "px-3 py-1 rounded-md text-slate-500 dark:text-zinc-400 font-semibold text-xs hover:text-slate-800 dark:hover:text-white transition-all";
    } else {
        btnTotal.className = "px-3 py-1 rounded-md text-white bg-primary shadow-sm font-bold text-xs transition-all";
        btnUnit.className = "px-3 py-1 rounded-md text-slate-500 dark:text-zinc-400 font-semibold text-xs hover:text-slate-800 dark:hover:text-white transition-all";
    }
}

// 1. STANDARD SALE MODE & SYNC
function setSaleMode(mode) {
    currentSaleMode = mode;
    updatePillStyles('sale-mode-unit', 'sale-mode-total', mode);
}

document.getElementById('sale-mode-unit')?.addEventListener('click', () => setSaleMode('unit'));
document.getElementById('sale-mode-total')?.addEventListener('click', () => setSaleMode('total'));

const saleQtyInput = document.getElementById('sale-qty');
const saleRateInput = document.getElementById('sale-rate');
const saleFinalAmountInput = document.getElementById('sale-final-amount');

function syncSaleCalculations(origin) {
    const qty = parseFloat(saleQtyInput?.value) || 0;
    if (origin === 'rate' || (origin === 'qty' && currentSaleMode === 'unit')) {
        const rate = parseFloat(saleRateInput?.value) || 0;
        if (qty > 0 && rate >= 0) {
            saleFinalAmountInput.value = (qty * rate).toFixed(2);
        }
    } else if (origin === 'total' || (origin === 'qty' && currentSaleMode === 'total')) {
        const total = parseFloat(saleFinalAmountInput?.value) || 0;
        if (qty > 0) {
            saleRateInput.value = (total / qty).toFixed(2);
        }
    }
}

saleQtyInput?.addEventListener('input', () => syncSaleCalculations('qty'));
saleRateInput?.addEventListener('input', () => syncSaleCalculations('rate'));
saleFinalAmountInput?.addEventListener('input', () => syncSaleCalculations('total'));


// 2. COSMETIC SALE MODE & SYNC
function setCosmeticMode(mode) {
    currentCosmeticMode = mode;
    updatePillStyles('cosmetic-mode-unit', 'cosmetic-mode-total', mode);
}

document.getElementById('cosmetic-mode-unit')?.addEventListener('click', () => setCosmeticMode('unit'));
document.getElementById('cosmetic-mode-total')?.addEventListener('click', () => setCosmeticMode('total'));

const cosmeticQtyInput = document.getElementById('cosmetic-qty');
const cosmeticRateInput = document.getElementById('cosmetic-rate');
const cosmeticFinalAmountInput = document.getElementById('cosmetic-final-amount');

function syncCosmeticCalculations(origin) {
    const qty = parseFloat(cosmeticQtyInput?.value) || 0;
    if (origin === 'rate' || (origin === 'qty' && currentCosmeticMode === 'unit')) {
        const rate = parseFloat(cosmeticRateInput?.value) || 0;
        if (qty > 0 && rate >= 0) {
            cosmeticFinalAmountInput.value = (qty * rate).toFixed(2);
        }
    } else if (origin === 'total' || (origin === 'qty' && currentCosmeticMode === 'total')) {
        const total = parseFloat(cosmeticFinalAmountInput?.value) || 0;
        if (qty > 0) {
            cosmeticRateInput.value = (total / qty).toFixed(2);
        }
    }
}

cosmeticQtyInput?.addEventListener('input', () => syncCosmeticCalculations('qty'));
cosmeticRateInput?.addEventListener('input', () => syncCosmeticCalculations('rate'));
cosmeticFinalAmountInput?.addEventListener('input', () => syncCosmeticCalculations('total'));


// 3. PURCHASE MODE & SYNC
function setPurchaseMode(mode) {
    currentPurchaseMode = mode;
    updatePillStyles('purchase-mode-unit', 'purchase-mode-total', mode);
}

document.getElementById('purchase-mode-unit')?.addEventListener('click', () => setPurchaseMode('unit'));
document.getElementById('purchase-mode-total')?.addEventListener('click', () => setPurchaseMode('total'));

const purchaseQtyInput = document.getElementById('purchase-qty');
const purchaseRateInput = document.getElementById('purchase-rate');
const purchaseAmountInput = document.getElementById('purchase-amount');

function syncPurchaseCalculations(origin) {
    const qty = parseFloat(purchaseQtyInput?.value) || 0;
    if (origin === 'rate' || (origin === 'qty' && currentPurchaseMode === 'unit')) {
        const rate = parseFloat(purchaseRateInput?.value) || 0;
        if (qty > 0 && rate >= 0) {
            purchaseAmountInput.value = (qty * rate).toFixed(2);
        }
    } else if (origin === 'total' || (origin === 'qty' && currentPurchaseMode === 'total')) {
        const total = parseFloat(purchaseAmountInput?.value) || 0;
        if (qty > 0) {
            purchaseRateInput.value = (total / qty).toFixed(2);
        }
    }
}

purchaseQtyInput?.addEventListener('input', () => syncPurchaseCalculations('qty'));
purchaseRateInput?.addEventListener('input', () => syncPurchaseCalculations('rate'));
purchaseAmountInput?.addEventListener('input', () => syncPurchaseCalculations('total'));


// 4. SETTINGS CONFIGURATION LISTENER
const defaultSaleModeSelect = document.getElementById('setting-default-sale-mode');
const defaultPurchaseModeSelect = document.getElementById('setting-default-purchase-mode');

if (defaultSaleModeSelect) {
    defaultSaleModeSelect.value = currentSaleMode;
    defaultSaleModeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        localStorage.setItem('pref_sale_mode', val);
        setSaleMode(val);
        setCosmeticMode(val);
        showSuccessAnimation("Default Sales Mode Updated!");
    });
}

if (defaultPurchaseModeSelect) {
    defaultPurchaseModeSelect.value = currentPurchaseMode;
    defaultPurchaseModeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        localStorage.setItem('pref_purchase_mode', val);
        setPurchaseMode(val);
        showSuccessAnimation("Default Purchases Mode Updated!");
    });
}

// Initialize active pills based on configured defaults
setSaleMode(currentSaleMode);
setCosmeticMode(currentCosmeticMode);
setPurchaseMode(currentPurchaseMode);


// ==========================================
// ====== ADD SALES & PURCHASES FORMS =======
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
                <li class="flex justify-between items-center py-1.5 border-b border-slate-200 dark:border-zinc-700/80 last:border-0">
                    <span class="text-slate-800 dark:text-zinc-200">${cartItem.item} <b class="text-primary">(x${cartItem.qty})</b></span>
                    <span class="font-bold text-slate-900 dark:text-white">₹${cartItem.amount.toFixed(2)} 
                        <button type="button" onclick="window.removeCartItem(${index})" class="text-danger hover:text-red-700 ml-2.5 transition-colors"><i class="fa-solid fa-xmark"></i></button>
                    </span>
                </li>`;
        });
    }
    cartTotal.innerText = totalAmount.toFixed(2);
}

window.removeCartItem = function(index) {
    saleCart.splice(index, 1);
    updateCartUI();
};

document.getElementById('btn-add-to-cart')?.addEventListener('click', () => {
    const item = document.getElementById('sale-item').value.trim();
    const qtyStr = document.getElementById('sale-qty').value;
    let rateStr = document.getElementById('sale-rate').value;
    let amountStr = document.getElementById('sale-final-amount').value;

    let qty = parseFloat(qtyStr);
    let rate = parseFloat(rateStr);
    let amount = parseFloat(amountStr);

    if ((isNaN(rate) || rate === 0) && !isNaN(amount) && qty > 0) {
        rate = amount / qty;
    } else if (!isNaN(rate) && (isNaN(amount) || amount === 0) && qty > 0) {
        amount = qty * rate;
    }

    if (!item || isNaN(qty) || qty <= 0 || isNaN(amount) || amount < 0) {
        alert("Please enter a valid Item Name, Quantity, and either Selling Rate or Final Amount.");
        return;
    }

    const itemExists = allInventory.find(i => i.name === item);
    if (!itemExists) {
        alert("Invalid Item! Please select a valid item from the suggested list.");
        return;
    }

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
    document.getElementById('sale-final-amount').value = '';
    document.getElementById('sale-cost').value = '';
    
    updateCartUI();
});

// INSTANT MULTI-SALE SAVE
const saleForm = document.getElementById('form-sale');
saleForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const submitBtn = document.getElementById('btn-save-sale');
    if (submitBtn?.disabled) return;
    
    const pendingItem = document.getElementById('sale-item').value.trim();
    if (pendingItem) {
        document.getElementById('btn-add-to-cart').click();
    }

    if (saleCart.length === 0) {
        alert("No items in the list to sell!");
        return;
    }

    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

    try {
        const batch = writeBatch(db);
        const date = new Date().toISOString();

        for (let i = 0; i < saleCart.length; i++) {
            const cartItem = saleCart[i];

            const newTransRef = doc(collection(db, "transactions"));
            batch.set(newTransRef, { 
                type: "Sale", item: cartItem.item, qty: cartItem.qty, 
                rate: cartItem.rate, amount: cartItem.amount, date: date 
            });

            const localInvItem = allInventory.find(inv => inv.name === cartItem.item);
            if (localInvItem) {
                let newQty = Number(localInvItem.qty) - cartItem.qty;
                localInvItem.qty = newQty < 0 ? 0 : newQty;
                
                batch.update(doc(db, "inventory", localInvItem.id), { 
                    qty: localInvItem.qty,
                    ...(localInvItem.qty === 0 ? { zeroStockSince: new Date().toISOString() } : {})
                });
            }
        }

        await batch.commit(); 

        saleCart = [];
        updateCartUI();
        saleForm.reset();
        document.getElementById('sale-cost').value = '';
        document.getElementById('sale-final-amount').value = '';
        
        showSuccessAnimation("Standard Sale Recorded!");
        
    } catch (error) { 
        console.error(error); 
        alert("An error occurred while saving the sale.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
});

// COSMETIC SALE 
const cosmeticForm = document.getElementById('form-cosmetic');
cosmeticForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = cosmeticForm.querySelector('button[type="submit"]');
    if (submitBtn?.disabled) return;

    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

    const item = document.getElementById('cosmetic-item').value.trim() + " (Cosmetic)";
    let qty = parseFloat(document.getElementById('cosmetic-qty').value);
    let cost = parseFloat(document.getElementById('cosmetic-cost').value);
    let rate = parseFloat(document.getElementById('cosmetic-rate').value);
    let amount = parseFloat(document.getElementById('cosmetic-final-amount').value);

    if ((isNaN(rate) || rate === 0) && !isNaN(amount) && qty > 0) rate = amount / qty;
    if ((isNaN(amount) || amount === 0) && !isNaN(rate)) amount = qty * rate;

    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type: "Cosmetic Sale", item, qty, cost, rate, amount, date });
        cosmeticForm.reset();
        showSuccessAnimation("Cosmetic Sale Saved!");
    } catch (e) { 
        console.error(e);
        alert("Error saving cosmetic sale."); 
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
});

// INSTANT PURCHASE SAVE
const purchaseForm = document.getElementById('form-purchase');
purchaseForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = purchaseForm.querySelector('button[type="submit"]');
    if (submitBtn?.disabled) return;

    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

    const item = document.getElementById('purchase-item').value.trim();
    let qty = parseFloat(document.getElementById('purchase-qty').value);
    let rate = parseFloat(document.getElementById('purchase-rate').value);
    let amount = parseFloat(document.getElementById('purchase-amount').value);

    if ((isNaN(amount) || amount === 0) && !isNaN(rate) && qty > 0) {
        amount = qty * rate;
    }

    const date = new Date().toISOString();

    try {
        const batch = writeBatch(db);
        
        const transRef = doc(collection(db, "transactions"));
        batch.set(transRef, { type: "Purchase", item, qty, amount, date });

        const localInvItem = allInventory.find(i => i.name === item);
        if (localInvItem) {
            const newQty = Number(localInvItem.qty) + qty;
            batch.update(doc(db, "inventory", localInvItem.id), { 
                qty: newQty,
                ...(newQty > 0 ? { zeroStockSince: null } : {})
            });
        } else {
            const newInvRef = doc(collection(db, "inventory"));
            batch.set(newInvRef, { 
                name: item, 
                qty: qty, 
                price: qty > 0 ? (amount / qty) : 0,
                ...(qty === 0 ? { zeroStockSince: new Date().toISOString() } : { zeroStockSince: null })
            });
        }

        await batch.commit();

        purchaseForm.reset();
        showSuccessAnimation("Purchase Recorded!");
        
    } catch (e) { 
        console.error(e); 
        alert("Error saving purchase.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
});


// ==========================================
// ====== INTELLIGENT VELOCITY & INVENTORY ==
// ==========================================

/**
 * Calculates selling velocity (units/day) over recent 60-day window
 * and projects inventory runway (days of supply remaining).
 */
function getInventoryIntelligence() {
    const now = Date.now();
    const WINDOW_DAYS = 60;
    const windowStartMs = now - (WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const itemSalesInWindow = {};
    const itemLifetimeSales = {};

    allTransactions.forEach(t => {
        if (!t.item || !t.type.includes('Sale') || !t.date) return;
        const tTime = new Date(t.date).getTime();
        const qty = Number(t.qty) || 0;
        const netQty = t.type.includes('Return') ? -qty : qty;

        itemLifetimeSales[t.item] = (itemLifetimeSales[t.item] || 0) + netQty;

        if (tTime >= windowStartMs) {
            itemSalesInWindow[t.item] = (itemSalesInWindow[t.item] || 0) + netQty;
        }
    });

    const analyzed = allInventory.map(item => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        const stockValue = qty * price;

        const windowUnits = Math.max(0, itemSalesInWindow[item.name] || 0);
        const dailyVelocity = parseFloat((windowUnits / WINDOW_DAYS).toFixed(2));
        const lifetimeUnits = Math.max(0, itemLifetimeSales[item.name] || 0);

        let runwayDays = 0;
        if (dailyVelocity > 0) {
            runwayDays = Math.round(qty / dailyVelocity);
        } else {
            runwayDays = qty > 0 ? 999 : 0;
        }

        // HEALTH CLASSIFICATION:
        // 1. stockout: qty <= 0
        // 2. risk: runway <= 14 days OR (dailyVelocity > 0 && runway <= 21) OR (qty <= 3 && dailyVelocity > 0)
        // 3. overstock: (dailyVelocity > 0 && runwayDays >= 90) OR (qty >= 15 && dailyVelocity === 0 && lifetimeUnits === 0) OR (qty >= 25 && dailyVelocity <= 0.05)
        // 4. dead: qty > 0 && dailyVelocity === 0 && lifetimeUnits === 0 (or no activity)
        // 5. optimal: balanced steady runway (15 - 89 days)

        let healthCategory = 'optimal'; 
        let badgeHtml = '';

        if (qty <= 0) {
            healthCategory = 'out';
            badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 rounded-full whitespace-nowrap">
                <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Out of Stock
            </span>`;
        } else if (dailyVelocity > 0 && runwayDays <= 7) {
            healthCategory = 'risk';
            badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-black bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 rounded-full whitespace-nowrap shadow-sm">
                <span class="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span> Critical (${runwayDays}d left)
            </span>`;
        } else if (dailyVelocity > 0 && runwayDays <= 20) {
            healthCategory = 'risk';
            badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 rounded-full whitespace-nowrap">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Reorder (${runwayDays}d)
            </span>`;
        } else if (qty <= 3 && dailyVelocity === 0) {
            healthCategory = 'risk';
            badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 rounded-full whitespace-nowrap">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Low (${qty} left)
            </span>`;
        } else if ((dailyVelocity > 0 && runwayDays >= 90) || (qty >= 20 && dailyVelocity <= 0.05)) {
            healthCategory = 'overstock';
            const displayRunway = runwayDays >= 999 ? 'No movement' : `${runwayDays}d runway`;
            badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 rounded-full whitespace-nowrap">
                <i class="fa-solid fa-triangle-exclamation text-[10px]"></i> Overstock (${displayRunway})
            </span>`;
        } else if (qty >= 10 && dailyVelocity === 0 && lifetimeUnits === 0) {
            healthCategory = 'overstock';
            badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 rounded-full whitespace-nowrap">
                <i class="fa-solid fa-box-archive text-[10px]"></i> Dormant Capital (${qty})
            </span>`;
        } else {
            healthCategory = 'optimal';
            badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-full whitespace-nowrap">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Optimal (${runwayDays >= 999 ? 'Stable' : `${runwayDays}d`})
            </span>`;
        }

        return {
            ...item,
            qty,
            price,
            stockValue,
            dailyVelocity,
            runwayDays,
            healthCategory,
            badgeHtml
        };
    });

    return analyzed;
}

function updateInventoryStats() {
    const analyzed = getInventoryIntelligence();
    let totalItems = analyzed.length;
    let outCount = 0;
    let riskCount = 0;
    let overstockCount = 0;
    let totalValue = 0;

    analyzed.forEach(item => {
        totalValue += item.stockValue;
        if (item.healthCategory === 'out') outCount++;
        else if (item.healthCategory === 'risk') riskCount++;
        else if (item.healthCategory === 'overstock') overstockCount++;
    });

    if (document.getElementById('stat-inv-total')) {
        document.getElementById('stat-inv-total').innerText = totalItems;
        document.getElementById('stat-inv-value').innerText = `₹${totalValue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('stat-inv-out').innerText = outCount;
        document.getElementById('stat-inv-low').innerText = riskCount;
        if (document.getElementById('stat-inv-overstock')) {
            document.getElementById('stat-inv-overstock').innerText = overstockCount;
        }
    }
}

function renderInventoryTable() {
    const analyzed = getInventoryIntelligence();
    let rowsHtml = [];
    const query = currentInventorySearch.toLowerCase().trim();

    let filtered = analyzed.filter(item => {
        const itemName = (item.name || "").toLowerCase();
        
        if (query && !itemName.includes(query)) return false;
        
        if (currentInventoryFilter === 'out' && item.healthCategory !== 'out') return false;
        if (currentInventoryFilter === 'risk' && item.healthCategory !== 'risk') return false;
        if (currentInventoryFilter === 'overstock' && item.healthCategory !== 'overstock') return false;
        if (currentInventoryFilter === 'optimal' && item.healthCategory !== 'optimal') return false;
        
        return true;
    });

    filtered.forEach((item) => {
        const itemName = item.name || "Unknown";
        const itemQty = item.qty;
        const itemPrice = item.price;
        const stockValue = item.stockValue;

        const velocityStr = item.dailyVelocity > 0 ? `${item.dailyVelocity}/day` : `0/day`;
        let runwayStr = "";
        if (itemQty <= 0) runwayStr = `<span class="text-slate-400">0 days</span>`;
        else if (item.runwayDays >= 999) runwayStr = `<span class="text-slate-400">&infin; (No recent sales)</span>`;
        else if (item.runwayDays <= 7) runwayStr = `<span class="text-rose-600 dark:text-rose-400 font-bold">${item.runwayDays} days</span>`;
        else if (item.runwayDays <= 20) runwayStr = `<span class="text-amber-500 font-semibold">${item.runwayDays} days</span>`;
        else runwayStr = `<span class="text-slate-600 dark:text-zinc-300">${item.runwayDays} days</span>`;

        rowsHtml.push(`
        <tr class="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors">
            <td class="px-5 py-3">
                <div class="font-semibold text-slate-900 dark:text-white">${itemName}</div>
            </td>
            <td class="px-5 py-3 text-right font-bold text-slate-800 dark:text-zinc-100">${itemQty}</td>
            <td class="px-5 py-3 text-right font-medium text-slate-600 dark:text-zinc-400">${velocityStr}</td>
            <td class="px-5 py-3 text-right font-semibold">${runwayStr}</td>
            <td class="px-5 py-3 text-right">₹${itemPrice.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
            <td class="px-5 py-3 text-right text-slate-900 dark:text-white font-bold">₹${stockValue.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
            <td class="px-5 py-3 text-center">${item.badgeHtml}</td>
            <td class="px-5 py-3 text-right">
                <div class="flex justify-end gap-1.5">
                    <button class="btn-edit w-7 h-7 rounded-lg border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary transition-colors" data-id="${item.id}" data-name="${itemName}" data-qty="${itemQty}" data-price="${itemPrice}" title="Edit">
                        <i class="fa-solid fa-pen pointer-events-none text-[11px]"></i>
                    </button>
                    <button class="btn-delete w-7 h-7 rounded-lg border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-danger hover:border-red-200 dark:hover:bg-red-950/30 transition-colors" data-id="${item.id}" title="Delete">
                        <i class="fa-solid fa-xmark pointer-events-none text-xs"></i>
                    </button>
                </div>
            </td>
        </tr>`);
    });

    if (filtered.length === 0) {
        rowsHtml.push(`<tr><td colspan="8" class="px-5 py-10 text-center text-xs text-slate-400">No items found matching the selected filter criteria.</td></tr>`);
    }

    const tbody = document.querySelector('#table-inventory tbody');
    if (tbody) tbody.innerHTML = rowsHtml.join('');
}

document.getElementById('search-inventory')?.addEventListener('input', (e) => {
    currentInventorySearch = e.target.value;
    renderInventoryTable();
});

document.querySelectorAll('.inv-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.inv-tab').forEach(t => {
            t.classList.remove('active', 'bg-white', 'dark:bg-zinc-700', 'text-primary', 'shadow-sm');
            t.classList.add('text-slate-500', 'dark:text-zinc-400');
        });
        
        const activeBtn = e.target;
        activeBtn.classList.remove('text-slate-500', 'dark:text-zinc-400');
        activeBtn.classList.add('active', 'bg-white', 'dark:bg-zinc-700', 'text-primary', 'shadow-sm');
        
        currentInventoryFilter = activeBtn.getAttribute('data-filter');
        renderInventoryTable();
    });
});

const inventoryForm = document.getElementById('form-inventory');
inventoryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value.trim();
    let qty = parseFloat(document.getElementById('inv-qty').value);
    let price = parseFloat(document.getElementById('inv-price').value);
    
    if (isNaN(qty)) qty = 0; 
    if (isNaN(price)) price = 0;
    
    const editId = inventoryForm.getAttribute('data-edit-id'); 
    const zeroStockSince = (qty === 0) ? new Date().toISOString() : null;

    if (editId) { 
        await updateDoc(doc(db, "inventory", editId), { 
            name, 
            qty, 
            price,
            ...(qty === 0 ? { zeroStockSince } : { zeroStockSince: null })
        }); 
        resetInventoryForm(); 
        showSuccessAnimation("Item Updated!");
    } else { 
        await addDoc(collection(db, "inventory"), { 
            name, 
            qty, 
            price,
            ...(qty === 0 ? { zeroStockSince } : {})
        }); 
        inventoryForm.reset(); 
        showSuccessAnimation("Item Added to Stock!");
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
        if (confirm("Delete this item?")) {
            await deleteDoc(doc(db, "inventory", btnDel.getAttribute('data-id')));
        }
    }
    
    const btnEdit = e.target.closest('.btn-edit');
    if (btnEdit) {
        document.getElementById('inv-name').value = btnEdit.getAttribute('data-name');
        document.getElementById('inv-qty').value = btnEdit.getAttribute('data-qty');
        document.getElementById('inv-price').value = btnEdit.getAttribute('data-price');
        inventoryForm.setAttribute('data-edit-id', btnEdit.getAttribute('data-id'));
        
        document.getElementById('btn-inv-submit').innerText = "Update";
        document.getElementById('inv-form-title').innerText = `Edit item`;
        document.getElementById('btn-inv-cancel').style.display = "inline-block";
        
        document.getElementById('inv-name').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});


// ==========================================
// ====== AUTO-PURGE 6-MONTH DEAD STOCK =====
// ==========================================
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

async function purgeDeadStock(silent = false) {
    if (!allInventory || !allTransactions || allInventory.length === 0) return;

    const now = Date.now();
    const deadItemsToDelete = [];

    allInventory.forEach(inv => {
        const qty = Number(inv.qty) || 0;
        
        if (qty <= 0) {
            const itemTrans = allTransactions.filter(t => t.item === inv.name && t.date);

            if (itemTrans.length > 0) {
                const lastTransTime = Math.max(...itemTrans.map(t => new Date(t.date).getTime()));
                
                if ((now - lastTransTime) >= SIX_MONTHS_MS) {
                    deadItemsToDelete.push({
                        id: inv.id,
                        name: inv.name,
                        lastDate: new Date(lastTransTime).toLocaleDateString()
                    });
                }
            } else if (inv.zeroStockSince) {
                const zeroSince = new Date(inv.zeroStockSince).getTime();
                if ((now - zeroSince) >= SIX_MONTHS_MS) {
                    deadItemsToDelete.push({
                        id: inv.id,
                        name: inv.name,
                        lastDate: "No activity (>6m)"
                    });
                }
            }
        }
    });

    if (deadItemsToDelete.length === 0) {
        if (!silent) alert("No dead stock items older than 6 months were found. Your catalog is clean!");
        return;
    }

    if (!silent) {
        const itemNames = deadItemsToDelete.map(i => `• ${i.name} (Last active: ${i.lastDate})`).slice(0, 10).join("\n");
        const extraCount = deadItemsToDelete.length > 10 ? `\n...and ${deadItemsToDelete.length - 10} more` : "";
        const confirmed = confirm(`Found ${deadItemsToDelete.length} item(s) out of stock for > 6 months:\n\n${itemNames}${extraCount}\n\nDo you want to permanently delete these items from inventory?`);
        if (!confirmed) return;
    }

    try {
        const batch = writeBatch(db);
        deadItemsToDelete.forEach(item => {
            batch.delete(doc(db, "inventory", item.id));
        });
        await batch.commit();

        console.log(`[AutoPurge] Successfully removed ${deadItemsToDelete.length} dead stock items:`, deadItemsToDelete);
        showSuccessAnimation(`Purged ${deadItemsToDelete.length} Dead Stock Items!`);
    } catch (err) {
        console.error("Error purging dead stock:", err);
        if (!silent) alert("Failed to purge dead stock. Check console for details.");
    }
}


// ==========================================
// ====== SETTINGS & DATA MANAGEMENT ========
// ==========================================
document.getElementById('btn-purge-dead-stock')?.addEventListener('click', () => {
    purgeDeadStock(false);
});

document.getElementById('btn-trigger-excel')?.addEventListener('click', () => { 
    document.getElementById('excel-file').click(); 
});

document.getElementById('excel-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;

    if(!confirm("WARNING: This will DELETE all current inventory and replace it entirely with the data from the Excel file. Are you absolutely sure?")) {
        e.target.value = ''; return; 
    }

    const btn = document.getElementById('btn-trigger-excel');
    const ogText = btn.innerHTML; 
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-2xl"></i> <span class="text-xs font-bold">Importing...</span>`; 
    btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet);

            for (let item of allInventory) { await deleteDoc(doc(db, "inventory", item.id)); }

            for(const row of json) {
                const name = row['particulars'] || row['Particulars'] || row['Name'] || row['name'];
                const qtyStr = row['quantity'] || row['Quantity'] || row['qty'];
                const rateStr = row['rate'] || row['Rate'] || row['price'];

                if(name && name.trim() !== '') {
                    const qty = Number(qtyStr) || 0;
                    const price = Number(rateStr) || 0;
                    await addDoc(collection(db, "inventory"), { 
                        name: name.trim(), 
                        qty, 
                        price,
                        ...(qty === 0 ? { zeroStockSince: new Date().toISOString() } : {})
                    });
                }
            }
            
            showSuccessAnimation("Excel Successfully Imported!");
            
        } catch (error) {
            console.error(error); 
            alert("An error occurred during import. Check the console for details.");
        } finally {
            btn.innerHTML = ogText; 
            btn.disabled = false; 
            document.getElementById('excel-file').value = ''; 
        }
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById('btn-sync-drive')?.addEventListener('click', () => { 
    alert("Sync to Google Drive initiated."); 
});

document.getElementById('btn-merge-dup')?.addEventListener('click', async () => {
    if(!confirm("Are you sure you want to scan and merge identical items? (Quantities will be summed, Prices will be averaged.)")) return;
    const btn = document.getElementById('btn-merge-dup');
    const ogText = btn.innerHTML; 
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-2xl"></i> <span class="text-xs font-bold">Merging...</span>`; 
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
                let totalQty = 0; let totalPriceObj = 0;
                let mainId = itemsMap[key][0].id;
                
                itemsMap[key].forEach(i => {
                    let iQty = Number(i.qty) || 0; let iPrice = Number(i.price) || 0;
                    totalQty += iQty; totalPriceObj += (iQty * iPrice);
                });
                let avgPrice = totalQty > 0 ? (totalPriceObj / totalQty) : 0;
                await updateDoc(doc(db, "inventory", mainId), { 
                    qty: totalQty, 
                    price: avgPrice,
                    ...(totalQty > 0 ? { zeroStockSince: null } : { zeroStockSince: new Date().toISOString() })
                });
                
                for(let i = 1; i < itemsMap[key].length; i++) {
                    await deleteDoc(doc(db, "inventory", itemsMap[key][i].id));
                }
            }
        }
        if(mergeCount > 0) {
            showSuccessAnimation(`Merged ${mergeCount} Duplicate Groups!`);
        } else {
            alert("No duplicates found. Your inventory is clean!");
        }

    } catch (err) { 
        console.error(err); 
        alert("An error occurred during merge.");
    } finally { 
        btn.innerHTML = ogText; 
        btn.disabled = false; 
    }
});
