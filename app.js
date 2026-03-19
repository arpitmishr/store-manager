// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, getDocs, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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

let unsubInventory = null;
let unsubTransactions = null;
let allTransactions =[];
let allInventory =[]; 

let myChartMonthly = null;
let myChartABC = null;
let myChartFSN = null;

// Set Transaction Filter Dates to Today
const todayStr = new Date().toISOString().split('T')[0];
document.getElementById('filter-trans-start').value = todayStr;
document.getElementById('filter-trans-end').value = todayStr;

// ----- THEME LOGIC -----
const btnThemeToggle = document.getElementById('btn-theme-toggle');
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    btnThemeToggle.innerText = "Switch to Light Mode";
}
btnThemeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    btnThemeToggle.innerText = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if(myChartMonthly) renderCharts(lastMonthlyData, lastAbcTotals, lastFsnTotals);
});

// ----- AUTHENTICATION LOGIC -----
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
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
        document.getElementById('login-error').style.display = 'none';
        document.getElementById('form-login').reset();
    } catch (error) {
        document.getElementById('login-error').style.display = 'block';
        document.getElementById('login-error').innerText = "Error: Invalid Credentials.";
    }
});
document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// ----- TAB NAVIGATION -----
const tabs =['dashboard', 'transactions', 'analytics', 'sales', 'purchases', 'inventory', 'settings'];
tabs.forEach(tab => {
    document.getElementById(`btn-${tab}`).addEventListener('click', () => {
        tabs.forEach(t => {
            document.getElementById(`tab-${t}`).classList.remove('active');
            document.getElementById(`btn-${t}`).classList.remove('active');
        });
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.getElementById(`btn-${tab}`).classList.add('active');
        if(tab === 'analytics') setTimeout(runAnalytics, 10); 
    });
});

// ----- DATABASE LISTENERS -----
function startDatabaseListeners() {
    unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => {
        let totalItems = 0;
        allInventory =[];
        
        let rowsHtml =[];
        let dataListHtml =[];
        let selectHtml =['<option value="">-- Select Item --</option>'];

        snapshot.forEach((docSnap) => {
            const item = docSnap.data();
            item.id = docSnap.id;
            allInventory.push(item);

            const itemName = item.name || "Unknown";
            const itemQty = Number(item.qty) || 0;
            const itemPrice = Number(item.price) || 0;

            totalItems += itemQty;
            rowsHtml.push(`<tr><td>${itemName}</td><td>${itemQty}</td><td>₹${itemPrice.toFixed(2)}</td>
                <td><button class="btn-edit" style="background:#f39c12; color:white; border:none; padding:5px; cursor:pointer;" data-id="${item.id}" data-name="${itemName}" data-qty="${itemQty}" data-price="${itemPrice}">Edit</button>
                <button class="btn-delete" style="background:#e74c3c; color:white; border:none; padding:5px; cursor:pointer;" data-id="${item.id}">Delete</button></td></tr>`);
            
            dataListHtml.push(`<option value="${itemName}"></option>`);
            selectHtml.push(`<option value="${itemName}" data-price="${itemPrice}">${itemName} (Stock: ${itemQty})</option>`);
        });

        document.querySelector('#table-inventory tbody').innerHTML = rowsHtml.join('');
        document.getElementById('inventory-items-list').innerHTML = dataListHtml.join('');
        document.getElementById('sale-item').innerHTML = selectHtml.join('');
        document.getElementById('dash-inventory').innerText = totalItems;
        
        if (document.getElementById('tab-analytics').classList.contains('active')) runAnalytics();
        updateDashboardMetrics();
    });

    unsubTransactions = onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
        allTransactions =[];
        let totalSales = 0; let totalPurchases = 0;

        snapshot.forEach((docSnap) => {
            const trans = docSnap.data();
            trans.id = docSnap.id; 
            allTransactions.push(trans);
            
            const tAmount = Number(trans.amount) || 0;
            if(trans.type === 'Sale' || trans.type === 'Cosmetic Sale') totalSales += tAmount;
            else if (trans.type === 'Sale Return' || trans.type === 'Cosmetic Return') totalSales -= tAmount;
            else if (trans.type === 'Purchase') totalPurchases += tAmount;
            else if (trans.type === 'Purchase Return') totalPurchases -= tAmount; 
        });

        document.getElementById('dash-sales').innerText = `₹${totalSales.toFixed(2)}`;
        document.getElementById('dash-purchases').innerText = `₹${totalPurchases.toFixed(2)}`;
        
        renderTransactionsTable();
      // --> ADD THESE LINES HERE inside the snapshot listener <--
        updateDashboardMonths(allTransactions);
        renderDashboardTopItems();
        if (document.getElementById('tab-analytics').classList.contains('active')) runAnalytics();
    });
}

function stopDatabaseListeners() {
    if (unsubInventory) unsubInventory();
    if (unsubTransactions) unsubTransactions();
}


// ==========================================
// ====== TRANSACTIONS & RETURNS LOGIC ======
// ==========================================

document.getElementById('btn-trans-filter').addEventListener('click', renderTransactionsTable);
document.getElementById('btn-trans-clear').addEventListener('click', () => { 
    document.getElementById('filter-trans-start').value = ''; 
    document.getElementById('filter-trans-end').value = ''; 
    renderTransactionsTable(); 
});

function renderTransactionsTable() {
    const startVal = document.getElementById('filter-trans-start').value; 
    const endVal = document.getElementById('filter-trans-end').value;
    let sD = startVal ? new Date(startVal + 'T00:00:00') : null; 
    let eD = endVal ? new Date(endVal + 'T23:59:59') : null;

    let html =[];
    allTransactions.forEach((t) => {
        const tDate = new Date(t.date);
        if (sD && tDate < sD) return; 
        if (eD && tDate > eD) return;
        
        let tColor = t.type.includes('Sale') ? (t.type.includes('Cosmetic') ? '#e17055' : '#27ae60') : (t.type.includes('Purchase') ? '#e74c3c' : '#f39c12');
        let actionBtn = (t.type === 'Sale' || t.type === 'Purchase' || t.type === 'Cosmetic Sale') 
            ? `<button class="btn-return" style="background:#f39c12; color:white; border:none; padding:5px 10px; cursor:pointer;" data-id="${t.id}">Return</button>`
            : `<span style="color:#7f8c8d; font-size:12px;">Returned</span>`;
        
        html.push(`<tr>
            <td>${tDate.toLocaleDateString()}</td>
            <td style="color:${tColor}; font-weight:bold;">${t.type}</td>
            <td>${t.item || "Unknown"}</td>
            <td>${Number(t.qty) || 0}</td>
            <td>₹${(Number(t.amount) || 0).toFixed(2)}</td>
            <td>${actionBtn}</td>
        </tr>`);
    });
    document.querySelector('#table-transactions tbody').innerHTML = html.join('');
}

document.querySelector('#table-transactions tbody').addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-return')) {
        const id = e.target.getAttribute('data-id');
        const t = allTransactions.find(x => x.id === id);
        if (!t) return;

        let returnQtyStr = prompt(`How many '${t.item}' do you want to return?\n(Original Quantity: ${t.qty})`, t.qty);
        if (returnQtyStr === null) return; 
        
        let returnQty = parseInt(returnQtyStr);
        if (isNaN(returnQty) || returnQty <= 0 || returnQty > t.qty) {
            alert(`Invalid quantity! Must be between 1 and ${t.qty}`);
            return;
        }

        let returnAmount = (t.amount / t.qty) * returnQty;
        let newType = t.type === 'Sale' ? 'Sale Return' : (t.type === 'Purchase' ? 'Purchase Return' : 'Cosmetic Return');

        try {
            // Log Return Transaction
            let returnPayload = { type: newType, item: t.item, qty: returnQty, amount: returnAmount, date: new Date().toISOString() };
            if (t.type === 'Cosmetic Sale') returnPayload.cost = t.cost; // save cost for correct profit deduction
            
            await addDoc(collection(db, "transactions"), returnPayload);
            
            // Adjust Inventory ONLY IF it is not a Cosmetic Sale
            if (t.type !== 'Cosmetic Sale') {
                const q = query(collection(db, "inventory"), where("name", "==", t.item));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const invDoc = querySnapshot.docs[0];
                    let currentStock = Number(invDoc.data().qty);
                    let newStock = currentStock;

                    if (t.type === 'Sale') newStock += returnQty; 
                    else if (t.type === 'Purchase') newStock -= returnQty; 
                    
                    if(newStock < 0) newStock = 0;
                    await updateDoc(doc(db, "inventory", invDoc.id), { qty: newStock });
                }
            }
            alert("Return processed successfully!");
        } catch (err) {
            console.error(err);
            alert("Error processing the return.");
        }
    }
});










// ==========================================
// ====== DASHBOARD WIDGETS LOGIC ===========
// ==========================================

const dashMonthSelect = document.getElementById('dash-top-month');
const dashTypeSelect = document.getElementById('dash-top-type');

// Listeners to re-render the list when dropdowns change
dashMonthSelect.addEventListener('change', renderDashboardTopItems);
dashTypeSelect.addEventListener('change', renderDashboardTopItems);

function renderDashboardTopItems() {
    const selectedMonth = dashMonthSelect.value;
    const selectedType = dashTypeSelect.value;
    const listContainer = document.getElementById('dash-top-list');
    
    let itemSalesMap = {};

    // 1. Filter and Calculate Sales
    allTransactions.forEach(t => {
        // Only process Sales
        if (!t.type.includes('Sale')) return;

        // Apply Type Filter
        if (selectedType !== 'All' && t.type !== selectedType) return;

        // Apply Month Filter
        const tDate = new Date(t.date);
        const monthKey = tDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        if (selectedMonth !== 'All' && monthKey !== selectedMonth) return;

        // Add or Subtract Quantities (Net Sold)
        if (!itemSalesMap[t.item]) itemSalesMap[t.item] = 0;
        
        if (t.type === 'Sale' || t.type === 'Cosmetic Sale') {
            itemSalesMap[t.item] += Number(t.qty);
        } else if (t.type === 'Sale Return' || t.type === 'Cosmetic Return') {
            itemSalesMap[t.item] -= Number(t.qty);
        }
    });

    // 2. Convert to Array and Sort by Top Selling
    let sortedItems = Object.keys(itemSalesMap)
        .map(itemName => ({ name: itemName, sold: itemSalesMap[itemName] }))
        .filter(item => item.sold > 0) // Only show items with positive sales
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 10); // Show Top 10

    // 3. Render the UI List
    listContainer.innerHTML = '';
    if (sortedItems.length === 0) {
        listContainer.innerHTML = `<li style="text-align:center; padding: 20px; color: #95a5a6;">No sales found for this filter.</li>`;
        return;
    }

    let rank = 1;
    sortedItems.forEach(item => {
        let rankColor = rank === 1 ? '#f1c40f' : (rank === 2 ? '#bdc3c7' : (rank === 3 ? '#cd7f32' : '#7f8c8d'));
        let rankIcon = rank <= 3 ? `🏆` : `<span style="display:inline-block; width:20px; text-align:center; color:#fff; background:${rankColor}; border-radius:50%; font-size:12px; line-height:20px;">${rank}</span>`;
        
        listContainer.innerHTML += `
            <li style="display: flex; justify-content: space-between; align-items: center; padding: 12px 10px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                <div style="font-size: 14px;">
                    <span style="margin-right: 10px;">${rankIcon}</span>
                    <span style="font-weight: bold;">${item.name}</span>
                </div>
                <div style="font-size: 13px; font-weight: bold; color: #27ae60; background: rgba(39, 174, 96, 0.1); padding: 4px 8px; border-radius: 4px;">
                    ${item.sold} sold
                </div>
            </li>
        `;
        rank++;
    });
}










// ==========================================
// ====== ADVANCED ANALYTICS ENGINE =========
// ==========================================

document.getElementById('btn-ana-filter').addEventListener('click', runAnalytics);
document.getElementById('btn-ana-clear').addEventListener('click', () => {
    document.getElementById('ana-start').value = ''; document.getElementById('ana-end').value = ''; runAnalytics();
});
document.getElementById('btn-ana-today').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ana-start').value = today; document.getElementById('ana-end').value = today; runAnalytics();
});
document.getElementById('ana-class-filter').addEventListener('change', runAnalytics);
document.getElementById('filter-top-selling').addEventListener('change', runAnalytics);
document.getElementById('filter-inv-status').addEventListener('change', runAnalytics);

let lastMonthlyData = {}; let lastAbcTotals = {}; let lastFsnTotals = {};

function runAnalytics() {
    if(!document.getElementById('tab-analytics').classList.contains('active')) return;

    const startVal = document.getElementById('ana-start').value; const endVal = document.getElementById('ana-end').value;
    let startDate = startVal ? new Date(startVal + 'T00:00:00') : null; let endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    let revenue = 0; let cogs = 0; 
    let itemStats = {}; 
    let monthlyData = {};

    allInventory.forEach(inv => {
        itemStats[inv.name] = { stock: inv.qty, unitCost: inv.price, invValue: (inv.qty * inv.price), qtySold: 0, totalRevenue: 0 };
    });

    allTransactions.forEach(trans => {
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
            cogs -= cost; monthlyData[monthKey].profit -= (trans.amount - cost);
        } else if (trans.type === 'Cosmetic Return') {
            revenue -= trans.amount; monthlyData[monthKey].sales -= trans.amount;
            let cost = (trans.cost || 0) * trans.qty;
            cogs -= cost; monthlyData[monthKey].profit -= (trans.amount - cost);
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
        totalInvValue += data.invValue; abcArray.push({ name, value: data.invValue });
    }
    abcArray.sort((a,b) => b.value - a.value);
    
    let cumValue = 0; let abcTotals = { A: 0, B: 0, C: 0 }; let abcHtml =[];
    abcArray.forEach(item => {
        cumValue += item.value; let pct = totalInvValue > 0 ? cumValue / totalInvValue : 0; let category = 'C';
        if(pct <= 0.70) { abcTotals.A += item.value; category = 'A'; }
        else if (pct <= 0.90) { abcTotals.B += item.value; category = 'B'; }
        else { abcTotals.C += item.value; category = 'C'; }
        let catColor = category === 'A' ? '#2ecc71' : (category === 'B' ? '#f1c40f' : '#e74c3c');
        abcHtml.push(`<tr><td>${item.name}</td><td>₹${item.value.toFixed(2)}</td><td>${(pct * 100).toFixed(1)}%</td><td style="color:${catColor}; font-weight:bold;">${category}</td></tr>`);
    });
    document.querySelector('#table-abc tbody').innerHTML = abcHtml.join('');

    const filterTop = document.getElementById('filter-top-selling').value; let topHtml =[];
    let sortedTop = Object.keys(itemStats).map(k => ({name: k, sold: itemStats[k].qtySold})).sort((a,b) => b.sold - a.sold);
    if(filterTop === 'Top10') sortedTop = sortedTop.slice(0, 10);
    sortedTop.forEach(item => { if(item.sold > 0 || filterTop === 'All') topHtml.push(`<tr><td>${item.name}</td><td>${item.sold}</td></tr>`); });
    document.getElementById('tbody-top-selling').innerHTML = topHtml.join('');

    const filterInv = document.getElementById('filter-inv-status').value; let invHtml =[];
    let sortedInv = Object.keys(itemStats).map(k => ({name: k, stock: itemStats[k].stock})).sort((a,b) => a.stock - b.stock);
    sortedInv.forEach(item => {
        if (filterInv === 'Low' && item.stock > 3) return; 
        invHtml.push(`<tr><td>${item.name}</td><td style="color: ${item.stock <= 3 ? '#e74c3c' : 'inherit'}; font-weight: ${item.stock <= 3 ? 'bold' : 'normal'};">${item.stock}</td></tr>`);
    });
    document.getElementById('tbody-inv-status').innerHTML = invHtml.join('');

    let fsnTotals = { F: 0, S: 0, N: 0 }; let matrixRows =[];
    let maxQtySold = Math.max(...Object.values(itemStats).map(i => i.qtySold), 0);
    let maxRev = Math.max(...Object.values(itemStats).map(i => i.totalRevenue), 0);

    for (const[name, data] of Object.entries(itemStats)) {
        let FSN = 'N'; if (data.qtySold > 0) FSN = data.qtySold >= (maxQtySold * 0.5) ? 'F' : 'S'; 
        fsnTotals[FSN] += data.stock;
        let HMV = 'V'; if (data.totalRevenue > 0) HMV = data.totalRevenue >= (maxRev * 0.5) ? 'H' : 'M'; 
        let actClass = "";
        if(FSN==='F' && HMV==='H') actClass = "⭐ Stars"; else if(FSN==='S' && HMV==='H') actClass = "💰 Cash Cows";
        else if(FSN==='N' && HMV==='H') actClass = "🔥 Dead Weight"; else if(FSN==='F' && HMV==='M') actClass = "🚀 Drivers";
        else if(FSN==='S' && HMV==='M') actClass = "🐢 Slugs"; else if(FSN==='N' && HMV==='M') actClass = "💤 Sleepers";
        else if(FSN==='F' && HMV==='V') actClass = "🏃 Runners"; else if(FSN==='S' && HMV==='V') actClass = "📦 Basics";
        else if(FSN==='N' && HMV==='V') actClass = "🗑️ Dead Stock";
        matrixRows.push({ name, stock: data.stock, invValue: data.invValue, rev: data.totalRevenue, FSN, HMV, actClass });
    }

    const filterClass = document.getElementById('ana-class-filter').value; let matrixHtml =[];
    matrixRows.sort((a,b) => b.rev - a.rev).forEach(row => {
        if(filterClass !== "All" && !row.actClass.includes(filterClass)) return;
        let fsnColor = row.FSN==='F'?'#27ae60':(row.FSN==='S'?'#f39c12':'#e74c3c');
        let hmvColor = row.HMV==='H'?'#2980b9':(row.HMV==='M'?'#8e44ad':'#7f8c8d');
        matrixHtml.push(`<tr><td><b>${row.name}</b></td><td>${row.stock}</td><td>₹${row.invValue.toFixed(2)}</td><td>₹${row.rev.toFixed(2)}</td><td style="color:${fsnColor}; font-weight:bold;">${row.FSN}</td><td style="color:${hmvColor}; font-weight:bold;">${row.HMV}</td><td>${row.actClass}</td></tr>`);
    });
    document.querySelector('#table-matrix tbody').innerHTML = matrixHtml.join('');

    lastMonthlyData = monthlyData; lastAbcTotals = abcTotals; lastFsnTotals = fsnTotals;
    renderCharts(monthlyData, abcTotals, fsnTotals);
}

function renderCharts(monthlyData, abcTotals, fsnTotals) {
    if(myChartMonthly) myChartMonthly.destroy(); if(myChartABC) myChartABC.destroy(); if(myChartFSN) myChartFSN.destroy();
    const labelsMonth = Object.keys(monthlyData).reverse();
    const dataSales = labelsMonth.map(m => monthlyData[m].sales);
    const dataProfit = labelsMonth.map(m => monthlyData[m].profit);
    const isDark = document.body.classList.contains('dark-mode');
    const chartTextColor = isDark ? '#e0e0e0' : '#2c3e50';
    Chart.defaults.color = chartTextColor;

    myChartMonthly = new Chart(document.getElementById('chart-monthly'), {
        type: 'bar', data: { labels: labelsMonth.length ? labelsMonth : ["No Data"], datasets:[{ label: 'Sales (₹)', data: dataSales, backgroundColor: '#3498db' }, { label: 'Profit (₹)', data: dataProfit, backgroundColor: '#2ecc71' }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Monthly Sales vs Profit', color: chartTextColor } }, animation: { duration: 0 } }
    });
    myChartABC = new Chart(document.getElementById('chart-abc'), {
        type: 'doughnut', data: { labels:['A (Top Value)', 'B (Medium)', 'C (Low)'], datasets:[{ data:[abcTotals.A, abcTotals.B, abcTotals.C], backgroundColor:['#2ecc71', '#f1c40f', '#e74c3c'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Inventory Value by ABC', color: chartTextColor } }, animation: { duration: 0 } }
    });
    myChartFSN = new Chart(document.getElementById('chart-fsn'), {
        type: 'pie', data: { labels:['Fast Moving', 'Slow Moving', 'Non-Moving'], datasets:[{ data:[fsnTotals.F, fsnTotals.S, fsnTotals.N], backgroundColor:['#3498db', '#e67e22', '#95a5a6'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Stock Units by FSN', color: chartTextColor } }, animation: { duration: 0 } }
    });
}

// ==========================================
// ====== ADD SALES & PURCHASES FORMS =======
// ==========================================

// Auto-fill cost price when standard sale item is selected
document.getElementById('sale-item').addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    if (selectedOption && selectedOption.value) {
        document.getElementById('sale-cost').value = selectedOption.getAttribute('data-price');
    } else {
        document.getElementById('sale-cost').value = '';
    }
});

// Standard Inventory Sale Submission
const saleForm = document.getElementById('form-sale');
saleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('sale-item').value;
    let qty = parseInt(document.getElementById('sale-qty').value);
    let rate = parseFloat(document.getElementById('sale-rate').value); // Set by user per piece
    let amount = qty * rate; // Calculated Total
    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type: "Sale", item, qty, rate, amount, date });
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const invDoc = querySnapshot.docs[0];
            let newQty = Number(invDoc.data().qty) - qty;
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: newQty < 0 ? 0 : newQty });
        }
        saleForm.reset();
        document.getElementById('sale-cost').value = '';
        alert("Standard Sale successfully saved! Inventory adjusted.");
    } catch (e) { console.error(e); }
});

// Cosmetic Item Sale Submission
const cosmeticForm = document.getElementById('form-cosmetic');
cosmeticForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('cosmetic-item').value.trim() + " (Cosmetic)";
    let qty = parseInt(document.getElementById('cosmetic-qty').value);
    let cost = parseFloat(document.getElementById('cosmetic-cost').value);
    let rate = parseFloat(document.getElementById('cosmetic-rate').value);
    let amount = qty * rate; // Calculated Total
    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type: "Cosmetic Sale", item, qty, cost, rate, amount, date });
        cosmeticForm.reset();
        alert("Cosmetic Sale successfully saved! Revenue tracked (No stock deducted).");
    } catch (e) { console.error(e); }
});

// Purchase Form
const purchaseForm = document.getElementById('form-purchase');
purchaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('purchase-item').value.trim();
    let qty = parseInt(document.getElementById('purchase-qty').value);
    let amount = parseFloat(document.getElementById('purchase-amount').value);
    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type: "Purchase", item, qty, amount, date });
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const invDoc = querySnapshot.docs[0];
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: Number(invDoc.data().qty) + qty });
        } else {
            await addDoc(collection(db, "inventory"), { name: item, qty: qty, price: qty>0?(amount/qty):0 });
        }
        purchaseForm.reset();
        alert("Purchase successfully saved!");
    } catch (e) { console.error(e); }
});

// ----- INVENTORY ADD/EDIT/DELETE -----
const inventoryForm = document.getElementById('form-inventory');
inventoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value.trim();
    let qty = parseInt(document.getElementById('inv-qty').value); let price = parseFloat(document.getElementById('inv-price').value);
    if (isNaN(qty)) qty = 0; if (isNaN(price)) price = 0;
    const editId = inventoryForm.getAttribute('data-edit-id'); 

    if (editId) { await updateDoc(doc(db, "inventory", editId), { name, qty, price }); resetInventoryForm(); } 
    else { await addDoc(collection(db, "inventory"), { name, qty, price }); inventoryForm.reset(); }
});

document.getElementById('btn-inv-cancel').addEventListener('click', resetInventoryForm);
function resetInventoryForm() {
    inventoryForm.reset(); inventoryForm.removeAttribute('data-edit-id');
    document.getElementById('btn-inv-submit').innerText = "Add Item";
    document.getElementById('inv-form-title').innerText = "Add New Item";
    document.getElementById('btn-inv-cancel').style.display = "none";
}

document.querySelector('#table-inventory tbody').addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-delete')) if (confirm("Delete this item?")) await deleteDoc(doc(db, "inventory", e.target.getAttribute('data-id')));
    if (e.target.classList.contains('btn-edit')) {
        document.getElementById('inv-name').value = e.target.getAttribute('data-name');
        document.getElementById('inv-qty').value = e.target.getAttribute('data-qty');
        document.getElementById('inv-price').value = e.target.getAttribute('data-price');
        inventoryForm.setAttribute('data-edit-id', e.target.getAttribute('data-id'));
        document.getElementById('btn-inv-submit').innerText = "Update Item";
        document.getElementById('inv-form-title').innerText = `Editing: ${e.target.getAttribute('data-name')}`;
        document.getElementById('btn-inv-cancel').style.display = "inline-block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});


// ==========================================
// ====== SETTINGS & DATA MANAGEMENT ========
// ==========================================

document.getElementById('btn-trigger-excel').addEventListener('click', () => { document.getElementById('excel-file').click(); });

document.getElementById('excel-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;

    if(!confirm("WARNING: This will DELETE all current inventory and replace it entirely with the data from the Excel file. Are you absolutely sure?")) {
        e.target.value = ''; return; 
    }

    const btn = document.getElementById('btn-trigger-excel');
    const ogText = btn.innerText; btn.innerText = "Importing..."; btn.disabled = true;

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
                    await addDoc(collection(db, "inventory"), { name: name.trim(), qty, price });
                }
            }
            alert("Inventory successfully updated from Excel!");
        } catch (error) {
            console.error(error); alert("An error occurred during import. Check the console for details.");
        } finally {
            btn.innerText = ogText; btn.disabled = false; document.getElementById('excel-file').value = ''; 
        }
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById('btn-sync-drive').addEventListener('click', () => { alert("Sync to Google Drive initiated."); });

document.getElementById('btn-merge-dup').addEventListener('click', async () => {
    if(!confirm("Are you sure you want to scan and merge identical items? (Quantities will be summed, Prices will be averaged.)")) return;
    const btn = document.getElementById('btn-merge-dup');
    const ogText = btn.innerText; btn.innerText = "Merging..."; btn.disabled = true;

    try {
        const itemsMap = {};
        allInventory.forEach(item => {
            const key = item.name.trim().toLowerCase(); 
            if(!itemsMap[key]) itemsMap[key] =[];
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
                await updateDoc(doc(db, "inventory", mainId), { qty: totalQty, price: avgPrice });
                
                for(let i = 1; i < itemsMap[key].length; i++) {
                    await deleteDoc(doc(db, "inventory", itemsMap[key][i].id));
                }
            }
        }
        if(mergeCount > 0) alert(`Success! Merged duplicates across ${mergeCount} item name(s).`);
        else alert("No duplicates found. Your inventory is clean!");

    } catch (err) { console.error(err); alert("An error occurred during merge.");
    } finally { btn.innerText = ogText; btn.disabled = false; }
});



// Populates the "Select Month" dropdown based on existing data
function updateDashboardMonths(transactions) {
    const currentSelection = dashMonthSelect.value;
    let monthsSet = new Set();
    
    // Add current month by default so it's never empty
    monthsSet.add(new Date().toLocaleString('default', { month: 'long', year: 'numeric' }));

    transactions.forEach(t => {
        const d = new Date(t.date);
        monthsSet.add(d.toLocaleString('default', { month: 'long', year: 'numeric' }));
    });

    let html = ''; // Removed the 'All Months' option to focus strictly on Month-by-Month as requested
    Array.from(monthsSet).forEach(m => {
        html += `<option value="${m}">${m}</option>`;
    });

    dashMonthSelect.innerHTML = html;

    // Restore previous selection if it exists, otherwise it defaults to top (Current month)
    if (currentSelection && monthsSet.has(currentSelection)) {
        dashMonthSelect.value = currentSelection;
    }
}
