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
let allInventory =[]; // Save locally for analytics

// Chart Instances
let myChartMonthly = null;
let myChartABC = null;
let myChartFSN = null;

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
const tabs =['dashboard', 'analytics', 'sales', 'purchases', 'inventory'];
tabs.forEach(tab => {
    document.getElementById(`btn-${tab}`).addEventListener('click', () => {
        tabs.forEach(t => {
            document.getElementById(`tab-${t}`).classList.remove('active');
            document.getElementById(`btn-${t}`).classList.remove('active');
        });
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.getElementById(`btn-${tab}`).classList.add('active');
        if(tab === 'analytics') runAnalytics(); // refresh analytics when tab clicked
    });
});

// ----- DATABASE LISTENERS -----
function startDatabaseListeners() {
    unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => {
        const tbody = document.querySelector('#table-inventory tbody');
        const datalist = document.getElementById('inventory-items-list'); 
        tbody.innerHTML = ''; datalist.innerHTML = ''; 
        let totalItems = 0;
        allInventory =[];

        snapshot.forEach((docSnap) => {
            const item = docSnap.data();
            item.id = docSnap.id;
            allInventory.push(item);

            const itemName = item.name || "Unknown";
            const itemQty = Number(item.qty) || 0;
            const itemPrice = Number(item.price) || 0;

            totalItems += itemQty;
            tbody.innerHTML += `<tr><td>${itemName}</td><td>${itemQty}</td><td>₹${itemPrice.toFixed(2)}</td>
                <td><button class="btn-edit" style="background:#f39c12; color:white; border:none; padding:5px; cursor:pointer;" data-id="${item.id}" data-name="${itemName}" data-qty="${itemQty}" data-price="${itemPrice}">Edit</button>
                <button class="btn-delete" style="background:#e74c3c; color:white; border:none; padding:5px; cursor:pointer;" data-id="${item.id}">Delete</button></td></tr>`;
            datalist.innerHTML += `<option value="${itemName}"></option>`;
        });
        document.getElementById('dash-inventory').innerText = totalItems;
        runAnalytics();
    });

    unsubTransactions = onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
        allTransactions =[];
        let totalSales = 0; let totalPurchases = 0;

        snapshot.forEach((docSnap) => {
            const trans = docSnap.data();
            allTransactions.push(trans);
            const tAmount = Number(trans.amount) || 0;
            if(trans.type === 'Sale') totalSales += tAmount;
            else if (trans.type === 'Purchase') totalPurchases += tAmount;
        });

        document.getElementById('dash-sales').innerText = `₹${totalSales.toFixed(2)}`;
        document.getElementById('dash-purchases').innerText = `₹${totalPurchases.toFixed(2)}`;
        renderSalesTable(); renderPurchasesTable(); runAnalytics();
    });
}

function stopDatabaseListeners() {
    if (unsubInventory) unsubInventory();
    if (unsubTransactions) unsubTransactions();
}

// ==========================================
// ====== ADVANCED ANALYTICS ENGINE =========
// ==========================================

document.getElementById('btn-ana-filter').addEventListener('click', runAnalytics);
document.getElementById('btn-ana-clear').addEventListener('click', () => {
    document.getElementById('ana-start').value = '';
    document.getElementById('ana-end').value = '';
    runAnalytics();
});
document.getElementById('btn-ana-today').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ana-start').value = today;
    document.getElementById('ana-end').value = today;
    runAnalytics();
});
document.getElementById('ana-class-filter').addEventListener('change', runAnalytics);

// Adding Listeners for new Filters
document.getElementById('filter-top-selling').addEventListener('change', runAnalytics);
document.getElementById('filter-inv-status').addEventListener('change', runAnalytics);

function runAnalytics() {
    if(!document.getElementById('tab-analytics').classList.contains('active')) return;

    // 1. Get Date Filters
    const startVal = document.getElementById('ana-start').value;
    const endVal = document.getElementById('ana-end').value;
    let startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
    let endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    // 2. Process Filtered Transactions
    let revenue = 0; let cogs = 0; 
    let itemStats = {}; // FSN / HMV stats + Sale Tracking
    let monthlyData = {}; // For Chart

    allInventory.forEach(inv => {
        itemStats[inv.name] = { stock: inv.qty, unitCost: inv.price, invValue: (inv.qty * inv.price), qtySold: 0, totalRevenue: 0 };
    });

    allTransactions.forEach(trans => {
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
        }
    });

    // 3. Update Snapshot Cards
    let profit = revenue - cogs;
    let margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
    let totalStock = allInventory.reduce((acc, curr) => acc + Number(curr.qty || 0), 0);

    document.getElementById('ana-revenue').innerText = `₹${revenue.toFixed(2)}`;
    document.getElementById('ana-profit').innerText = `₹${profit.toFixed(2)}`;
    document.getElementById('ana-margin').innerText = `${margin}%`;
    document.getElementById('ana-stock').innerText = totalStock;

    // 4. Calculate ABC Analysis
    let totalInvValue = 0;
    let abcArray =[];
    for (const [name, data] of Object.entries(itemStats)) {
        totalInvValue += data.invValue;
        abcArray.push({ name, value: data.invValue });
    }
    abcArray.sort((a,b) => b.value - a.value);
    
    let cumValue = 0;
    let abcTotals = { A: 0, B: 0, C: 0 };
    const tbodyABC = document.querySelector('#table-abc tbody');
    tbodyABC.innerHTML = '';

    abcArray.forEach(item => {
        cumValue += item.value;
        let pct = totalInvValue > 0 ? cumValue / totalInvValue : 0;
        let category = 'C';

        if(pct <= 0.70) { abcTotals.A += item.value; category = 'A'; }
        else if (pct <= 0.90) { abcTotals.B += item.value; category = 'B'; }
        else { abcTotals.C += item.value; category = 'C'; }

        // Draw ABC Table rows
        let catColor = category === 'A' ? '#2ecc71' : (category === 'B' ? '#f1c40f' : '#e74c3c');
        tbodyABC.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>₹${item.value.toFixed(2)}</td>
                <td>${(pct * 100).toFixed(1)}%</td>
                <td style="color:${catColor}; font-weight:bold;">${category}</td>
            </tr>
        `;
    });

    // 5. Render Top Selling Products
    const filterTop = document.getElementById('filter-top-selling').value;
    const tbodyTop = document.getElementById('tbody-top-selling');
    tbodyTop.innerHTML = '';
    let sortedTop = Object.keys(itemStats).map(k => ({name: k, sold: itemStats[k].qtySold})).sort((a,b) => b.sold - a.sold);
    if(filterTop === 'Top10') sortedTop = sortedTop.slice(0, 10);
    sortedTop.forEach(item => {
        if(item.sold > 0 || filterTop === 'All') {
            tbodyTop.innerHTML += `<tr><td>${item.name}</td><td>${item.sold}</td></tr>`;
        }
    });

    // 6. Render Inventory Status
    const filterInv = document.getElementById('filter-inv-status').value;
    const tbodyInv = document.getElementById('tbody-inv-status');
    tbodyInv.innerHTML = '';
    let sortedInv = Object.keys(itemStats).map(k => ({name: k, stock: itemStats[k].stock})).sort((a,b) => a.stock - b.stock);
    sortedInv.forEach(item => {
        if (filterInv === 'Low' && item.stock > 3) return; // Hide standard stock if "Low" is filtered
        tbodyInv.innerHTML += `<tr>
            <td>${item.name}</td>
            <td style="color: ${item.stock <= 3 ? '#e74c3c' : '#2c3e50'}; font-weight: ${item.stock <= 3 ? 'bold' : 'normal'};">${item.stock}</td>
        </tr>`;
    });

    // 7. Calculate FSN & HMV
    let fsnTotals = { F: 0, S: 0, N: 0 };
    let matrixRows =[];

    let maxQtySold = Math.max(...Object.values(itemStats).map(i => i.qtySold), 0);
    let maxRev = Math.max(...Object.values(itemStats).map(i => i.totalRevenue), 0);

    for (const[name, data] of Object.entries(itemStats)) {
        let FSN = 'N';
        if (data.qtySold > 0) {
            if (data.qtySold >= (maxQtySold * 0.5)) FSN = 'F'; 
            else FSN = 'S';
        }
        fsnTotals[FSN] += data.stock;

        let HMV = 'V'; 
        if (data.totalRevenue > 0) {
            if (data.totalRevenue >= (maxRev * 0.5)) HMV = 'H'; 
            else HMV = 'M';
        }

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

    // 8. Render Matrix Table
    const filterClass = document.getElementById('ana-class-filter').value;
    const tbodyMatrix = document.querySelector('#table-matrix tbody');
    tbodyMatrix.innerHTML = '';
    matrixRows.sort((a,b) => b.rev - a.rev).forEach(row => {
        if(filterClass !== "All" && !row.actClass.includes(filterClass)) return;
        
        let fsnColor = row.FSN==='F'?'#27ae60':(row.FSN==='S'?'#f39c12':'#e74c3c');
        let hmvColor = row.HMV==='H'?'#2980b9':(row.HMV==='M'?'#8e44ad':'#7f8c8d');

        tbodyMatrix.innerHTML += `
            <tr>
                <td><b>${row.name}</b></td>
                <td>${row.stock}</td>
                <td>₹${row.invValue.toFixed(2)}</td>
                <td>₹${row.rev.toFixed(2)}</td>
                <td style="color:${fsnColor}; font-weight:bold;">${row.FSN}</td>
                <td style="color:${hmvColor}; font-weight:bold;">${row.HMV}</td>
                <td>${row.actClass}</td>
            </tr>
        `;
    });

    // 9. Render Charts
    renderCharts(monthlyData, abcTotals, fsnTotals);
}

function renderCharts(monthlyData, abcTotals, fsnTotals) {
    if(myChartMonthly) myChartMonthly.destroy();
    if(myChartABC) myChartABC.destroy();
    if(myChartFSN) myChartFSN.destroy();

    const labelsMonth = Object.keys(monthlyData).reverse();
    const dataSales = labelsMonth.map(m => monthlyData[m].sales);
    const dataProfit = labelsMonth.map(m => monthlyData[m].profit);

    myChartMonthly = new Chart(document.getElementById('chart-monthly'), {
        type: 'bar',
        data: {
            labels: labelsMonth.length ? labelsMonth : ["No Data"],
            datasets:[
                { label: 'Sales (₹)', data: dataSales, backgroundColor: '#3498db' },
                { label: 'Profit (₹)', data: dataProfit, backgroundColor: '#2ecc71' }
            ]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Monthly Sales vs Profit' } } }
    });

    myChartABC = new Chart(document.getElementById('chart-abc'), {
        type: 'doughnut',
        data: {
            labels:['A (Top Value)', 'B (Medium)', 'C (Low)'],
            datasets: [{ data:[abcTotals.A, abcTotals.B, abcTotals.C], backgroundColor:['#2ecc71', '#f1c40f', '#e74c3c'] }]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Inventory Value by ABC' } } }
    });

    myChartFSN = new Chart(document.getElementById('chart-fsn'), {
        type: 'pie',
        data: {
            labels: ['Fast Moving', 'Slow Moving', 'Non-Moving'],
            datasets:[{ data: [fsnTotals.F, fsnTotals.S, fsnTotals.N], backgroundColor:['#3498db', '#e67e22', '#95a5a6'] }]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Stock Units by FSN' } } }
    });
}


// ==========================================
// ====== EXISTING SALES & PURCHASES ========
// ==========================================

const saleForm = document.getElementById('form-sale');
saleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = document.getElementById('sale-item').value.trim();
    let qty = parseInt(document.getElementById('sale-qty').value);
    let amount = parseFloat(document.getElementById('sale-amount').value);
    const date = new Date().toISOString();

    try {
        await addDoc(collection(db, "transactions"), { type: "Sale", item, qty, amount, date });
        const q = query(collection(db, "inventory"), where("name", "==", item));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const invDoc = querySnapshot.docs[0];
            let newQty = Number(invDoc.data().qty) - qty;
            await updateDoc(doc(db, "inventory", invDoc.id), { qty: newQty < 0 ? 0 : newQty });
        }
        saleForm.reset();
    } catch (e) { console.error(e); }
});

document.getElementById('btn-sale-filter').addEventListener('click', renderSalesTable);
document.getElementById('btn-sale-clear').addEventListener('click', () => { document.getElementById('filter-sale-start').value = ''; document.getElementById('filter-sale-end').value = ''; renderSalesTable(); });

function renderSalesTable() {
    const tbody = document.querySelector('#table-sales tbody'); tbody.innerHTML = '';
    const startVal = document.getElementById('filter-sale-start').value; const endVal = document.getElementById('filter-sale-end').value;
    let sD = startVal ? new Date(startVal + 'T00:00:00') : null; let eD = endVal ? new Date(endVal + 'T23:59:59') : null;

    allTransactions.forEach((t) => {
        if (t.type !== 'Sale') return;
        const tDate = new Date(t.date);
        if (sD && tDate < sD) return; if (eD && tDate > eD) return;
        tbody.innerHTML += `<tr><td>${tDate.toLocaleDateString()}</td><td>${t.item||"Unknown"}</td><td>${Number(t.qty)||0}</td><td>₹${(Number(t.amount)||0).toFixed(2)}</td></tr>`;
    });
}

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
    } catch (e) { console.error(e); }
});

document.getElementById('btn-purchase-filter').addEventListener('click', renderPurchasesTable);
document.getElementById('btn-purchase-clear').addEventListener('click', () => { document.getElementById('filter-purchase-start').value = ''; document.getElementById('filter-purchase-end').value = ''; renderPurchasesTable(); });

function renderPurchasesTable() {
    const tbody = document.querySelector('#table-purchases tbody'); tbody.innerHTML = '';
    const startVal = document.getElementById('filter-purchase-start').value; const endVal = document.getElementById('filter-purchase-end').value;
    let sD = startVal ? new Date(startVal + 'T00:00:00') : null; let eD = endVal ? new Date(endVal + 'T23:59:59') : null;

    allTransactions.forEach((t) => {
        if (t.type !== 'Purchase') return;
        const tDate = new Date(t.date);
        if (sD && tDate < sD) return; if (eD && tDate > eD) return;
        tbody.innerHTML += `<tr><td>${tDate.toLocaleDateString()}</td><td>${t.item||"Unknown"}</td><td>${Number(t.qty)||0}</td><td>₹${(Number(t.amount)||0).toFixed(2)}</td></tr>`;
    });
}

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
