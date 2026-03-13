import { setupAuth } from './auth.js';
import { listenToInventory } from './inventory.js';
import { processJSONUpload } from './import.js';
// (Keep your processSale imports from sales.js here too)
import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let globalInventory =[];
let globalTransactions =[];
let selectedYear = "All"; // Default view

// --- NAVIGATION ---
const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.page-section');
navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        navButtons.forEach(b => { b.classList.remove('bg-gray-800'); b.classList.add('hover:bg-gray-800'); });
        e.target.classList.add('bg-gray-800'); e.target.classList.remove('hover:bg-gray-800');
        sections.forEach(sec => sec.classList.add('hidden'));
        document.getElementById(e.target.getAttribute('data-target')).classList.remove('hidden');
    });
});

// --- AUTH & DATA LOADING ---
setupAuth((user) => {
    // 1. Load Inventory
    listenToInventory((items) => {
        globalInventory = items;
        updateInventoryTable();
        updateDashboard();
    });

    // 2. Load Transactions for Year-Wise calculation
    onSnapshot(collection(db, 'transactions'), (snapshot) => {
        globalTransactions =[];
        const years = new Set();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            globalTransactions.push(data);
            if(data.year) years.add(data.year);
        });
        
        updateYearDropdown(Array.from(years).sort().reverse());
        updateDashboard();
    });

}, () => {
    globalInventory = [];
    globalTransactions =[];
});

// --- DASHBOARD YEAR FILTER LOGIC ---
function updateYearDropdown(years) {
    const select = document.getElementById('year-filter');
    // Keep 'All Time' as first option, then add years dynamically
    select.innerHTML = '<option value="All">All Time</option>';
    years.forEach(year => {
        const opt = document.createElement('option');
        opt.value = year;
        opt.textContent = year;
        select.appendChild(opt);
    });
}

document.getElementById('year-filter').addEventListener('change', (e) => {
    selectedYear = e.target.value;
    document.getElementById('display-year').textContent = selectedYear === "All" ? "All Time" : selectedYear;
    updateDashboard();
});

function updateDashboard() {
    // Total Products in inventory (ignoring year)
    document.getElementById('stat-products').textContent = globalInventory.length;
    
    // Calculate total Sales Value based on Selected Year
    let totalSales = 0;
    globalTransactions.forEach(transaction => {
        // Only count "Sale" types
        if(transaction.type === "Sale") {
            // Check if year matches filter
            if (selectedYear === "All" || transaction.year.toString() === selectedYear) {
                totalSales += transaction.total;
            }
        }
    });
    
    document.getElementById('stat-sales').textContent = `₹${totalSales.toLocaleString('en-IN')}`;
}

// --- JSON IMPORT LOGIC ---
let selectedFile = null;
document.getElementById('json-upload').addEventListener('change', (e) => {
    selectedFile = e.target.files[0];
    if(selectedFile) {
        document.getElementById('import-btn').classList.remove('hidden');
    }
});

document.getElementById('import-btn').addEventListener('click', () => {
    if(selectedFile) {
        const statusEl = document.getElementById('import-status');
        document.getElementById('import-btn').classList.add('hidden'); // Hide button so they don't double click
        processJSONUpload(selectedFile, statusEl);
    }
});

function updateInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    if(!tbody) return;
    tbody.innerHTML = ''; 
    globalInventory.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-4">${item.name}</td>
            <td class="p-4 font-bold text-gray-700">${item.quantity}</td>
            <td class="p-4">₹${item.price}</td>
        `;
        tbody.appendChild(tr);
    });
}
