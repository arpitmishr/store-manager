import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy, limit, startAt, startAfter, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const txTable = document.getElementById('tx-table');
const yearFilter = document.getElementById('global-year-filter');
const searchInput = document.getElementById('tx-search');
const searchBtn = document.getElementById('btn-tx-search');
const prevBtn = document.getElementById('btn-prev-page');
const nextBtn = document.getElementById('btn-next-page');
const pageInfo = document.getElementById('page-info');

let txCache =[];
const PAGE_SIZE = 15; // Number of items per page to reduce read costs
let currentPage = 1;
let lastVisibleDoc = null;
let pageCursors = {}; // Tracks the first document of every page visited

export async function loadTransactions(page = 1, isNewSearch = false) {
    if (isNewSearch) {
        pageCursors = {};
        lastVisibleDoc = null;
        currentPage = 1;
        page = 1;
    }

    const selectedYear = yearFilter.value;
    const searchTerm = searchInput.value.trim();
    let constraints =[];

    // Query Builder
    if (searchTerm) {
        // Range filter for case-sensitive Prefix Searching
        constraints.push(where("customer", ">=", searchTerm));
        constraints.push(where("customer", "<=", searchTerm + '\uf8ff'));
        constraints.push(orderBy("customer")); 
    } else {
        // Timeline filtering utilizing automatic indexes
        if (selectedYear !== "All") {
            constraints.push(where("timestamp", ">=", `${selectedYear}-01-01`));
            constraints.push(where("timestamp", "<=", `${selectedYear}-12-31T23:59:59.999Z`));
        }
        constraints.push(orderBy("timestamp", "desc"));
    }

    constraints.push(limit(PAGE_SIZE));

    // Pagination Cursors
    if (page > 1) {
        if (pageCursors[page]) {
            constraints.push(startAt(pageCursors[page])); // Returning to a cached page
        } else if (lastVisibleDoc) {
            constraints.push(startAfter(lastVisibleDoc)); // Moving to next unvisited page
        }
    }

    try {
        txTable.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500 font-bold">Loading transactions...</td></tr>`;
        
        const q = query(collection(db, "transactions"), ...constraints);
        const snapshot = await getDocs(q);

        if (snapshot.empty && page > 1) {
            txTable.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500">End of records.</td></tr>`;
            nextBtn.disabled = true;
            return;
        }

        txCache =[];
        snapshot.forEach(d => {
            const data = d.data();
            // Local fallback year filter if we used the Customer Text Search 
            if (searchTerm && selectedYear !== "All" && data.year !== selectedYear) return; 
            txCache.push({ id: d.id, ...data });
        });

        // Register Page bounds
        if (!snapshot.empty) {
            pageCursors[page] = snapshot.docs[0];
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        }

        currentPage = page;
        pageInfo.innerText = `Page ${currentPage}`;
        prevBtn.disabled = currentPage === 1;
        
        // If snapshot length is less than PAGE_SIZE, there are definitively no more pages
        nextBtn.disabled = snapshot.docs.length < PAGE_SIZE;

        renderTable();
    } catch (err) {
        console.error("Firebase Pagination Error:", err);
        txTable.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500 font-bold">Error loading transactions. Check console.</td></tr>`;
    }
}

function renderTable() {
    txTable.innerHTML = '';
    
    if (txCache.length === 0) {
        txTable.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500">No transactions found.</td></tr>`;
        return;
    }

    // Secondary local sort to ensure descending dates if Customer Search was used
    if (searchInput.value.trim()) {
        txCache.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    txCache.forEach(tx => {
        const itemStr = tx.items ? tx.items.map(i => `${i.qty}x ${i.name}`).join(', ') : 'N/A';
        
        txTable.innerHTML += `
            <tr class="border-b dark:border-gray-700 ${tx.isReturn ? 'bg-red-50 dark:bg-red-900/20 text-gray-500 line-through' : ''} hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                <td class="p-3">${tx.date}</td>
                <td class="p-3">
                    <span class="px-2 py-1 rounded text-xs font-bold ${tx.type === 'Purchase' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                        ${tx.type}
                    </span>
                    <br><span class="text-xs text-gray-500">${tx.customer || ''}</span>
                </td>
                <td class="p-3 text-xs max-w-xs truncate" title="${itemStr}">${itemStr}</td>
                <td class="p-3 font-bold">₹${(tx.total || 0).toFixed(2)}</td>
                <td class="p-3 ${tx.profit > 0 ? 'text-green-600' : (tx.profit < 0 ? 'text-red-600' : '')}">
                    ${tx.type !== 'Purchase' ? `₹${(tx.profit || 0).toFixed(2)}` : '-'}
                </td>
                <td class="p-3">
                    ${!tx.isReturn && tx.type !== 'Purcha
