import { db } from './firebase-config.js';
import { collection, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let salesChartObj = null;

const initDashboard = () => {
    const today = new Date().toISOString().split('T')[0];

    // Real-time Transactions (Today)
    const txQuery = query(collection(db, "transactions"), where("date", "==", today));
    onSnapshot(txQuery, (snapshot) => {
        let sales = 0; let profit = 0; let items = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if(!data.isReturn) {
                sales += data.total;
                profit += data.profit;
                data.items.forEach(i => { items[i.name] = (items[i.name] || 0) + i.qty; });
            }
        });
        document.getElementById('dash-sales').innerText = `₹${sales.toFixed(2)}`;
        document.getElementById('dash-profit').innerText = `₹${profit.toFixed(2)}`;
        
        const topItem = Object.keys(items).sort((a,b) => items[b] - items[a])[0];
        document.getElementById('dash-trending').innerText = topItem || "-";
    });

    // Low Stock
    onSnapshot(collection(db, "inventory"), (snapshot) => {
        let lowCount = 0;
        snapshot.forEach(doc => { if(doc.data().qty <= 3 && !doc.data().isCosmetic) lowCount++; });
        document.getElementById('dash-low-stock').innerText = lowCount;
    });

    // Chart (Last 7 Days)
    onSnapshot(collection(db, "transactions"), (snapshot) => {
        const last7Days =[...Array(7)].map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();

        const dataMap = {};
        last7Days.forEach(d => dataMap[d] = 0);

        snapshot.forEach(doc => {
            const data = doc.data();
            if(dataMap[data.date] !== undefined && !data.isReturn) dataMap[data.date] += data.total;
        });

        const ctx = document.getElementById('salesChart').getContext('2');
        if(salesChartObj) salesChartObj.destroy();
        salesChartObj = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets:[{ label: 'Daily Sales (₹)', data: Object.values(dataMap), borderColor: '#2563eb', tension: 0.1 }]
            }
        });
    });
};
initDashboard();
