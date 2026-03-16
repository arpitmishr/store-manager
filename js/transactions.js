import { db } from './firebase-config.js';
import { collection, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const txTable = document.getElementById('tx-table');
const yearFilter = document.getElementById('global-year-filter'); // The dropdown
let activeListener = null;
let txCache =[];

function loadTransactions() {
    const selectedYear = yearFilter.value;
    
    // Build the query based on selected year
    let q;
    if (selectedYear === "All") {
        q = query(collection(db, "transactions")); // Fetch all
    } else {
        q = query(collection(db, "transactions"), where("year", "==", selectedYear));
    }

    // Unsubscribe from previous listener if it exists
    if (activeListener) activeListener();

    activeListener = onSnapshot(q, (snapshot) => {
        txCache =
