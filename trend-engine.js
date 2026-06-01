const TrendEngine = (() => {
    const STATE = {
        mom: { curSales: 0, curProfit: 0, curMargin: 0, prevSales: 0, prevProfit: 0, prevMargin: 0 },
        abcXyz: { matrixCounts: {}, skus: [] },
        cssInjected: false
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
            const curMonth = now.getMonth();
            const curYear = now.getFullYear();
            const prevMonthDate = new Date(curYear, curMonth - 1, 1);
            
            const invMap = {};
            window.allInventory.forEach(inv => invMap[inv.name] = { cost: Number(inv.price) || 0, stock: Number(inv.qty) || 0 });

            let curSales = 0, curCogs = 0, prevSales = 0, prevCogs = 0;
            let itemStats = {};

            window.allTransactions.forEach(t => {
                if (!t.date || !t.type.includes('Sale')) return;

                const tDate = new Date(t.date);
                const amt = Number(t.amount) || 0;
                let qty = Number(t.qty) || 0;
                const item = t.item;
                const isCosmetic = t.type.includes('Cosmetic');

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

                if (!itemStats[item]) {
                    itemStats[item] = { 
                        totalProfit: 0, totalSales: 0, 
                        curQty: 0, prevQty: 0, 
                        weeklyQty: [0, 0, 0, 0] 
                    };
                }

                itemStats[item].totalProfit += (finalAmt - finalCost);
                itemStats[item].totalSales += finalAmt;

                if (isCurrentMonth) itemStats[item].curQty += finalQty;
                if (isPrevMonth) itemStats[item].prevQty += finalQty;

                const diffDays = Math.floor((now - tDate) / 86400000);
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

            let sortedByProfit = Object.keys(itemStats)
                .map(k => ({ 
                    name: k, 
                    profit: itemStats[k].totalProfit, 
                    sales: itemStats[k].totalSales, 
                    weekly: itemStats[k].weeklyQty,
                    curQty: itemStats[k].curQty,
                    prevQty: itemStats[k].prevQty
                }))
                .filter(i => i.profit > 0)
                .sort((a, b) => b.profit - a.profit);

            let totalProfitPool = sortedByProfit.reduce((sum, item) => sum + item.profit, 0);
            let cumulativeProfit = 0;

            sortedByProfit.forEach(item => {
                cumulativeProfit += item.profit;
                let pct = cumulativeProfit / totalProfitPool;
                item.cumPct = pct * 100;
                
                if (pct <= 0.80) item.abc = 'A';
                else if (pct <= 0.95) item.abc = 'B';
                else item.abc = 'C';

                let cv = MathUtils.cv(item.weekly);
                item.cvValue = cv;

                if (cv <= 0.1) item.xyz = 'X';
                else if (cv <= 0.5) item.xyz = 'Y';
                else item.xyz = 'Z';

                item.matrixClass = item.abc + item.xyz;
                item.stock = invMap[item.name]?.stock || 0;
                item.momQtyDiff = MathUtils.percentDiff(item.curQty, item.prevQty);
            });

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
                .erp-container { font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
                .erp-card { background: #ffffff; border-radius: 12px; border: 1px solid #eaebec; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); overflow: hidden; display: flex; flex-direction: column; }
                .dark-mode .erp-card { background: #18181b; border-color: #27272a; }
                .erp-header { padding: 16px 20px; border-bottom: 1px solid #eaebec; background: #f8fafc; }
                .dark-mode .erp-header { border-color: #27272a; background: #1f1f22; }
                .erp-title { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; display: flex; align-items: center; gap: 8px;}
                .dark-mode .erp-title { color: #a1a1aa; }
                .matrix-grid { display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 4px; padding: 16px; background: #f1f5f9; }
                .dark-mode .matrix-grid { background: #121214; }
                .matrix-cell { padding: 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; text-align: center; border: 1px solid rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 70px;}
                .matrix-header { font-weight: 700; color: #64748b; background: transparent; border: none; font-size: 0.75rem; text-transform: uppercase;}
                .dark-mode .matrix-header { color: #94a3b8; }
                .cell-AX { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
                .dark-mode .cell-AX { background: #14532d; color: #86efac; border-color: #166534; }
                .cell-AY, .cell-BX { background: #fef9c3; color: #854d0e; border-color: #fef08a; }
                .dark-mode .cell-AY, .dark-mode .cell-BX { background: #713f12; color: #fde047; border-color: #854d0e; }
                .cell-AZ, .cell-BZ, .cell-CX { background: #ffedd5; color: #9a3412; border-color: #fed7aa; }
                .dark-mode .cell-AZ, .dark-mode .cell-BZ, .dark-mode .cell-CX { background: #7c2d12; color: #fdba74; border-color: #9a3412; }
                .cell-CY, .cell-CZ { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
                .dark-mode .cell-CY, .dark-mode .cell-CZ { background: #7f1d1d; color: #fca5a5; border-color: #991b1b; }
                .matrix-sub { font-size: 0.7rem; font-weight: 400; opacity: 0.8; margin-top: 4px; }
                .erp-table { width: 100%; text-align: left; border-collapse: collapse; }
                .erp-table th { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #64748b; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
                .dark-mode .erp-table th { color: #94a3b8; border-color: #334155; }
                .erp-table td { font-size: 0.875rem; color: #1e293b; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
                .dark-mode .erp-table td { color: #cbd5e1; border-color: #1e293b; }
                .erp-table tr:hover td { background: #f8fafc; }
                .dark-mode .erp-table tr:hover td { background: #1e293b; }
                .stat-trend.up { color: #10b981; }
                .stat-trend.down { color: #ef4444; }
                .badge-erp { padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; }
            `;
            document.head.appendChild(style);
            STATE.cssInjected = true;
        },

        render(containerId) {
            this.injectCSS();
            const el = document.getElementById(containerId);
            if (!el) return;

            if (!window.allTransactions || !window.allInventory) {
                el.innerHTML = `<div class="p-8 text-center text-gray-500 font-medium">Initializing ERP Matrix Analytics...</div>`;
                return;
            }

            Analyzer.run();

            let salesDiff = MathUtils.percentDiff(STATE.mom.curSales, STATE.mom.prevSales);
            let profitDiff = MathUtils.percentDiff(STATE.mom.curProfit, STATE.mom.prevProfit);
            let marginDiff = STATE.mom.curMargin - STATE.mom.prevMargin;

            const formatTrend = (val) => {
                if (!isFinite(val)) return `<span class="text-xs font-bold text-gray-500 ml-2">N/A</span>`;
                let isUp = val > 0;
                let icon = isUp ? 'fa-arrow-up' : (val < 0 ? 'fa-arrow-down' : 'fa-minus');
                let colorClass = isUp ? 'stat-trend up' : (val < 0 ? 'stat-trend down' : 'text-gray-500');
                return `<span class="text-xs font-bold ${colorClass} ml-2"><i class="fa-solid ${icon}"></i> ${Math.abs(val).toFixed(1)}%</span>`;
            };

            let skus = STATE.abcXyz.skus;
            
            let axHtml = skus.filter(i => i.matrixClass === 'AX').slice(0, 5).map(i => `
                <tr>
                    <td class="font-bold">${i.name}</td>
                    <td class="text-right text-success font-bold">${Utils.moneyShort(i.profit)}</td>
                    <td class="text-right">${i.stock} units</td>
                    <td class="text-right"><span class="badge-erp bg-success text-white">Auto-Reorder</span></td>
                </tr>
            `).join('') || `<tr><td colspan="4" class="text-center py-4 text-gray-400">No AX Items detected.</td></tr>`;

            let azHtml = skus.filter(i => ['AZ', 'BZ'].includes(i.matrixClass)).slice(0, 5).map(i => `
                <tr>
                    <td class="font-bold">${i.name} <span class="text-[10px] bg-gray-200 dark:bg-gray-700 px-1 rounded ml-1">${i.matrixClass}</span></td>
                    <td class="text-right text-warning font-bold">${Utils.moneyShort(i.profit)}</td>
                    <td class="text-right">${i.stock} units</td>
                    <td class="text-right"><span class="badge-erp bg-warning text-white">Review Risk</span></td>
                </tr>
            `).join('') || `<tr><td colspan="4" class="text-center py-4 text-gray-400">No AZ/BZ erratic items found.</td></tr>`;

            let czHtml = skus.filter(i => ['CZ', 'CY'].includes(i.matrixClass) && i.stock > 0).slice(0, 5).map(i => `
                <tr>
                    <td class="font-bold">${i.name} <span class="text-[10px] bg-gray-200 dark:bg-gray-700 px-1 rounded ml-1">${i.matrixClass}</span></td>
                    <td class="text-right text-danger">${Utils.moneyShort(i.profit)}</td>
                    <td class="text-right">${i.stock} units</td>
                    <td class="text-right"><span class="badge-erp bg-danger text-white">Mark Down</span></td>
                </tr>
            `).join('') || `<tr><td colspan="4" class="text-center py-4 text-gray-400">No dead stock requiring liquidation.</td></tr>`;

            let deepHtml = skus.map(i => {
                let badgeClass = 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
                if(i.matrixClass === 'AX') badgeClass = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                if(['AZ','BZ'].includes(i.matrixClass)) badgeClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
                if(['CZ','CY'].includes(i.matrixClass)) badgeClass = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';

                let cvDisplay = i.cvValue === Infinity ? 'INF' : i.cvValue.toFixed(2);
                
                return `
                <tr>
                    <td class="font-bold">${i.name}</td>
                    <td class="text-center"><span class="badge-erp ${badgeClass}">${i.matrixClass}</span></td>
                    <td class="text-right">${i.stock}</td>
                    <td class="text-right">${i.curQty} <span class="text-[10px] text-gray-400">(${i.prevQty})</span></td>
                    <td class="text-right">${formatTrend(i.momQtyDiff)}</td>
                    <td class="text-right font-medium">${Utils.moneyShort(i.profit)}</td>
                    <td class="text-right text-xs text-gray-500">${i.cumPct.toFixed(1)}%</td>
                    <td class="text-right text-xs text-gray-500">${cvDisplay}</td>
                </tr>
            `}).join('');

            el.innerHTML = `
                <div class="erp-container">
                    <div class="mb-6">
                        <h2 class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-1">Advanced Operations Matrix</h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400 font-medium">Automated ABC-XYZ Analytics & Comparative Performance</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div class="erp-card p-5">
                            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Current Month Sales</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white flex items-center">
                                ${Utils.moneyShort(STATE.mom.curSales)} 
                                ${formatTrend(salesDiff)}
                            </div>
                            <div class="text-xs text-gray-400 mt-2 border-t border-gray-100 dark:border-gray-800 pt-2">Prev: ${Utils.moneyShort(STATE.mom.prevSales)}</div>
                        </div>
                        <div class="erp-card p-5 border-t-4 border-t-primary">
                            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Current Month Profit</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white flex items-center">
                                ${Utils.moneyShort(STATE.mom.curProfit)}
                                ${formatTrend(profitDiff)}
                            </div>
                            <div class="text-xs text-gray-400 mt-2 border-t border-gray-100 dark:border-gray-800 pt-2">Prev: ${Utils.moneyShort(STATE.mom.prevProfit)}</div>
                        </div>
                        <div class="erp-card p-5">
                            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Gross Margin</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white flex items-center">
                                ${STATE.mom.curMargin.toFixed(1)}%
                                ${formatTrend(marginDiff)}
                            </div>
                            <div class="text-xs text-gray-400 mt-2 border-t border-gray-100 dark:border-gray-800 pt-2">Prev: ${STATE.mom.prevMargin.toFixed(1)}%</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div class="erp-card h-full">
                            <div class="erp-header">
                                <div class="erp-title"><i class="fa-solid fa-border-all text-blue-600"></i> Automated ABC-XYZ Matrix</div>
                                <p class="text-xs text-gray-500 mt-1 font-normal">X-Axis: Velocity Predictability (CV) | Y-Axis: Profit Contribution</p>
                            </div>
                            <div class="matrix-grid rounded-b-xl flex-1">
                                <div class="matrix-cell matrix-header border-none"></div>
                                <div class="matrix-cell matrix-header border-none">X <span class="matrix-sub lowercase font-normal">(Stable/Fast)</span></div>
                                <div class="matrix-cell matrix-header border-none">Y <span class="matrix-sub lowercase font-normal">(Fluctuating)</span></div>
                                <div class="matrix-cell matrix-header border-none">Z <span class="matrix-sub lowercase font-normal">(Erratic/Slow)</span></div>
                                
                                <div class="matrix-cell matrix-header">A <span class="matrix-sub lowercase font-normal">(Top 80%)</span></div>
                                <div class="matrix-cell cell-AX">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.AX}</div>
                                    <div class="matrix-sub uppercase font-bold">Core Engines</div>
                                </div>
                                <div class="matrix-cell cell-AY">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.AY}</div>
                                    <div class="matrix-sub uppercase font-bold">High Seasonal</div>
                                </div>
                                <div class="matrix-cell cell-AZ">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.AZ}</div>
                                    <div class="matrix-sub uppercase font-bold">Capital Risks</div>
                                </div>

                                <div class="matrix-cell matrix-header">B <span class="matrix-sub lowercase font-normal">(Next 15%)</span></div>
                                <div class="matrix-cell cell-BX">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.BX}</div>
                                    <div class="matrix-sub uppercase font-bold">Steady Sellers</div>
                                </div>
                                <div class="matrix-cell cell-BY">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.BY}</div>
                                    <div class="matrix-sub uppercase font-bold">Med Fluctuating</div>
                                </div>
                                <div class="matrix-cell cell-BZ">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.BZ}</div>
                                    <div class="matrix-sub uppercase font-bold">Slow Burners</div>
                                </div>

                                <div class="matrix-cell matrix-header">C <span class="matrix-sub lowercase font-normal">(Bottom 5%)</span></div>
                                <div class="matrix-cell cell-CX">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.CX}</div>
                                    <div class="matrix-sub uppercase font-bold">Cheap / Fast</div>
                                </div>
                                <div class="matrix-cell cell-CY">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.CY}</div>
                                    <div class="matrix-sub uppercase font-bold">Low Seasonal</div>
                                </div>
                                <div class="matrix-cell cell-CZ">
                                    <div class="text-xl font-black">${STATE.abcXyz.matrixCounts.CZ}</div>
                                    <div class="matrix-sub uppercase font-bold">Dead Stock</div>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-col gap-6">
                            <div class="erp-card">
                                <div class="erp-header flex justify-between items-center">
                                    <div class="erp-title"><i class="fa-solid fa-engine text-success"></i> AX: Core Engines</div>
                                    <span class="text-xs text-gray-500 font-medium">Predictable & Highly Profitable</span>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="erp-table">
                                        <thead><tr><th>SKU</th><th class="text-right">Profit</th><th class="text-right">Stock</th><th class="text-right">ERP Action</th></tr></thead>
                                        <tbody>${axHtml}</tbody>
                                    </table>
                                </div>
                            </div>

                            <div class="erp-card">
                                <div class="erp-header flex justify-between items-center">
                                    <div class="erp-title"><i class="fa-solid fa-triangle-exclamation text-warning"></i> AZ/BZ: Cash Alerts</div>
                                    <span class="text-xs text-gray-500 font-medium">High Profit but Erratic Demand</span>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="erp-table">
                                        <thead><tr><th>SKU</th><th class="text-right">Profit</th><th class="text-right">Stock</th><th class="text-right">ERP Action</th></tr></thead>
                                        <tbody>${azHtml}</tbody>
                                    </table>
                                </div>
                            </div>

                            <div class="erp-card">
                                <div class="erp-header flex justify-between items-center">
                                    <div class="erp-title"><i class="fa-solid fa-tags text-danger"></i> CY/CZ: Liquidation Triggers</div>
                                    <span class="text-xs text-gray-500 font-medium">Low Value, Slow/Erratic Moving</span>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="erp-table">
                                        <thead><tr><th>SKU</th><th class="text-right">Profit</th><th class="text-right">Stock</th><th class="text-right">ERP Action</th></tr></thead>
                                        <tbody>${czHtml}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="erp-card mb-12">
                        <div class="erp-header">
                            <div class="erp-title"><i class="fa-solid fa-magnifying-glass-chart text-purple-600"></i> Master SKU Deep Dive</div>
                            <p class="text-xs text-gray-500 mt-1 font-normal">Complete inventory breakdown with exact variance, cumulative profit thresholds, and MoM trends.</p>
                        </div>
                        <div class="overflow-x-auto max-h-[500px]">
                            <table class="erp-table relative">
                                <thead class="sticky top-0 bg-gray-50 dark:bg-gray-800 shadow-sm">
                                    <tr>
                                        <th>SKU</th>
                                        <th class="text-center">Matrix</th>
                                        <th class="text-right">Stock</th>
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
        }
    };

    return {
        init(db) { 
            if (!db) return; 
        }, 
        renderTab(containerId) { UI.render(containerId); },
        refresh() { UI.render('trend-tab-container'); },
    };
})();

window.TrendEngine = TrendEngine;
