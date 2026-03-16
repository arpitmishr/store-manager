import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let abcChartObj = null;

const runAnalytics = async () => {
    const yearFilter = document.getElementById('global-year-filter').value;
    const invSnap = await getDocs(collection(db, "inventory"));
    
    let txQuery = collection(db, "transactions");
    if(yearFilter !== "All") {
        txQuery = query(collection(db, "transactions"), where("year", "==", yearFilter));
    }
    const txSnap = await getDocs(txQuery);

    // 1. ABC Analysis (Current Inventory Value)
    let inventory =[];
    let totalInvValue = 0;
    
    invSnap.forEach(d => {
        const data = d.data();
        if(!data.isCosmetic) {
            const val = data.qty * data.avgCost;
            inventory.push({ name: data.name, value: val });
            totalInvValue += val;
        }
    });

    inventory.sort((a,b) => b.value - a.value);
    
    let cumValue = 0;
    let counts = { A: 0, B: 0, C: 0 };
    
    inventory.forEach(item => {
        cumValue += item.value;
        const pct = cumValue / totalInvValue;
        if(pct <= 0.7) counts.A++;
        else if(pct <= 0.9) counts.B++;
        else counts.C++;
    });

    const ctx = document.getElementById('abcChart').getContext('2');
    if(abcChartObj) abcChartObj.destroy();
    abcChartObj = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels:['A (Top 70% Value)', 'B (Next 20%)', 'C (Bottom 10%)'],
            datasets: [{ data:[counts.A, counts.B, counts.C], backgroundColor:['#22c55e', '#eab308', '#ef4444'] }]
        }
    });

    // 2. FSN x HMV Matrix Actionables (Based on filtered year)
    let itemStats = {};
    txSnap.forEach(d => {
        const tx = d.data();
        if(tx.isReturn || tx.type === 'Purchase') return;
        tx.items.forEach(i => {
            if(!itemStats[i.name]) itemStats[i.name] = { freq: 0, revenue: 0 };
            itemStats[i.name].freq += 1; 
            itemStats[i.name].revenue += (i.qty * i.price);
        });
    });

    const matrixList = document.getElementById('matrix-list');
    matrixList.innerHTML = '';
    
    const sortedByRev = Object.keys(itemStats).sort((a,b) => itemStats[b].revenue - itemStats[a].revenue);
    
    if (sortedByRev.length === 0) {
        matrixList.innerHTML = `<li class="text-gray-500">No sales data for ${yearFilter}</li>`;
        return;
    }

    sortedByRev.slice(0, 15).forEach(itemName => {
        const stat = itemStats[itemName];
        let tag = "🍞 Bread & Butter";
        if(stat.freq > 4 && stat.revenue > 1500) tag = "⭐ Prime Star";
        if(stat.freq <= 2 && stat.revenue > 1000) tag = "🚨 High-Value Slow Mover";

        matrixList.innerHTML += `
            <li class="flex justify-between border-b dark:border-gray-700 py-2">
                <span>${itemName} <span class="text-xs text-gray-400">(${stat.freq} sales)</span></span>
                <span class="font-bold text-blue-600">${tag}</span>
            </li>
        `;
    });
};

document.querySelector('[data-target="analytics"]').addEventListener('click', runAnalytics);
window.addEventListener('yearChanged', () => {
    // Only re-run if analytics page is currently visible
    if (!document.getElementById('analytics').classList.contains('hidden')) {
        runAnalytics();
    }
});
