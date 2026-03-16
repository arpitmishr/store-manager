import { db } from './firebase-config.js';
import { collection, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let salesChartObj = null;
let dashListener = null;

const initDashboard = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yearFilter = document.getElementById('global-year-filter').value;

    let txQuery;
    if (yearFilter === "All") {
        txQuery = query(collection(db, "transactions")); // Get all for overall trends
    } else {
        txQuery = query(collection(db, "transactions"), where("year", "==", yearFilter));
    }

    if(dashListener) dashListener();

    dashListener = onSnapshot(txQuery, (snapshot) => {
        let todaySales = 0; let todayProfit = 0; 
        let overallSales = 0; let overallProfit = 0;
        let itemsCountMap = {};

        const dataMap = {}; // For Chart

        snapshot.forEach(doc => {
            const data = doc.data();
            if(!data.isReturn && data.type !== 'Purchase') {
                // Today's metrics
                if (data.date === todayStr) {
                    todaySales += data.total;
                    todayProfit += data.profit;
                }
                
                // Overall Year Metrics
                overallSales += data.total;
                overallProfit += data.profit;

                // Trending Items
                data.items.forEach(i => {
                    itemsCountMap[i.name] = (itemsCountMap[i.name] || 0) + i.qty;
                });

                // Chart Data mapping (aggregating by date)
                dataMap[data.date] = (dataMap[data.date] || 0) + data.total;
            }
        });

        // Update UI
        document.getElementById('dash-sales').innerText = `₹${todaySales.toFixed(2)}`;
        document.getElementById('dash-profit').innerText = `₹${todayProfit.toFixed(2)}`;
        
        const topItem = Object.keys(itemsCountMap).sort((a,b) => itemsCountMap[b] - itemsCountMap[a])[0];
        document.getElementById('dash-trending').innerText = topItem || "N/A";

        // Generate Chart (Last 14 dates where sales happened)
        const sortedDates = Object.keys(dataMap).sort();
        const recentDates = sortedDates.slice(-14); // Get last 14 active days
        const chartData = recentDates.map(d => dataMap[d]);

        const ctx = document.getElementById('salesChart').getContext('2');
        if(salesChartObj) salesChartObj.destroy();
        salesChartObj = new Chart(ctx, {
            type: 'line',
            data: {
                labels: recentDates,
                datasets:[{ label: `Sales Trend (₹) - ${yearFilter}`, data: chartData, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', fill: true, tension: 0.3 }]
            }
        });
    });

    // Low stock tracker (Independent of year, looks at current inventory)
    onSnapshot(collection(db, "inventory"), (snapshot) => {
        let lowCount = 0;
        snapshot.forEach(doc => { if(doc.data().qty <= 3 && !doc.data().isCosmetic) lowCount++; });
        document.getElementById('dash-low-stock').innerText = lowCount;
    });
};

initDashboard();

// Listen to the global event dispatched from transactions.js
window.addEventListener('yearChanged', initDashboard);
