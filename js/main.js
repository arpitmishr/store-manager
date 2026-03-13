import { setupAuth } from './auth.js';
import { addItem, listenToInventory } from './inventory.js';
import { processSale } from './sales.js';
import { processJSONUpload } from './import.js';
import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let globalInventory =[];
let globalTransactions =[];
let selectedYear = "All"; 

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
        select.innerHTML = '<option value="All">All Time</option>';
        Array.from(years).sort().reverse().forEach(year => {
            const opt = document.createElement('option');
            opt.value = year;
            opt.textContent = year;
            select.appendChild(opt);
        });
        
        updateDashboard();
    });

}, () => {
    console.log("Logged out");
    globalInventory = []; 
    globalTransactions =[];
});

// --- 3. INVENTORY LOGIC ---
document.getElementById('add-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('item-name').value;
    const qty = document.getElementById('item-qty').value;
    const price = document.getElementById('item-price').value;

    const success = await addItem(name, qty, price);
    if(success) e.target.reset();
});

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

// --- 4. SALES LOGIC ---
function updateSalesDropdown() {
    const select = document.getElementById('sale-item');
    if(!select) return;
    select.innerHTML = '<option value="">-- Choose Item --</option>';
    
    globalInventory.forEach(item => {
        if(item.quantity > 0) {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.name} (Stock: ${item.quantity} | ₹${item.price})`;
            select.appendChild(opt);
        }
    });
}

document.getElementById('sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('sale-item').value;
    const qty = parseInt(document.getElementById('sale-qty').value);
    const msgEl = document.getElementById('sale-msg');

    if(!itemId) return;
    const result = await processSale(itemId, qty);
    msgEl.textContent = result.message;
    msgEl.className = result.success ? "mt-4 font-bold text-green-600" : "mt-4 font-bold text-red-600";
    if(result.success) {
        e.target.reset();
        setTimeout(() => { msgEl.textContent = ''; }, 3000);
    }
});

// --- 5. DASHBOARD & YEAR FILTER LOGIC ---
document.getElementById('year-filter').addEventListener('change', (e) => {
    selectedYear = e.target.value;
    document.getElementById('display-year').textContent = selectedYear === "All" ? "All Time" : selectedYear;
    updateDashboard();
});

function updateDashboard() {
    document.getElementById('stat-products').textContent = globalInventory.length;
    
    let totalSales = 0;
    globalTransactions.forEach(transaction => {
        if(transaction.type === "Sale") {
            if (selectedYear === "All" || transaction.year.toString() === selectedYear) {
                totalSales += transaction.total;
            }
        }
    });
    document.getElementById('stat-sales').textContent = `₹${totalSales.toLocaleString('en-IN')}`;
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
