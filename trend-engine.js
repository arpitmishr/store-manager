const TrendEngine = (() => {
    const STATE = {
        mom: { curSales: 0, curProfit: 0, curMargin: 0, prevSales: 0, prevProfit: 0, prevMargin: 0 },
        abcXyz: { matrixCounts: {}, skus: [] },
        stockHealth: {
            criticalList: [],
            overstockList: [],
            optimalList: [],
            stockoutList: [],
            totalTrappedCapital: 0,
            revenueAtRisk: 0,
            optimalPct: 0,
            avgRunwayDays: 0
        },
        cssInjected: false,
        chartInstance: null,
        chartParams: {
            startMonth: new Date().getMonth(),
            endMonth: new Date().getMonth(),
            year1: new Date().getFullYear(),
            year2: new Date().getFullYear() - 1
        }
    };

    const MathUtils = {
        mean: arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
        stdDev: arr => {
            if (arr.length < 2) return 0;
            const m = MathUtils.mean(arr);
            const variance = arr.reduce((sq, n) => sq + Math.pow(n - m, 2), 0) / (arr.length - 1);
            return Math.sqrt(variance);
        },
        cv: arr => {
            const m = MathUtils.mean(arr);
            if (m === 0) return Infinity;
            return MathUtils.stdDev(arr) / m;
        },
        percentDiff: (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return ((current - previous) / previous) * 100;
        }
    };

    const Utils = {
        money: v => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`,
        moneyShort: v => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        formatPct: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
    };

    const Analyzer = {
        run() {
            if (!window.allTransactions || !window.allInventory) return;

            const now = new Date();
            const nowMs = now.getTime();
            const curMonth = now.getMonth();
            const curYear = now.getFullYear();
            const prevMonthDate = new Date(curYear, curMonth - 1, 1);

            const D30_MS = 30 * 86400000;
            const D60_MS = 60 * 86400000;
            
            const invMap = {};
            window.allInventory.forEach(inv => {
                invMap[inv.name] = { 
                    cost: Number(inv.price) || 0, 
                    stock: Number(inv.qty) || 0 
                };
            });

            let curSales = 0, curCogs = 0, prevSales = 0, prevCogs = 0;
            let itemStats = {};

            // 1. Pre-populate items from current inventory
            window.allInventory.forEach(inv => {
                itemStats[inv.name] = { 
                    totalProfit: 0, 
                    totalSales: 0, 
                    curQty: 0, 
                    prevQty: 0, 
                    weeklyQty: [0, 0, 0, 0],
                    salesQty30: 0,
                    salesQty60: 0,
                    lifetimeQty: 0
                };
            });

            // 2. Parse transactions ledger
            window.allTransactions.forEach(t => {
                if (!t.date || !t.type.includes('Sale')) return;

                const tDate = new Date(t.date);
                const tTime = tDate.getTime();
                const amt = Number(t.amount) || 0;
                let qty = Number(t.qty) || 0;
                const item = t.item;
                const isCosmetic = t.type.includes('Cosmetic');

                if (!itemStats[item]) {
                    itemStats[item] = { 
                        totalProfit: 0, 
                        totalSales: 0, 
                        curQty: 0, 
                        prevQty: 0, 
                        weeklyQty: [0, 0, 0, 0],
                        salesQty30: 0,
                        salesQty60: 0,
                        lifetimeQty: 0
                    };
                }

                let cost = isCosmetic ? ((Number(t.cost) || 0) * qty) : ((invMap[item]?.cost || 0) * qty);
                
                let isReturn = t.type.includes('Return');
                let finalAmt = isReturn ? -amt : amt;
                let finalCost = isReturn ? -cost : cost;
                let finalQty = isReturn ? -qty : qty;

                let isCurrentMonth = tDate.getFullYear() === curYear && tDate.getMonth() === curMonth;
                let isPrevMonth = tDate.getFullYear() === prevMonthDate.getFullYear() && tDate.getMonth() === prevMonthDate.getMonth();

                if (isCurrentMonth) {
                    curSales += finalAmt; curCogs += finalCost;
                } else if (isPrevMonth) {
                    prevSales += finalAmt; prevCogs += finalCost;
                }

                itemStats[item].totalProfit += (finalAmt - finalCost);
                itemStats[item].totalSales += finalAmt;
                itemStats[item].lifetimeQty += finalQty;

                if (isCurrentMonth) itemStats[item].curQty += finalQty;
                if (isPrevMonth) itemStats[item].prevQty += finalQty;

                const diffMs = nowMs - tTime;
                if (diffMs <= D30_MS) itemStats[item].salesQty30 += finalQty;
                if (diffMs <= D60_MS) itemStats[item].salesQty60 += finalQty;

                const diffDays = Math.floor(diffMs / 86400000);
                if (diffDays >= 0 && diffDays < 28) {
                    const weekIdx = Math.floor(diffDays / 7);
                    itemStats[item].weeklyQty[weekIdx] += finalQty;
                }
            });

            let curProfit = curSales - curCogs;
            let prevProfit = prevSales - prevCogs;
            STATE.mom = {
                curSales, curProfit, curMargin: curSales > 0 ? (curProfit/curSales)*100 : 0,
                prevSales, prevProfit, prevMargin: prevSales > 0 ? (prevProfit/prevSales)*100 : 0
            };

            // 3. ABC-XYZ Rank Analysis
            let sortedByProfit = Object.keys(itemStats)
                .map(k => ({ 
                    name: k, 
                    profit: itemStats[k].totalProfit, 
                    sales: itemStats[k].totalSales, 
                    weekly: itemStats[k].weeklyQty,
                    curQty: itemStats[k].curQty,
                    prevQty: itemStats[k].prevQty,
                    sales30: Math.max(0, itemStats[k].salesQty30),
                    sales60: Math.max(0, itemStats[k].salesQty60),
                    lifetimeQty: Math.max(0, itemStats[k].lifetimeQty)
                }))
                .sort((a, b) => b.profit - a.profit);

            let totalProfitPool = sortedByProfit.reduce((sum, item) => sum + Math.max(0, item.profit), 0);
            let cumulativeProfit = 0;

            // Health Tracking Buckets
            let criticalList = [];
            let overstockList = [];
            let optimalList = [];
            let stockoutList = [];
            let totalTrappedCapital = 0;
            let totalRevenueAtRisk = 0;
            let totalRunwayDaysSum = 0;
            let activeRunwayCount = 0;

            sortedByProfit.forEach(item => {
                if (item.profit > 0 && totalProfitPool > 0) {
                    cumulativeProfit += item.profit;
                    let pct = cumulativeProfit / totalProfitPool;
                    item.cumPct = pct * 100;
                    
                    if (pct <= 0.70) item.abc = 'A';
                    else if (pct <= 0.90) item.abc = 'B';
                    else item.abc = 'C';
                } else {
                    item.cumPct = 100;
                    item.abc = 'C';
                }

                let cv = MathUtils.cv(item.weekly);
                item.cvValue = cv;

                if (cv <= 0.3) item.xyz = 'X';
                else if (cv <= 0.8) item.xyz = 'Y';
                else item.xyz = 'Z';

                item.matrixClass = item.abc + item.xyz;
                item.stock = invMap[item.name]?.stock || 0;
                item.cost = invMap[item.name]?.cost || 0;
                item.stockValue = item.stock * item.cost;
                item.momQtyDiff = MathUtils.percentDiff(item.curQty, item.prevQty);

                // --- VELOCITY & RUNWAY LOGIC ---
                const vel30 = item.sales30 / 30;
                const vel60 = item.sales60 / 60;
                const dailyVelocity = vel30 > 0 ? (vel30 * 0.7 + vel60 * 0.3) : vel60;
                item.dailyVelocity = parseFloat(dailyVelocity.toFixed(2));

                let runwayDays = 0;
                if (dailyVelocity > 0) {
                    runwayDays = Math.round(item.stock / dailyVelocity);
                    totalRunwayDaysSum += Math.min(180, runwayDays);
                    activeRunwayCount++;
                } else {
                    runwayDays = item.stock > 0 ? 999 : 0;
                }
                item.runwayDays = runwayDays;

                // --- STOCK HEALTH CLASSIFICATION ---
                if (item.stock <= 0) {
                    item.health = 'stockout';
                    stockoutList.push(item);
                } else if (dailyVelocity > 0 && runwayDays <= 14) {
                    item.health = 'critical';
                    item.riskValue = Math.round(dailyVelocity * 30 * (item.sales > 0 && item.lifetimeQty > 0 ? (item.sales / item.lifetimeQty) : (item.cost * 1.3)));
                    totalRevenueAtRisk += item.riskValue;
                    criticalList.push(item);
                } else if ((dailyVelocity > 0 && runwayDays >= 90) || (item.stock >= 15 && dailyVelocity <= 0.05)) {
                    item.health = 'overstock';
                    item.trappedValue = item.stockValue;
                    totalTrappedCapital += item.stockValue;
                    overstockList.push(item);
                } else if (item.stock >= 10 && dailyVelocity === 0 && item.lifetimeQty === 0) {
                    item.health = 'overstock';
                    item.trappedValue = item.stockValue;
                    totalTrappedCapital += item.stockValue;
                    overstockList.push(item);
                } else {
                    item.health = 'optimal';
                    optimalList.push(item);
                }
            });

            criticalList.sort((a, b) => a.runwayDays - b.runwayDays);
            overstockList.sort((a, b) => b.trappedValue - a.trappedValue);

            const totalSkusCount = sortedByProfit.length || 1;
            STATE.stockHealth = {
                criticalList,
                overstockList,
                optimalList,
                stockoutList,
                totalTrappedCapital,
                revenueAtRisk: totalRevenueAtRisk,
                optimalPct: Math.round((optimalList.length / totalSkusCount) * 100),
                avgRunwayDays: activeRunwayCount > 0 ? Math.round(totalRunwayDaysSum / activeRunwayCount) : 0
            };

            STATE.abcXyz.matrixCounts = { AX:0, AY:0, AZ:0, BX:0, BY:0, BZ:0, CX:0, CY:0, CZ:0 };
            STATE.abcXyz.skus = sortedByProfit;

            sortedByProfit.forEach(item => {
                if(STATE.abcXyz.matrixCounts[item.matrixClass] !== undefined) {
                    STATE.abcXyz.matrixCounts[item.matrixClass]++;
                }
            });
        }
    };

    const UI = {
        injectCSS() {
            if (STATE.cssInjected) return;
            const style = document.createElement('style');
            style.innerHTML = `
                .erp-container { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
                .erp-card { background: #ffffff; border-radius: 16px; border: 1px solid rgba(226, 232, 240, 0.9); box-shadow: 0 2px 10px -2px rgba(0,0,0,0.03); overflow: hidden; display: flex; flex-direction: column; }
                .dark-mode .erp-card { background: #14151c; border-color: rgba(39, 39, 42, 0.9); }
                .erp-header { padding: 16px 20px; border-bottom: 1px solid rgba(241, 245, 249, 1); background: #f8fafc; }
                .dark-mode .erp-header { border-color: #27272a; background: #1a1b24; }
                .erp-title { font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; display: flex; align-items: center; gap: 8px;}
                .dark-mode .erp-title { color: #a1a1aa; }
                .matrix-grid { display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 6px; padding: 16px; background: #f8fafc; }
                .dark-mode .matrix-grid { background: #0f1016; }
                .matrix-cell { padding: 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; text-align: center; border: 1px solid rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 72px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
                .matrix-cell:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); filter: brightness(0.97); z-index: 10; }
                .dark-mode .matrix-cell:hover { filter: brightness(1.15); }
                .matrix-header { font-weight: 700; color: #64748b; background: transparent; border: none; font-size: 0.75rem; text-transform: uppercase; cursor: default; }
                .matrix-header:hover { transform: none; box-shadow: none; filter: none; }
                .dark-mode .matrix-header { color: #94a3b8; }
                .cell-AX { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
                .dark-mode .cell-AX { background: #14532d; color: #86efac; border-color: #166534; }
                .cell-AY, .cell-BX { background: #fef9c3; color: #854d0e; border-color: #fef08a; }
                .dark-mode .cell-AY, .dark-mode .cell-BX { background: #713f12; color: #fde047; border-color: #854d0e; }
                .cell-AZ, .cell-BZ, .cell-CX { background: #ffedd5; color: #9a3412; border-color: #fed7aa; }
                .dark-mode .cell-AZ, .dark-mode .cell-BZ, .dark-mode .cell-CX { background: #7c2d12; color: #fdba74; border-color: #9a3412; }
                .cell-CY, .cell-CZ { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
                .dark-mode .cell-CY, .dark-mode .cell-CZ { background: #7f1d1d; color: #fca5a5; border-color: #991b1b; }
                .matrix-sub { font-size: 0.7rem; font-weight: 500; opacity: 0.85; margin-top: 3px; }
                .erp-table { width: 100%; text-align: left; border-collapse: collapse; }
                .erp-table th { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
                .dark-mode .erp-table th { color: #94a3b8; border-color: #27272a; }
                .erp-table td { font-size: 0.8125rem; color: #1e293b; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
                .dark-mode .erp-table td { color: #cbd5e1; border-color: #1f2029; }
                .erp-table tr:hover td { background: #f8fafc; }
                .dark-mode .erp-table tr:hover td { background: #1a1b24; }
                .stat-trend.up { color: #10b981; }
                .stat-trend.down { color: #ef4444; }
                .badge-erp { padding: 4px 8px; border-radius: 6px; font-size: 0.68rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; }
                .erp-input { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 5px 10px; font-size: 0.78rem; font-weight: 600; color: #334155; outline: none; transition: border-color 0.2s;}
                .dark-mode .erp-input { background: #1e2029; border-color: #3f3f46; color: #f4f4f5;}
                .erp-input:focus { border-color: #3b82f6; }
            `;
            document.head.appendChild(style);
            STATE.cssInjected = true;
        },

        calculateComparativeMetrics() {
            const p = STATE.chartParams;
            const invMap = {};
            window.allInventory.forEach(inv => invMap[inv.name] = { cost: Number(inv.price) || 0, stock: Number(inv.qty) || 0 });

            let y1 = { revenue: 0, cogs: 0, profit: 0, margin: 0, qty: 0, count: 0, aov: 0 };
            let y2 = { revenue: 0, cogs: 0, profit: 0, margin: 0, qty: 0, count: 0, aov: 0 };

            window.allTransactions.forEach(t => {
                if (!t.date || !t.type.includes('Sale')) return;
                const d = new Date(t.date);
                const m = d.getMonth();
                const y = d.getFullYear();

                if (m >= parseInt(p.startMonth) && m <= parseInt(p.endMonth)) {
                    const isReturn = t.type.includes('Return');
                    const amt = Number(t.amount) || 0;
                    let qty = Number(t.qty) || 0;
                    const item = t.item;
                    const isCosmetic = t.type.includes('Cosmetic');
                    const cost = isCosmetic ? ((Number(t.cost) || 0) * qty) : ((invMap[item]?.cost || 0) * qty);

                    const finalAmt = isReturn ? -amt : amt;
                    const finalCost = isReturn ? -cost : cost;
                    const finalQty = isReturn ? -qty : qty;

                    if (y === parseInt(p.year1)) {
                        y1.revenue += finalAmt;
                        y1.cogs += finalCost;
                        y1.qty += finalQty;
                        y1.count++;
                    } else if (y === parseInt(p.year2)) {
                        y2.revenue += finalAmt;
                        y2.cogs += finalCost;
                        y2.qty += finalQty;
                        y2.count++;
                    }
                }
            });

            y1.profit = y1.revenue - y1.cogs;
            y1.margin = y1.revenue > 0 ? (y1.profit / y1.revenue) * 100 : 0;
            y1.aov = y1.count > 0 ? y1.revenue / y1.count : 0;

            y2.profit = y2.revenue - y2.cogs;
            y2.margin = y2.revenue > 0 ? (y2.profit / y2.revenue) * 100 : 0;
            y2.aov = y2.count > 0 ? y2.revenue / y2.count : 0;

            return { y1, y2 };
        },

        buildComparativeTableRows() {
            const { y1, y2 } = this.calculateComparativeMetrics();
            
            const rows = [
                {
                    name: "Gross Revenue",
                    v1: `₹${y1.revenue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    v2: `₹${y2.revenue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    diff: y1.revenue - y2.revenue,
                    pct: MathUtils.percentDiff(y1.revenue, y2.revenue),
                    isCurrency: true
                },
                {
                    name: "Cost of Goods (COGS)",
                    v1: `₹${y1.cogs.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    v2: `₹${y2.cogs.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    diff: y1.cogs - y2.cogs,
                    pct: MathUtils.percentDiff(y1.cogs, y2.cogs),
                    isCurrency: true,
                    lowerIsBetter: true
                },
                {
                    name: "Net Profit",
                    v1: `₹${y1.profit.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    v2: `₹${y2.profit.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    diff: y1.profit - y2.profit,
                    pct: MathUtils.percentDiff(y1.profit, y2.profit),
                    isCurrency: true
                },
                {
                    name: "Gross Margin",
                    v1: `${y1.margin.toFixed(2)}%`,
                    v2: `${y2.margin.toFixed(2)}%`,
                    diff: y1.margin - y2.margin,
                    pct: y1.margin - y2.margin, 
                    isMargin: true
                },
                {
                    name: "Quantity Sold",
                    v1: y1.qty.toLocaleString('en-IN'),
                    v2: y2.qty.toLocaleString('en-IN'),
                    diff: y1.qty - y2.qty,
                    pct: MathUtils.percentDiff(y1.qty, y2.qty)
                },
                {
                    name: "Transactions Count",
                    v1: y1.count.toLocaleString('en-IN'),
                    v2: y2.count.toLocaleString('en-IN'),
                    diff: y1.count - y2.count,
                    pct: MathUtils.percentDiff(y1.count, y2.count)
                },
                {
                    name: "Average Order Value (AOV)",
                    v1: `₹${y1.aov.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    v2: `₹${y2.aov.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    diff: y1.aov - y2.aov,
                    pct: MathUtils.percentDiff(y1.aov, y2.aov),
                    isCurrency: true
                }
            ];

            return rows.map(r => {
                let diffClass = "text-slate-500 font-medium";
                let pctSign = r.diff > 0 ? "+" : "";
                let deltaText = "";

                if (r.diff !== 0) {
                    const isPositiveBetter = r.lowerIsBetter ? r.diff < 0 : r.diff > 0;
                    diffClass = isPositiveBetter ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold";
                }

                if (r.isMargin) {
                    deltaText = `<span class="${diffClass}">${pctSign}${r.diff.toFixed(2)} pp</span>`;
                } else {
                    const valText = r.isCurrency ? `₹${Math.abs(r.diff).toLocaleString('en-IN', {maximumFractionDigits:2})}` : Math.abs(r.diff).toLocaleString('en-IN');
                    const pctText = isFinite(r.pct) ? ` (${pctSign}${r.pct.toFixed(1)}%)` : "";
                    deltaText = `<span class="${diffClass}">${r.diff < 0 ? '-' : (r.diff > 0 ? '+' : '')}${valText}${pctText}</span>`;
                }

                return `
                <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td class="px-5 py-3.5 font-semibold text-slate-700 dark:text-zinc-300">${r.name}</td>
                    <td class="px-5 py-3.5 text-right font-medium">${r.v1}</td>
                    <td class="px-5 py-3.5 text-right font-medium">${r.v2}</td>
                    <td class="px-5 py-3.5 text-right">${deltaText}</td>
                </tr>`;
            }).join('');
        },

        drawChart() {
            if (!window.Chart) return;

            const p = STATE.chartParams;
            const isDaily = parseInt(p.startMonth) === parseInt(p.endMonth);

            let labels = [];
            let data1 = [];
            let data2 = [];

            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            if (isDaily) {
                const daysInMonth = new Date(p.year1, parseInt(p.startMonth) + 1, 0).getDate();
                for (let i = 1; i <= daysInMonth; i++) {
                    labels.push(`${i} ${monthNames[p.startMonth]}`);
                    data1.push(0);
                    data2.push(0);
                }
            } else {
                for (let i = parseInt(p.startMonth); i <= parseInt(p.endMonth); i++) {
                    labels.push(monthNames[i]);
                    data1.push(0);
                    data2.push(0);
                }
            }

            window.allTransactions.forEach(t => {
                if (!t.date || !t.type.includes('Sale')) return;
                let d = new Date(t.date);
                let m = d.getMonth();
                let y = d.getFullYear();
                let day = d.getDate();
                
                let isReturn = t.type.includes('Return');
                let amt = Number(t.amount) || 0;
                if (isReturn) amt = -amt;

                if (m >= parseInt(p.startMonth) && m <= parseInt(p.endMonth)) {
                    if (isDaily) {
                        if (y === parseInt(p.year1)) data1[day - 1] += amt;
                        if (y === parseInt(p.year2)) data2[day - 1] += amt;
                    } else {
                        let idx = m - parseInt(p.startMonth);
                        if (y === parseInt(p.year1)) data1[idx] += amt;
                        if (y === parseInt(p.year2)) data2[idx] += amt;
                    }
                }
            });

            const ctx = document.getElementById('trendComparativeChart');
            if (!ctx) return;
            
            if (STATE.chartInstance) STATE.chartInstance.destroy();

            const isDark = document.body.classList.contains('dark-mode');
            const textColor = isDark ? '#cbd5e1' : '#475569';
            const gridColor = isDark ? '#334155' : '#f1f5f9';

            STATE.chartInstance = new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: `${p.year1} Revenue (₹)`,
                            data: data1,
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                            borderWidth: 2.5,
                            tension: 0.35,
                            fill: true,
                            pointRadius: 3
                        },
                        {
                            label: `${p.year2} Revenue (₹)`,
                            data: data2,
                            borderColor: '#94a3b8',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            tension: 0.35,
                            fill: false,
                            pointRadius: 3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: textColor, font: { family: 'Plus Jakarta Sans', weight: 600 } } } },
                    scales: {
                        x: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false } },
                        y: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false }, beginAtZero: true }
                    },
                    interaction: { mode: 'index', intersect: false }
                }
            });
        },

        render(containerId) {
            this.injectCSS();
            const el = document.getElementById(containerId);
            if (!el) return;

            if (!window.allTransactions || !window.allInventory) {
                el.innerHTML = `<div class="p-8 text-center text-slate-500 font-medium">Initializing ERP Matrix & Velocity Analytics...</div>`;
                return;
            }

            Analyzer.run();

            let salesDiff = MathUtils.percentDiff(STATE.mom.curSales, STATE.mom.prevSales);
            let profitDiff = MathUtils.percentDiff(STATE.mom.curProfit, STATE.mom.prevProfit);
            let marginDiff = STATE.mom.curMargin - STATE.mom.prevMargin;

            const formatTrend = (val) => {
                if (!isFinite(val)) return `<span class="text-xs font-bold text-slate-400 ml-2">N/A</span>`;
                let isUp = val > 0;
                let icon = isUp ? 'fa-arrow-up' : (val < 0 ? 'fa-arrow-down' : 'fa-minus');
                let colorClass = isUp ? 'stat-trend up' : (val < 0 ? 'stat-trend down' : 'text-slate-400');
                return `<span class="text-xs font-bold ${colorClass} ml-2"><i class="fa-solid ${icon}"></i> ${Math.abs(val).toFixed(1)}%</span>`;
            };

            const skus = STATE.abcXyz.skus;
            const health = STATE.stockHealth;

            // Health Monitor Rows
            let criticalRowsHtml = health.criticalList.slice(0, 5).map(i => {
                const runwayBadge = i.runwayDays <= 7 
                    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 animate-pulse">${i.runwayDays}d left</span>`
                    : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">${i.runwayDays}d left</span>`;

                return `
                <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td class="font-bold text-slate-900 dark:text-white">${i.name}</td>
                    <td class="text-right font-semibold text-rose-600 dark:text-rose-400">${i.stock}</td>
                    <td class="text-right font-medium text-slate-600 dark:text-zinc-300">${i.dailyVelocity}/day</td>
                    <td class="text-right">${runwayBadge}</td>
                    <td class="text-right text-xs font-bold text-amber-600 dark:text-amber-400">Order ~${Math.round(i.dailyVelocity * 25)} units</td>
                </tr>`;
            }).join('') || `<tr><td colspan="5" class="text-center py-5 text-xs text-slate-400">🟢 No imminent stockout risks detected. Inventory buffer is healthy!</td></tr>`;

            let overstockRowsHtml = health.overstockList.slice(0, 5).map(i => {
                const runwayDisplay = i.runwayDays >= 999 ? 'No sales' : `${i.runwayDays} days`;
                return `
                <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td class="font-bold text-slate-900 dark:text-white">${i.name}</td>
                    <td class="text-right font-semibold text-purple-600 dark:text-purple-400">${i.stock}</td>
                    <td class="text-right font-medium">${runwayDisplay}</td>
                    <td class="text-right font-bold text-slate-900 dark:text-white">₹${i.trappedValue.toLocaleString('en-IN', {maximumFractionDigits:0})}</td>
                    <td class="text-right"><span class="badge-erp bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">Discount / Bundle</span></td>
                </tr>`;
            }).join('') || `<tr><td colspan="5" class="text-center py-5 text-xs text-slate-400">✨ Catalog is lean. No dead capital trapped in overstock!</td></tr>`;

            // Matrix specific recommendations
            let axHtml = skus.filter(i => i.matrixClass === 'AX').slice(0, 5).map(i => `
                <tr>
                    <td class="font-bold">${i.name}</td>
                    <td class="text-right text-success font-bold">${Utils.moneyShort(i.profit)}</td>
                    <td class="text-right">${i.stock} units</td>
                    <td class="text-right"><span class="badge-erp bg-success text-white">Auto-Reorder</span></td>
                </tr>
            `).join('') || `<tr><td colspan="4" class="text-center py-4 text-slate-400">No AX items detected.</td></tr>`;

            let azHtml = skus.filter(i => ['AZ', 'BZ'].includes(i.matrixClass)).slice(0, 5).map(i => `
                <tr>
                    <td class="font-bold">${i.name} <span class="text-[10px] bg-slate-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded ml-1 font-bold">${i.matrixClass}</span></td>
                    <td class="text-right text-warning font-bold">${Utils.moneyShort(i.profit)}</td>
                    <td class="text-right">${i.stock} units</td>
                    <td class="text-right"><span class="badge-erp bg-warning text-white">Review Buffer</span></td>
                </tr>
            `).join('') || `<tr><td colspan="4" class="text-center py-4 text-slate-400">No erratic demand items found.</td></tr>`;

            let czHtml = skus.filter(i => ['CZ', 'CY'].includes(i.matrixClass) && i.stock > 0).slice(0, 5).map(i => `
                <tr>
                    <td class="font-bold">${i.name} <span class="text-[10px] bg-slate-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded ml-1 font-bold">${i.matrixClass}</span></td>
                    <td class="text-right text-danger">${Utils.moneyShort(i.profit)}</td>
                    <td class="text-right">${i.stock} units</td>
                    <td class="text-right"><span class="badge-erp bg-danger text-white">Liquidate</span></td>
                </tr>
            `).join('') || `<tr><td colspan="4" class="text-center py-4 text-slate-400">No low-margin items requiring liquidation.</td></tr>`;

            let deepHtml = skus.map(i => {
                let badgeClass = 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300';
                if(i.matrixClass === 'AX') badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
                if(['AZ','BZ'].includes(i.matrixClass)) badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
                if(['CZ','CY'].includes(i.matrixClass)) badgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';

                let cvDisplay = i.cvValue === Infinity ? 'INF' : i.cvValue.toFixed(2);
                let velocityDisplay = i.dailyVelocity > 0 ? `${i.dailyVelocity}/d` : '0/d';
                let runwayDisplay = i.runwayDays >= 999 ? '&infin;' : `${i.runwayDays}d`;
                
                return `
                <tr>
                    <td class="font-bold text-slate-900 dark:text-white">${i.name}</td>
                    <td class="text-center"><span class="badge-erp ${badgeClass}">${i.matrixClass}</span></td>
                    <td class="text-right font-semibold">${i.stock}</td>
                    <td class="text-right font-medium text-slate-600 dark:text-zinc-400">${velocityDisplay}</td>
                    <td class="text-right font-semibold">${runwayDisplay}</td>
                    <td class="text-right">${i.curQty} <span class="text-[10px] text-slate-400">(${i.prevQty})</span></td>
                    <td class="text-right">${formatTrend(i.momQtyDiff)}</td>
                    <td class="text-right font-bold text-emerald-600 dark:text-emerald-400">${Utils.moneyShort(i.profit)}</td>
                    <td class="text-right text-xs text-slate-500">${i.cumPct.toFixed(1)}%</td>
                    <td class="text-right text-xs text-slate-500">${cvDisplay}</td>
                </tr>`;
            }).join('');

            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const monthOptions = (selected) => monthNames.map((m, i) => `<option value="${i}" ${i === parseInt(selected) ? 'selected' : ''}>${m}</option>`).join('');

            let years = new Set([STATE.chartParams.year1, STATE.chartParams.year2]);
            window.allTransactions.forEach(t => { if(t.date) years.add(new Date(t.date).getFullYear()); });
            let yearArr = Array.from(years).sort((a,b) => b-a);
            const yearOptions = (selected) => yearArr.map(y => `<option value="${y}" ${y === parseInt(selected) ? 'selected' : ''}>${y}</option>`).join('');

            el.innerHTML = `
                <div class="erp-container space-y-6">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <h2 class="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Trend Engine & Stock Intelligence</h2>
                            <p class="text-xs text-slate-500 dark:text-zinc-400 font-medium">Predictive velocity forecasting, low-stock risk & overstocked working capital</p>
                        </div>
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                            <i class="fa-solid fa-bolt-lightning text-xs"></i> Real-time Run-Rate Analysis
                        </span>
                    </div>

                    <!-- 1. EXECUTIVE OVERVIEW: STOCK HEALTH & VELOCITY KPI CARDS -->
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <div class="erp-card p-4.5 border-l-4 border-l-rose-500">
                            <span class="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Immediate Stockout Risk</span>
                            <div class="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 mt-1.5">
                                ${health.criticalList.length} <span class="text-xs font-semibold text-slate-500 dark:text-zinc-400">SKUs</span>
                            </div>
                            <div class="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-1 truncate">
                                ~₹${health.revenueAtRisk.toLocaleString('en-IN')} revenue at risk
                            </div>
                        </div>

                        <div class="erp-card p-4.5 border-l-4 border-l-purple-500">
                            <span class="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Overstocked Trapped Capital</span>
                            <div class="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-1.5">
                                ₹${health.totalTrappedCapital.toLocaleString('en-IN', {maximumFractionDigits:0})}
                            </div>
                            <div class="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-1">
                                Across ${health.overstockList.length} stagnant SKUs
                            </div>
                        </div>

                        <div class="erp-card p-4.5 border-l-4 border-l-emerald-500">
                            <span class="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Optimal Inventory Balance</span>
                            <div class="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5">
                                ${health.optimalPct}%
                            </div>
                            <div class="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-1">
                                ${health.optimalList.length} SKUs in balanced runway
                            </div>
                        </div>

                        <div class="erp-card p-4.5 border-l-4 border-l-blue-500">
                            <span class="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Portfolio Avg. Runway</span>
                            <div class="text-2xl sm:text-3xl font-black text-primary mt-1.5">
                                ${health.avgRunwayDays} <span class="text-xs font-semibold text-slate-500 dark:text-zinc-400">Days</span>
                            </div>
                            <div class="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-1">
                                Weighted supply replenishment
                            </div>
                        </div>
                    </div>

                    <!-- 2. SIDE-BY-SIDE INTELLIGENCE MONITORS -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <!-- Critical Low Stock Monitor -->
                        <div class="erp-card">
                            <div class="erp-header flex justify-between items-center">
                                <div class="erp-title text-rose-600 dark:text-rose-400">
                                    <i class="fa-solid fa-triangle-exclamation text-rose-500"></i> Stockout Urgency Monitor (&le; 14 Days)
                                </div>
                                <span class="text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full">
                                    ${health.criticalList.length} items
                                </span>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="erp-table text-xs">
                                    <thead>
                                        <tr>
                                            <th>Product SKU</th>
                                            <th class="text-right">Stock</th>
                                            <th class="text-right">Velocity</th>
                                            <th class="text-right">Runway</th>
                                            <th class="text-right">Reorder Recommendation</th>
                                        </tr>
                                    </thead>
                                    <tbody>${criticalRowsHtml}</tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Overstock Capital Watchlist -->
                        <div class="erp-card">
                            <div class="erp-header flex justify-between items-center">
                                <div class="erp-title text-purple-600 dark:text-purple-400">
                                    <i class="fa-solid fa-boxes-packing text-purple-500"></i> Overstock & Trapped Capital Watchlist
                                </div>
                                <span class="text-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full">
                                    ${health.overstockList.length} items
                                </span>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="erp-table text-xs">
                                    <thead>
                                        <tr>
                                            <th>Product SKU</th>
                                            <th class="text-right">Stock</th>
                                            <th class="text-right">Runway</th>
                                            <th class="text-right">Trapped Capital</th>
                                            <th class="text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>${overstockRowsHtml}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- 3. MONTH-OVER-MONTH COMMERCIAL HIGHLIGHTS -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="erp-card p-5">
                            <div class="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Current Month Sales</div>
                            <div class="text-3xl font-black text-slate-900 dark:text-white flex items-center">
                                ${Utils.moneyShort(STATE.mom.curSales)} 
                                ${formatTrend(salesDiff)}
                            </div>
                            <div class="text-xs text-slate-400 mt-2 border-t border-slate-100 dark:border-zinc-800 pt-2 font-medium">Prev: ${Utils.moneyShort(STATE.mom.prevSales)}</div>
                        </div>
                        <div class="erp-card p-5 border-t-4 border-t-primary">
                            <div class="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Current Month Profit</div>
                            <div class="text-3xl font-black text-slate-900 dark:text-white flex items-center">
                                ${Utils.moneyShort(STATE.mom.curProfit)}
                                ${formatTrend(profitDiff)}
                            </div>
                            <div class="text-xs text-slate-400 mt-2 border-t border-slate-100 dark:border-zinc-800 pt-2 font-medium">Prev: ${Utils.moneyShort(STATE.mom.prevProfit)}</div>
                        </div>
                        <div class="erp-card p-5">
                            <div class="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Operating Gross Margin</div>
                            <div class="text-3xl font-black text-amber-500 flex items-center">
                                ${STATE.mom.curMargin.toFixed(1)}%
                                ${formatTrend(marginDiff)}
                            </div>
                            <div class="text-xs text-slate-400 mt-2 border-t border-slate-100 dark:border-zinc-800 pt-2 font-medium">Prev: ${STATE.mom.prevMargin.toFixed(1)}%</div>
                        </div>
                    </div>

                    <!-- 4. COMPARATIVE TRAJECTORY WITH CHART & COMPARISON TABLE -->
                    <div class="erp-card">
                        <div class="erp-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h3 class="erp-title"><i class="fa-solid fa-chart-line text-blue-500"></i> Comparative Trajectory</h3>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <select id="tc-start" class="erp-input" onchange="TrendEngine.updateChartParams()">${monthOptions(STATE.chartParams.startMonth)}</select>
                                <span class="text-xs text-slate-400 font-bold uppercase">to</span>
                                <select id="tc-end" class="erp-input" onchange="TrendEngine.updateChartParams()">${monthOptions(STATE.chartParams.endMonth)}</select>
                                <div class="w-px h-5 bg-slate-300 dark:bg-zinc-700 mx-1"></div>
                                <select id="tc-y1" class="erp-input" onchange="TrendEngine.updateChartParams()">${yearOptions(STATE.chartParams.year1)}</select>
                                <span class="text-xs text-slate-400 font-bold uppercase">vs</span>
                                <select id="tc-y2" class="erp-input" onchange="TrendEngine.updateChartParams()">${yearOptions(STATE.chartParams.year2)}</select>
                            </div>
                        </div>
                        <div class="p-5 relative h-80 w-full">
                            <canvas id="trendComparativeChart"></canvas>
                        </div>
                        
                        <div class="border-t border-slate-100 dark:border-zinc-800 p-5 bg-slate-50/50 dark:bg-zinc-900/40">
                            <h4 class="text-xs font-bold uppercase text-slate-400 tracking-wider mb-4"><i class="fa-solid fa-table-columns mr-1"></i> Side-by-Side Trajectory Overview</h4>
                            <div class="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                                <table class="erp-table">
                                    <thead class="bg-slate-50 dark:bg-zinc-800/80">
                                        <tr>
                                            <th class="px-5 py-3 text-left">Trajectory Metric</th>
                                            <th class="px-5 py-3 text-right" id="traj-header-y1">${STATE.chartParams.year1}</th>
                                            <th class="px-5 py-3 text-right" id="traj-header-y2">${STATE.chartParams.year2}</th>
                                            <th class="px-5 py-3 text-right">Variance Shift</th>
                                        </tr>
                                    </thead>
                                    <tbody id="trajectory-comparison-tbody" class="divide-y divide-slate-100 dark:divide-zinc-800/60">
                                        ${this.buildComparativeTableRows()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- 5. 9-CELL ABC-XYZ MATRIX -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="erp-card h-full">
                            <div class="erp-header">
                                <div class="erp-title"><i class="fa-solid fa-border-all text-primary"></i> Automated ABC-XYZ Velocity Matrix</div>
                                <p class="text-xs text-slate-400 mt-1 font-normal">X-Axis: Velocity Predictability (CV) | Y-Axis: Profit Contribution (Click any cell to inspect SKUs)</p>
                            </div>
                            <div class="matrix-grid rounded-b-xl flex-1">
                                <div class="matrix-cell matrix-header border-none"></div>
                                <div class="matrix-cell matrix-header border-none">X <span class="matrix-sub lowercase font-normal">(Stable/Fast)</span></div>
                                <div class="matrix-cell matrix-header border-none">Y <span class="matrix-sub lowercase font-normal">(Fluctuating)</span></div>
                                <div class="matrix-cell matrix-header border-none">Z <span class="matrix-sub lowercase font-normal">(Erratic/Slow)</span></div>
                                
                                <div class="matrix-cell matrix-header">A <span class="matrix-sub lowercase font-normal">(Top 70%)</span></div>
                                <div class="matrix-cell cell-AX" onclick="TrendEngine.showMatrixDetails('AX')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.AX}</div>
                                    <div class="matrix-sub uppercase font-bold">Core Engines</div>
                                </div>
                                <div class="matrix-cell cell-AY" onclick="TrendEngine.showMatrixDetails('AY')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.AY}</div>
                                    <div class="matrix-sub uppercase font-bold">High Seasonal</div>
                                </div>
                                <div class="matrix-cell cell-AZ" onclick="TrendEngine.showMatrixDetails('AZ')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.AZ}</div>
                                    <div class="matrix-sub uppercase font-bold">Capital Risks</div>
                                </div>

                                <div class="matrix-cell matrix-header">B <span class="matrix-sub lowercase font-normal">(Next 20%)</span></div>
                                <div class="matrix-cell cell-BX" onclick="TrendEngine.showMatrixDetails('BX')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.BX}</div>
                                    <div class="matrix-sub uppercase font-bold">Steady Sellers</div>
                                </div>
                                <div class="matrix-cell cell-BY" onclick="TrendEngine.showMatrixDetails('BY')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.BY}</div>
                                    <div class="matrix-sub uppercase font-bold">Med Fluctuating</div>
                                </div>
                                <div class="matrix-cell cell-BZ" onclick="TrendEngine.showMatrixDetails('BZ')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.BZ}</div>
                                    <div class="matrix-sub uppercase font-bold">Slow Burners</div>
                                </div>

                                <div class="matrix-cell matrix-header">C <span class="matrix-sub lowercase font-normal">(Bottom 10%)</span></div>
                                <div class="matrix-cell cell-CX" onclick="TrendEngine.showMatrixDetails('CX')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.CX}</div>
                                    <div class="matrix-sub uppercase font-bold">Cheap / Fast</div>
                                </div>
                                <div class="matrix-cell cell-CY" onclick="TrendEngine.showMatrixDetails('CY')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.CY}</div>
                                    <div class="matrix-sub uppercase font-bold">Low Seasonal</div>
                                </div>
                                <div class="matrix-cell cell-CZ" onclick="TrendEngine.showMatrixDetails('CZ')">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.CZ}</div>
                                    <div class="matrix-sub uppercase font-bold">Dead Stock</div>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-col gap-6">
                            <div class="erp-card">
                                <div class="erp-header flex justify-between items-center">
                                    <div class="erp-title"><i class="fa-solid fa-gears text-success"></i> AX: Core Engines</div>
                                    <span class="text-xs text-slate-400 font-medium">Predictable & Highly Profitable</span>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="erp-table">
                                        <thead><tr><th>SKU</th><th class="text-right">Profit</th><th class="text-right">Stock</th><th class="text-right">Action</th></tr></thead>
                                        <tbody>${axHtml}</tbody>
                                    </table>
                                </div>
                            </div>

                            <div class="erp-card">
                                <div class="erp-header flex justify-between items-center">
                                    <div class="erp-title"><i class="fa-solid fa-triangle-exclamation text-warning"></i> AZ/BZ: Demand Volatility</div>
                                    <span class="text-xs text-slate-400 font-medium">High Profit but Erratic Demand</span>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="erp-table">
                                        <thead><tr><th>SKU</th><th class="text-right">Profit</th><th class="text-right">Stock</th><th class="text-right">Action</th></tr></thead>
                                        <tbody>${azHtml}</tbody>
                                    </table>
                                </div>
                            </div>

                            <div class="erp-card">
                                <div class="erp-header flex justify-between items-center">
                                    <div class="erp-title"><i class="fa-solid fa-tags text-danger"></i> CY/CZ: Liquidation Triggers</div>
                                    <span class="text-xs text-slate-400 font-medium">Low Value, Slow/Erratic Moving</span>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="erp-table">
                                        <thead><tr><th>SKU</th><th class="text-right">Profit</th><th class="text-right">Stock</th><th class="text-right">Action</th></tr></thead>
                                        <tbody>${czHtml}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- DYNAMIC CATEGORIZED SKU DETAILS CONTAINER -->
                    <div id="matrix-details-panel">
                        <div class="p-6 text-center text-slate-400 dark:text-zinc-500 bg-white dark:bg-[#14151c] rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800">
                            <i class="fa-solid fa-hand-pointer text-xl text-slate-400 mb-2 block"></i>
                            <span class="text-xs font-semibold">Click on any matrix cell above to expand the SKU list and analyze stock velocity.</span>
                        </div>
                    </div>

                    <!-- 6. MASTER SKU DEEP DIVE TABLE -->
                    <div class="erp-card">
                        <div class="erp-header">
                            <div class="erp-title"><i class="fa-solid fa-magnifying-glass-chart text-purple-600"></i> Master SKU Velocity & Profit Deep Dive</div>
                            <p class="text-xs text-slate-400 mt-1 font-normal">Complete inventory breakdown with daily velocity, runway days, variance, and cumulative profit contribution.</p>
                        </div>
                        <div class="overflow-x-auto max-h-[520px]">
                            <table class="erp-table relative">
                                <thead class="sticky top-0 bg-slate-50 dark:bg-zinc-850 shadow-sm z-10">
                                    <tr>
                                        <th>Product SKU</th>
                                        <th class="text-center">Matrix</th>
                                        <th class="text-right">Current Stock</th>
                                        <th class="text-right">Daily Velocity</th>
                                        <th class="text-right">Runway</th>
                                        <th class="text-right">Cur. Qty (Prev)</th>
                                        <th class="text-right">MoM Vol Trend</th>
                                        <th class="text-right">Lifetime Profit</th>
                                        <th class="text-right">Cum. %</th>
                                        <th class="text-right">CV Ratio</th>
                                    </tr>
                                </thead>
                                <tbody>${deepHtml}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            this.drawChart();
        }
    };

    return {
        init(db) { 
            if (!db) return; 
        }, 
        updateChartParams() {
            let start = parseInt(document.getElementById('tc-start').value);
            let end = parseInt(document.getElementById('tc-end').value);
            if (start > end) {
                document.getElementById('tc-end').value = start;
                end = start;
            }
            STATE.chartParams.startMonth = start;
            STATE.chartParams.endMonth = end;
            STATE.chartParams.year1 = parseInt(document.getElementById('tc-y1').value);
            STATE.chartParams.year2 = parseInt(document.getElementById('tc-y2').value);
            
            UI.drawChart();
            
            const tbody = document.getElementById('trajectory-comparison-tbody');
            if (tbody) {
                tbody.innerHTML = UI.buildComparativeTableRows();
            }
            
            const h1 = document.getElementById('traj-header-y1');
            const h2 = document.getElementById('traj-header-y2');
            if (h1) h1.innerText = STATE.chartParams.year1;
            if (h2) h2.innerText = STATE.chartParams.year2;
        },
        showMatrixDetails(matrixClass) {
            const container = document.getElementById('matrix-details-panel');
            if (!container) return;

            document.querySelectorAll('.matrix-cell').forEach(cell => {
                cell.classList.remove('ring-4', 'ring-primary', 'scale-105', 'z-10');
            });
            const clickedCell = document.querySelector(`.cell-${matrixClass}`);
            if (clickedCell) {
                clickedCell.classList.add('ring-4', 'ring-primary', 'scale-105', 'z-10');
            }

            const items = STATE.abcXyz.skus.filter(i => i.matrixClass === matrixClass);
            
            if (items.length === 0) {
                container.innerHTML = `
                    <div class="erp-card border border-primary/25 bg-primary/5 p-6 text-center text-slate-500 dark:text-zinc-400">
                        No product items are currently classified in the matrix as <strong class="text-primary font-bold">${matrixClass}</strong>.
                    </div>`;
                return;
            }

            let rows = items.map(i => {
                let volTrend = i.momQtyDiff;
                const isUp = volTrend > 0;
                let volTrendHtml = isFinite(volTrend) 
                    ? `<span class="${isUp ? 'text-emerald-600' : 'text-rose-600'} font-semibold">${isUp ? '▲' : '▼'} ${Math.abs(volTrend).toFixed(1)}%</span>`
                    : '<span class="text-slate-400">-</span>';

                let runwayText = i.runwayDays >= 999 ? '&infin;' : `${i.runwayDays}d`;

                return `
                <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td class="px-5 py-3 font-semibold text-slate-900 dark:text-white">${i.name}</td>
                    <td class="px-5 py-3 text-right font-medium">${i.stock}</td>
                    <td class="px-5 py-3 text-right font-medium text-slate-600 dark:text-zinc-300">${i.dailyVelocity}/day</td>
                    <td class="px-5 py-3 text-right font-semibold">${runwayText}</td>
                    <td class="px-5 py-3 text-right text-success font-semibold">₹${i.profit.toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
                    <td class="px-5 py-3 text-right">${i.curQty}</td>
                    <td class="px-5 py-3 text-right">${volTrendHtml}</td>
                    <td class="px-5 py-3 text-right text-xs text-slate-500">${i.cvValue === Infinity ? 'INF' : i.cvValue.toFixed(2)}</td>
                </tr>`;
            }).join('');

            container.innerHTML = `
                <div class="erp-card border border-primary/20 bg-blue-50/15 dark:bg-zinc-900/40 p-5">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span class="badge-erp cell-${matrixClass} px-3 py-1 text-xs rounded-lg">${matrixClass}</span> 
                            Categorized Products List (${items.length} SKUs)
                        </h4>
                        <button onclick="document.getElementById('matrix-details-panel').innerHTML=\`<div class='p-6 text-center text-slate-400 dark:text-zinc-500 bg-white dark:bg-[#14151c] rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800'><i class='fa-solid fa-hand-pointer text-xl text-slate-400 mb-2 block'></i><span class='text-xs font-semibold'>Click on any matrix cell above to expand the SKU list and analyze stock velocity.</span></div>\`; document.querySelectorAll('.matrix-cell').forEach(c=>c.classList.remove('ring-4','ring-primary','scale-105'));" class="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200">
                            <i class="fa-solid fa-xmark mr-1"></i> Close Panel
                        </button>
                    </div>
                    <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-700/80">
                        <table class="erp-table text-xs">
                            <thead class="bg-slate-100/80 dark:bg-zinc-800/80">
                                <tr>
                                    <th class="px-5 py-2.5 text-left">SKU Product Name</th>
                                    <th class="px-5 py-2.5 text-right">Current Stock</th>
                                    <th class="px-5 py-2.5 text-right">Velocity</th>
                                    <th class="px-5 py-2.5 text-right">Runway</th>
                                    <th class="px-5 py-2.5 text-right">Profit Contribution</th>
                                    <th class="px-5 py-2.5 text-right">Current Month Vol</th>
                                    <th class="px-5 py-2.5 text-right">MoM Trend</th>
                                    <th class="px-5 py-2.5 text-right">CV Ratio</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                </div>`;
            
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
        renderTab(containerId) { UI.render(containerId); },
        refresh() { UI.render('trend-tab-container'); }
    };
})();

window.TrendEngine = TrendEngine;
