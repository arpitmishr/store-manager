import { setupAuth } from './auth.js';
import { addItem, listenToInventory } from './inventory.js';
import { processSale } from './sales.js';

let globalInventory =[];

// --- 1. NAVIGATION LOGIC ---
const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.page-section');

navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Remove active highlights from all buttons
        navButtons.forEach(b => {
            b.classList.remove('bg-gray-800');
            b.classList.add('hover:bg-gray-800');
        });
        // Add highlight to clicked button
        e.target.classList.add('bg-gray-800');
        e.target.classList.remove('hover:bg-gray-800');

        // Hide all sections
        sections.forEach(sec => sec.classList.add('hidden'));
        
        // Show the targeted section
        const targetId = e.target.getAttribute('data-target');
        document.getElementById(targetId).classList.remove('hidden');
    });
});

// --- 2. INITIALIZE AUTHENTICATION ---
function onLogin(user) {
    console.log("Logged in as:", user.email);
    
    // Once logged in, load the inventory data
    listenToInventory((items) => {
        globalInventory = items;
        updateDashboard();
        updateInventoryTable();
        updateSalesDropdown();
    });
}

function onLogout() {
    console.log("Logged out");
    globalInventory =[]; // Clear data for security
}

// **THIS IS THE LINE THAT WAS MISSING! It turns the login button on.**
setupAuth(onLogin, onLogout);


// --- 3. INVENTORY LOGIC ---
document.getElementById('add-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('item-name').value;
    const qty = document.getElementById('item-qty').value;
    const price = document.getElementById('item-price').value;

    const success = await addItem(name, qty, price);
    if(success) {
        e.target.reset(); // Clear the form
    } else {
        alert("Error adding item. Check your database rules.");
    }
});

function updateInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = ''; // Clear old rows
    
    globalInventory.forEach(item => {
        const tr = document.createElement('tr');
        // If stock is less than 5, turn the text red
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
        setTimeout(() => { msgEl.textContent = ''; }, 3000); // Clear message after 3 seconds
    }
});

// --- 5. DASHBOARD LOGIC ---
function updateDashboard() {
    document.getElementById('stat-products').textContent = globalInventory.length;
    
    // Calculate total value of items sitting in inventory
    let totalValue = 0;
    globalInventory.forEach(item => {
        totalValue += (item.quantity * item.price);
    });
    document.getElementById('stat-sales').textContent = `₹${totalValue}`;
}
