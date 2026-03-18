/**
 * SHOP MANAGER ERP - CORE APPLICATION ENGINE
 * Features: Multi-year JSON Sync, Duplicate Prevention, Offline Persistence, 
 * Optimized Analytics, and Real-time Inventory Management.
 */

// 1. FIREBASE SDK IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
    doc, deleteDoc, updateDoc, getDocs, where, writeBatch, enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 2. FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyBtY97ItVEcZ7srTcpIDUsXmqf1ZBlW2ZQ",
    authDomain: "store-manager-87634.firebaseapp.com",
    projectId: "store-manager-87634",
    storageBucket: "store-manager-87634.firebasestorage.app",
    messagingSenderId: "620672866976",
    appId: "1:620672866976:web:1ae1157027a2a0705f47c5"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- PERFORMANCE OPTIMIZATION: Offline Caching ---
// This enables the browser to store data locally so it loads instantly even with years of data.
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') console.warn("Persistence Warning: Multiple tabs open.");
    else if (err.code == 'unimplemented') console.warn("Persistence Error: Browser not supported.");
});

// 3. GLOBAL STATE MANAGEMENT
let unsubInventory = null;
let unsubTransactions = null;
let allTransactions = []; // Local cache of all history
let allInventory = [];    // Local cache of current stock
let isDataDirty = true;   // Flag to prevent redundant calculations
let lastAnalyticConfig = ""; 

// Chart JS Instances
let myChartMonthly = null;
let myChartABC = null;
let myChartFSN = null;

// Latest processed data for charts
let lastMonthlyData = {}; 
let lastAbcTotals = { A: 0, B: 0, C: 0 }; 
let lastFsnTotals = { F: 0, S: 0, N: 0 };

// 4. THEME LOGIC
const btnThemeToggle = document.getElementById('btn-theme-toggle');
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    btnThemeToggle.innerText = "Switch to Light Mode";
}

btnThemeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    btnThemeToggle.innerText = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    isDataDirty = true; 
    runAnalytics(); // Refresh chart colors for dark mode
});

// 5. AUTHENTICATION HANDLERS
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        startDatabaseListeners();
    } else {
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        stopDatabaseListeners();
    }
});

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const errDiv = document.getElementById('login-error');
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        errDiv.style.display = 'none';
        e.target.reset();
    } catch (error) {
        errDiv.style.display = 'block';
        errDiv.innerText = "Invalid Admin Credentials.";
    }
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// 6. NAVIGATION LOGIC
const tabs = ['dashboard', 'analytics', 'sales', 'purchases', 'inventory', 'settings', 'trans-history'];

tabs.forEach(tab => {
    document.getElementById(`btn-${tab}`).addEventListener('click', () => {

        // Deactivate all tabs and buttons
        tabs.forEach(t => {
            document.getElementById(`tab-${t}`).classList.remove('active');
            document.getElementById(`btn-${t}`).classList.remove('active');
        });

        // Activate selected tab and button
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.getElementById(`btn-${tab}`).classList.add('active');

        // LAG-FREE SWITCHING: Allow UI to render before running heavy logic
        if (tab === 'analytics') {
            requestAnimationFrame(() => {
                setTimeout(runAnalytics, 60);
            });
        }

        if (tab === 'trans-history') {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    // Set default date filter to Today
                    const today = new Date().toISOString().split('T')[0];
                    document.getElementById('filter-all-start').value = today;
                    document.getElementById('filter-all-end').value = today;
                    renderAllTransactionsTable();
                }, 60);
            });
        }

    });
});

// 7. REAL-TIME DATA LISTENERS ( Firestore )
function startDatabaseListeners() {
    // Inventory Stream
    unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => {
        allInventory = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            data.id = docSnap.id;
            allInventory.push(data);
        });
        updateInventoryUI();
        isDataDirty = true;
        if(document.getElementById('tab-analytics').classList.contains('active')) runAnalytics();
    });

    // Transaction Stream
    unsubTransactions = onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
        allTransactions = [];
        let totalSales = 0; 
        let totalPurchases = 0;
        
        snapshot.forEach((docSnap) => {
            const trans = docSnap.data();
            allTransactions.push(trans);
            const amt = Number(trans.amount) || 0;
            if(trans.type === 'Sale') totalSales += amt;
            else if (trans.type === 'Purchase') totalPurchases += amt;
        });

        // Update Dashboard Cards
        document.getElementById('dash-sales').innerText = `₹${totalSales.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        document.getElementById('dash-purchases').innerText = `₹${totalPurchases.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        
        renderSalesTable(); 
        renderPurchasesTable(); 
        isDataDirty = true;
        if(document.getElementById('tab-analytics').classList.contains('active')) runAnalytics();
    });
}

function stopDatabaseListeners() {
    if (unsubInventory) unsubInventory();
    if (unsubTransactions) unsubTransactions();
}

// UI HELPER: Update Inventory Tables and Search
function updateInventoryUI() {
    const tbody = document.querySelector('#table-inventory tbody');
    const datalist = document.getElementById('inventory-items-list');
    tbody.innerHTML = ''; 
    datalist.innerHTML = '';
    let totalItems = 0;

    allInventory.forEach(item => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        totalItems += qty;

        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${qty}</td>
                <td>₹${price.toFixed(2)}</td>
                <td>
                    <button class="btn-edit" data-id="${item.id}" data-name="${item.name}" data-qty="${qty}" data-price="${price}">Edit</button>
                    <button class="btn-delete" data-id="${item.id}">Delete</button>
                </td>
            </tr>`;
        datalist.innerHTML += `<option value="${item.name}"></option>`;
    });
    document.getElementById('dash-inventory').innerText = totalItems;
}

// 8. OPTIMIZED ANALYTICS ENGINE
function runAnalytics() {
    if(!document.getElementById('tab-analytics').classList.contains('active')) return;

    // Filter Config
    const startVal = document.getElementById('ana-start').value;
    const endVal = document.getElementById('ana-end').value;
    const classFilt = document.getElementById('ana-class-filter').value;
    const topFilt = document.getElementById('filter-top-selling').value;
    const invFilt = document.getElementById('filter-inv-status').value;

    const currentConfig = `${startVal}-${endVal}-${allTransactions.length}-${allInventory.length}-${classFilt}-${topFilt}-${invFilt}`;

    // PREVENT LAG: Only recalculate if data or filters changed
    if (lastAnalyticConfig === currentConfig && !isDataDirty) return;
    lastAnalyticConfig = currentConfig;
    isDataDirty = false;

    let startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
    let endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    let revenue = 0; 
    let cogs = 0; 
    let itemStats = new Map(); // Using Map for O(1) high-speed lookups
    let monthlyData = {};

    // Initialize stats from inventory
    allInventory.forEach(inv => {
        itemStats.set(inv.name, { stock: inv.qty, unitCost: inv.price, invValue: (inv.qty * inv.price), qtySold: 0, totalRevenue: 0 });
    });

    // Single pass calculation through all transactions
    for (let i = 0; i < allTransactions.length; i++) {
        const trans = allTransactions[i];
        const tDate = new Date(trans.date);
        
        if (startDate && tDate < startDate) continue;
        if (endDate && tDate > endDate) continue;

        if(trans.type === 'Sale') {
            revenue += trans.amount;
            
            // Graph Data Key
            const monthKey = trans.date.substring(0, 7); // Format: YYYY-MM
            if(!monthlyData[monthKey]) monthlyData[monthKey] = { sales: 0, profit: 0 };
            monthlyData[monthKey].sales += trans.amount;

            let stats = itemStats.get(trans.item);
            if(stats) {
                let cost = stats.unitCost * trans.qty;
                stats.qtySold += trans.qty;
                stats.totalRevenue += trans.amount;
                cogs += cost;
                monthlyData[monthKey].profit += (trans.amount - cost);
            }
        }
    }

    // Update Snapshot Cards
    document.getElementById('ana-revenue').innerText = `₹${revenue.toFixed(2)}`;
    document.getElementById('ana-profit').innerText = `₹${(revenue - cogs).toFixed(2)}`;
    document.getElementById('ana-margin').innerText = revenue > 0 ? `${(((revenue - cogs) / revenue) * 100).toFixed(1)}%` : "0%";
    document.getElementById('ana-stock').innerText = allInventory.reduce((a, b) => a + Number(b.qty || 0), 0);

    // --- ABC & FSN & Matrix Calculation ---
    const statsArray = Array.from(itemStats.entries()).sort((a,b) => b[1].invValue - a[1].invValue);
    let totalInvValue = Array.from(itemStats.values()).reduce((a,b) => a + b.invValue, 0);
    let cumValue = 0;
    
    lastAbcTotals = { A: 0, B: 0, C: 0 };
    lastFsnTotals = { F: 0, S: 0, N: 0 };
    
    const tbodyABC = document.querySelector('#table-abc tbody'); tbodyABC.innerHTML = '';
    const tbodyMatrix = document.querySelector('#table-matrix tbody'); tbodyMatrix.innerHTML = '';
    
    const maxQtySold = Math.max(...Array.from(itemStats.values()).map(i => i.qtySold), 1);
    const maxRev = Math.max(...Array.from(itemStats.values()).map(i => i.totalRevenue), 1);

    statsArray.forEach(([name, data]) => {
        // ABC Logic
        cumValue += data.invValue;
        let pct = totalInvValue > 0 ? cumValue / totalInvValue : 0;
        let category = pct <= 0.70 ? 'A' : (pct <= 0.90 ? 'B' : 'C');
        lastAbcTotals[category] += data.invValue;
        tbodyABC.innerHTML += `<tr><td>${name}</td><td>₹${data.invValue.toFixed(2)}</td><td>${(pct*100).toFixed(1)}%</td><td style="font-weight:bold;">${category}</td></tr>`;

        // FSN x HMV Matrix Logic
        let FSN = data.qtySold >= (maxQtySold * 0.5) ? 'F' : (data.qtySold > 0 ? 'S' : 'N');
        let HMV = data.totalRevenue >= (maxRev * 0.5) ? 'H' : (data.totalRevenue > 0 ? 'M' : 'V');
        lastFsnTotals[FSN] += data.stock;
        
        let actClass = getActionableClass(FSN, HMV);
        if(classFilt === "All" || actClass.includes(classFilt)) {
            tbodyMatrix.innerHTML += `<tr><td><b>${name}</b></td><td>${data.stock}</td><td>₹${data.invValue.toFixed(2)}</td><td>₹${data.totalRevenue.toFixed(2)}</td><td>${FSN}</td><td>${HMV}</td><td>${actClass}</td></tr>`;
        }
    });

    // Top Selling UI
    const tbodyTop = document.getElementById('tbody-top-selling'); 
    tbodyTop.innerHTML = '';
    let topSorted = Array.from(itemStats.entries()).sort((a,b) => b[1].qtySold - a[1].qtySold);
    if(topFilt === 'Top10') topSorted = topSorted.slice(0, 10);
    topSorted.forEach(([name, data]) => { 
        if(data.qtySold > 0 || topFilt === 'All') tbodyTop.innerHTML += `<tr><td>${name}</td><td>${data.qtySold}</td></tr>`; 
    });

    // Inventory Status UI
    const tbodyInv = document.getElementById('tbody-inv-status');
    tbodyInv.innerHTML = '';
    let invSorted = Array.from(itemStats.entries()).sort((a,b) => a[1].stock - b[1].stock);
    invSorted.forEach(([name, data]) => {
        if(invFilt === 'Low' && data.stock > 3) return;
        tbodyInv.innerHTML += `<tr><td>${name}</td><td style="color:${data.stock<=3?'#e74c3c':'inherit'}">${data.stock}</td></tr>`;
    });

    lastMonthlyData = monthlyData;
    renderCharts(monthlyData, lastAbcTotals, lastFsnTotals);
}

function getActionableClass(F, H) {
    if(F==='F' && H==='H') return "⭐ Stars";
    if(F==='S' && H==='H') return "💰 Cash Cows";
    if(F==='N' && H==='H') return "🔥 Dead Weight";
    if(F==='F' && H==='M') return "🚀 Drivers";
    if(F==='S' && H==='M') return "🐢 Slugs";
    if(F==='N' && H==='M') return "💤 Sleepers";
    if(F==='F' && H==='V') return "🏃 Runners";
    if(F==='S' && H==='V') return "📦 Basics";
    return "🗑️ Dead Stock";
}

function renderCharts(monthlyData, abc, fsn) {
    if(myChartMonthly) myChartMonthly.destroy();
    if(myChartABC) myChartABC.destroy();
    if(myChartFSN) myChartFSN.destroy();

    const isDark = document.body.classList.contains('dark-mode');
    const chartTextColor = isDark ? '#e0e0e0' : '#2c3e50';
    Chart.defaults.color = chartTextColor;

    const labelsMonth = Object.keys(monthlyData).sort();
    myChartMonthly = new Chart(document.getElementById('chart-monthly'), {
        type: 'bar',
        data: {
            labels: labelsMonth,
            datasets: [
                { label: 'Sales (₹)', data: labelsMonth.map(m => monthlyData[m].sales), backgroundColor: '#3498db' },
                { label: 'Profit (₹)', data: labelsMonth.map(m => monthlyData[m].profit), backgroundColor: '#2ecc71' }
            ]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Sales vs Profit Performance', color: chartTextColor } } }
    });

    myChartABC = new Chart(document.getElementById('chart-abc'), {
        type: 'doughnut',
        data: {
            labels: ['A (Top 70%)', 'B (Next 20%)', 'C (Last 10%)'],
            datasets: [{ data: [abc.A, abc.B, abc.C], backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'], borderWidth: 0 }]
        },
        options: { plugins: { title: { display: true, text: 'Value Analysis (ABC)', color: chartTextColor } } }
    });

    myChartFSN = new Chart(document.getElementById('chart-fsn'), {
        type: 'pie',
        data: {
            labels: ['Fast Moving', 'Slow Moving', 'Non-Moving'],
            datasets: [{ data: [fsn.F, fsn.S, fsn.N], backgroundColor: ['#3498db', '#e67e22', '#95a5a6'], borderWidth: 0 }]
        },
        options: { plugins: { title: { display: true, text: 'Movement Analysis (FSN)', color: chartTextColor } } }
    });
}

// 9. SALES TRANSACTIONS
const saleForm = document.getElementById('form-sale');
saleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('sale-item').value.trim();
    let qty = parseInt(document.getElementById('sale-qty').value);
    let amount = parseFloat(document.getElementById('sale-amount').value);
    
    try {
        await addDoc(collection(db, "transactions"), { type: "Sale", item, qty, amount, date: new Date().toISOString() });
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const snap = await getDocs(q);
        if (!snap.empty) {
            let invDoc = snap.docs[0];
            let newQty = Number(invDoc.data().qty) - qty;
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: newQty < 0 ? 0 : newQty });
        }
        saleForm.reset();
    } catch (err) { console.error(err); }
});

function renderSalesTable() {
    const tbody = document.querySelector('#table-sales tbody'); tbody.innerHTML = '';
    const startVal = document.getElementById('filter-sale-start').value;
    const endVal = document.getElementById('filter-sale-end').value;
    let sD = startVal ? new Date(startVal + 'T00:00:00') : null;
    let eD = endVal ? new Date(endVal + 'T23:59:59') : null;

    allTransactions.forEach(t => {
        if(t.type !== 'Sale') return;
        const tDate = new Date(t.date);
        if (sD && tDate < sD) return; if (eD && tDate > eD) return;
        tbody.innerHTML += `<tr><td>${tDate.toLocaleDateString()}</td><td>${t.item}</td><td>${t.qty}</td><td>₹${t.amount.toFixed(2)}</td></tr>`;
    });
}

// 10. PURCHASE TRANSACTIONS
const purchaseForm = document.getElementById('form-purchase');
purchaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('purchase-item').value.trim();
    let qty = parseInt(document.getElementById('purchase-qty').value);
    let amount = parseFloat(document.getElementById('purchase-amount').value);
    
    try {
        await addDoc(collection(db, "transactions"), { type: "Purchase", item, qty, amount, date: new Date().toISOString() });
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const snap = await getDocs(q);
        if (!snap.empty) {
            let invDoc = snap.docs[0];
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: (Number(invDoc.data().qty) + qty) });
        } else {
            await addDoc(collection(db, "inventory"), { name: item, qty: qty, price: (amount/qty) });
        }
        purchaseForm.reset();
    } catch (err) { console.error(err); }
});

function renderPurchasesTable() {
    const tbody = document.querySelector('#table-purchases tbody'); tbody.innerHTML = '';
    const startVal = document.getElementById('filter-purchase-start').value;
    const endVal = document.getElementById('filter-purchase-end').value;
    let sD = startVal ? new Date(startVal + 'T00:00:00') : null;
    let eD = endVal ? new Date(endVal + 'T23:59:59') : null;

    allTransactions.forEach(t => {
        if(t.type !== 'Purchase') return;
        const tDate = new Date(t.date);
        if (sD && tDate < sD) return; if (eD && tDate > eD) return;
        tbody.innerHTML += `<tr><td>${tDate.toLocaleDateString()}</td><td>${t.item}</td><td>${t.qty}</td><td>₹${t.amount.toFixed(2)}</td></tr>`;
    });
}

// 11. INVENTORY CRUD (Manual)
const inventoryForm = document.getElementById('form-inventory');
inventoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value.trim();
    const qty = parseInt(document.getElementById('inv-qty').value) || 0;
    const price = parseFloat(document.getElementById('inv-price').value) || 0;
    const editId = inventoryForm.getAttribute('data-edit-id');

    try {
        if(editId) {
            await updateDoc(doc(db, "inventory", editId), { name, qty, price });
            inventoryForm.removeAttribute('data-edit-id');
            document.getElementById('btn-inv-submit').innerText = "Add Item";
            document.getElementById('inv-form-title').innerText = "Add New Item";
        } else {
            await addDoc(collection(db, "inventory"), { name, qty, price });
        }
        inventoryForm.reset();
    } catch (err) { console.error(err); }
});

document.querySelector('#table-inventory tbody').addEventListener('click', async (e) => {
    const id = e.target.getAttribute('data-id');
    if (e.target.classList.contains('btn-delete')) {
        if(confirm("Are you sure you want to delete this item?")) await deleteDoc(doc(db, "inventory", id));
    }
    if (e.target.classList.contains('btn-edit')) {
        document.getElementById('inv-name').value = e.target.getAttribute('data-name');
        document.getElementById('inv-qty').value = e.target.getAttribute('data-qty');
        document.getElementById('inv-price').value = e.target.getAttribute('data-price');
        inventoryForm.setAttribute('data-edit-id', id);
        document.getElementById('btn-inv-submit').innerText = "Update Item";
        document.getElementById('inv-form-title').innerText = "Editing: " + e.target.getAttribute('data-name');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

// 12. SMART DATA IMPORT (JSON SYNC)
document.getElementById('btn-trigger-json').addEventListener('click', () => document.getElementById('json-file').click());

document.getElementById('json-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const btn = document.getElementById('btn-trigger-json');
    const ogText = btn.innerText;
    btn.innerText = "Syncing..."; btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            
            // Map existing data to skip duplicates
            const existingTransIds = new Set();
            allTransactions.forEach(t => { if(t.jsonId) existingTransIds.add(t.jsonId.toString()); });
            
            const invMap = new Map();
            allInventory.forEach(i => invMap.set(i.name.toLowerCase().trim(), i));

            let batch = writeBatch(db);
            let count = 0;
            let newInv = 0; let mergeInv = 0; let skippedTrans = 0;

            const commit = async () => { if(count > 0) { await batch.commit(); batch = writeBatch(db); count = 0; } };

            // A. Import Inventory
            if (data.inventory && Array.isArray(data.inventory)) {
                for (const item of data.inventory) {
                    const name = item.particulars.trim();
                    const key = name.toLowerCase();
                    if(invMap.has(key)) {
                        const existing = invMap.get(key);
                        batch.update(doc(db, "inventory", existing.id), { qty: (existing.qty + item.quantity), price: item.rate });
                        mergeInv++;
                    } else {
                        batch.set(doc(collection(db, "inventory")), { name, qty: item.quantity, price: item.rate });
                        newInv++;
                    }
                    if(++count >= 450) await commit();
                }
            }

            // B. Import Transactions
            if (data.transactions && Array.isArray(data.transactions)) {
                for (const t of data.transactions) {
                    if(existingTransIds.has(t.id.toString())) { skippedTrans++; continue; }
                    
                    for (const line of t.items) {
                        let amt = (t.type === 'Sale' ? line.sellingRate : line.rate) * line.quantity;
                        batch.set(doc(collection(db, "transactions")), {
                            jsonId: t.id.toString(),
                            type: t.type,
                            date: t.date,
                            item: line.particulars,
                            qty: line.quantity,
                            amount: amt,
                            saleType: t.saleType || "Cash",
                            partyName: t.partyName || null,
                            paidAmount: t.paidAmount !== undefined ? t.paidAmount : amt
                        });
                        if(++count >= 450) await commit();
                    }
                }
            }

            await commit();
            alert(`ERP Sync Finished!\n- New Items: ${newInv}\n- Merged Stock: ${mergeInv}\n- Skipped Duplicates: ${skippedTrans}`);
        } catch (err) { console.error(err); alert("Invalid JSON file structure."); }
        finally { btn.innerText = ogText; btn.disabled = false; e.target.value = ''; }
    };
    reader.readAsText(file);
});

// 13. EXCEL IMPORT (STOCK ONLY)
document.getElementById('btn-trigger-excel').addEventListener('click', () => document.getElementById('excel-file').click());

document.getElementById('excel-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if(!file) return;
    if(!confirm("Overwrite Inventory with this Excel file?")) return;

    const btn = document.getElementById('btn-trigger-excel');
    btn.innerText = "Importing..."; btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);

            for (let item of allInventory) { await deleteDoc(doc(db, "inventory", item.id)); }

            for(const row of json) {
                const name = row['particulars'] || row['Name'] || row['item'];
                if(name) {
                    await addDoc(collection(db, "inventory"), { 
                        name: name.trim(), 
                        qty: Number(row['quantity'] || row['qty'] || 0), 
                        price: Number(row['rate'] || row['price'] || 0) 
                    });
                }
            }
            alert("Inventory Overwritten successfully!");
        } catch (err) { alert("Excel Import Error."); }
        finally { btn.innerText = "Import Inventory Excel"; btn.disabled = false; e.target.value = ''; }
    };
    reader.readAsArrayBuffer(file);
});

// 14. DATA UTILITIES
document.getElementById('btn-merge-dup').addEventListener('click', async () => {
    if(!confirm("Merge duplicate inventory names?")) return;
    const btn = document.getElementById('btn-merge-dup'); btn.disabled = true;
    try {
        const map = new Map();
        allInventory.forEach(i => {
            const k = i.name.toLowerCase().trim();
            if(!map.has(k)) map.set(k, []);
            map.get(k).push(i);
        });

        for(const [name, items] of map) {
            if(items.length > 1) {
                let totalQty = items.reduce((a, b) => a + b.qty, 0);
                let avgPrice = items.reduce((a, b) => a + b.price, 0) / items.length;
                await updateDoc(doc(db, "inventory", items[0].id), { qty: totalQty, price: avgPrice });
                for(let i=1; i<items.length; i++) { await deleteDoc(doc(db, "inventory", items[i].id)); }
            }
        }
        alert("Duplicates merged.");
    } catch (err) { console.error(err); }
    finally { btn.disabled = false; }
});

// Extra Listeners for Date Filters
document.getElementById('btn-ana-filter').addEventListener('click', runAnalytics);
document.getElementById('btn-ana-clear').addEventListener('click', () => { 
    document.getElementById('ana-start').value = ''; 
    document.getElementById('ana-end').value = ''; 
    runAnalytics(); 
});
document.getElementById('btn-ana-today').addEventListener('click', () => {
    const d = new Date().toISOString().split('T')[0];
    document.getElementById('ana-start').value = d;
    document.getElementById('ana-end').value = d;
    runAnalytics();
});
document.getElementById('ana-class-filter').addEventListener('change', runAnalytics);
document.getElementById('filter-top-selling').addEventListener('change', runAnalytics);
document.getElementById('filter-inv-status').addEventListener('change', runAnalytics);
document.getElementById('btn-sale-filter').addEventListener('click', renderSalesTable);
document.getElementById('btn-purchase-filter').addEventListener('click', renderPurchasesTable);

// Initialization done. App ready.





// ==========================================
// ====== TRANSACTION HISTORY LOGIC =========
// ==========================================

// Listeners for the Filter Buttons
document.getElementById('btn-all-filter').addEventListener('click', renderAllTransactionsTable);
document.getElementById('btn-all-today').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('filter-all-start').value = today;
    document.getElementById('filter-all-end').value = today;
    renderAllTransactionsTable();
});

function renderAllTransactionsTable() {
    const tbody = document.getElementById('tbody-all-transactions');
    tbody.innerHTML = ''; // Clear table

    // Get filter dates
    const startVal = document.getElementById('filter-all-start').value;
    const endVal = document.getElementById('filter-all-end').value;
    
    // Optimization: If no date selected, show nothing to prevent lag
    if(!startVal || !endVal) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Please select a date range.</td></tr>';
        return;
    }

    const sD = new Date(startVal + 'T00:00:00');
    const eD = new Date(endVal + 'T23:59:59');

    let html = '';
    // Use a standard for-loop for maximum speed with large history
    for (let i = 0; i < allTransactions.length; i++) {
        const t = allTransactions[i];
        const tDate = new Date(t.date);

        // Date Filter Check
        if (tDate >= sD && tDate <= eD) {
            const typeColor = t.type === 'Sale' ? '#27ae60' : '#e74c3c';
            const displayDate = tDate.toLocaleDateString() + ' ' + tDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            html += `
                <tr>
                    <td>${displayDate}</td>
                    <td style="color: ${typeColor}; font-weight: bold;">${t.type}</td>
                    <td>${t.item || "Unknown"}</td>
                    <td>${t.qty}</td>
                    <td>₹${Number(t.amount).toFixed(2)}</td>
                </tr>`;
        }
    }

    if(html === '') {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found for this date.</td></tr>';
    } else {
        tbody.innerHTML = html;
    }
}
