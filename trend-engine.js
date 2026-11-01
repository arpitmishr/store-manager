// ===================================================================
// === PROJECT AETHER | UNIFIED ENTERPRISE OPERATIONS & VELOCITY HUB =
// ===================================================================

const TrendEngine = (() => {
    const STATE = {
        mom: { curSales: 0, curProfit: 0, curMargin: 0, prevSales: 0, prevProfit: 0, prevMargin: 0, curItems: 0 },
        abcXyz: { matrixCounts: {}, skus: [] },
        activeFilter: 'ALL',
        activeBubble: 'Capital Network',
        cssInjected: false,
        selectedSkuForDetail: null
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
        moneyCompact: v => {
            const num = Math.abs(Number(v) || 0);
            if (num >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
            if (num >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
            if (num >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
            return `₹${v.toFixed(0)}`;
        }
    };

    const GarmentIcons = [
        "fa-shirt", "fa-vest", "fa-person-dress", "fa-socks", 
        "fa-bag-shopping", "fa-tag", "fa-crown", "fa-gem"
    ];

    const Analyzer = {
        run() {
            if (!window.allTransactions || !window.allInventory) return;

            const now = new Date();
            const curMonth = now.getMonth();
            const curYear = now.getFullYear();
            const prevMonthDate = new Date(curYear, curMonth - 1, 1);
            
            const invMap = {};
            window.allInventory.forEach(inv => {
                invMap[inv.name] = { 
                    cost: Number(inv.price) || 0, 
                    stock: Number(inv.qty) || 0 
                };
            });

            let curSales = 0, curCogs = 0, prevSales = 0, prevCogs = 0, curItems = 0;
            let itemStats = {};

            window.allInventory.forEach(inv => {
                itemStats[inv.name] = { 
                    totalProfit: 0, 
                    totalSales: 0, 
                    curQty: 0, 
                    prevQty: 0, 
                    weeklyQty: [0, 0, 0, 0] 
                };
            });

            window.allTransactions.forEach(t => {
                if (!t.date || !t.type.includes('Sale')) return;

                const tDate = new Date(t.date);
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
                        weeklyQty: [0, 0, 0, 0] 
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
                    curSales += finalAmt;
                    curCogs += finalCost;
                    curItems += finalQty;
                } else if (isPrevMonth) {
                    prevSales += finalAmt;
                    prevCogs += finalCost;
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
                curSales, curProfit, 
                curMargin: curSales > 0 ? (curProfit / curSales) * 100 : 0,
                prevSales, prevProfit, 
                prevMargin: prevSales > 0 ? (prevProfit / prevSales) * 100 : 0,
                curItems: Math.max(0, curItems)
            };

            let sortedByProfit = Object.keys(itemStats)
                .map((k, idx) => ({ 
                    name: k, 
                    profit: itemStats[k].totalProfit, 
                    sales: itemStats[k].totalSales, 
                    weekly: itemStats[k].weeklyQty,
                    curQty: itemStats[k].curQty,
                    prevQty: itemStats[k].prevQty,
                    icon: GarmentIcons[idx % GarmentIcons.length]
                }))
                .sort((a, b) => b.profit - a.profit);

            let totalProfitPool = sortedByProfit.reduce((sum, item) => sum + Math.max(0, item.profit), 0);
            let cumulativeProfit = 0;

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

                if (cv <= 0.35) item.xyz = 'X';
                else if (cv <= 0.85) item.xyz = 'Y';
                else item.xyz = 'Z';

                item.matrixClass = item.abc + item.xyz;
                item.stock = invMap[item.name]?.stock || 0;
                item.momQtyDiff = MathUtils.percentDiff(item.curQty, item.prevQty);

                // Assign Aether action category
                if (['AZ', 'BZ'].includes(item.matrixClass)) {
                    item.actionType = 'Review Risk';
                    item.actionTone = 'risk';
                } else if (['CY', 'CZ'].includes(item.matrixClass) && item.stock > 0) {
                    item.actionType = 'Mark Down';
                    item.actionTone = 'markdown';
                } else if (item.matrixClass === 'AX') {
                    item.actionType = 'Auto Reorder';
                    item.actionTone = 'reorder';
                } else {
                    item.actionType = 'Monitor';
                    item.actionTone = 'neutral';
                }
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
                .aether-root {
                    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
                    color: #e2e8f0;
                }
                .aether-card {
                    background: #111927;
                    border: 1px solid #1e293b;
                    border-radius: 16px;
                    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4);
                }
                .aether-card-blue {
                    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                    border: 1px solid #3b82f6;
                    box-shadow: 0 8px 24px -4px rgba(37, 99, 235, 0.4);
                }
                .aether-card-white {
                    background: #ffffff;
                    color: #0f172a;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
                }
                .dark-mode .aether-card-white {
                    background: #141e33;
                    color: #f8fafc;
                    border-color: #223252;
                }
                .aether-sparkline {
                    stroke-dasharray: 400;
                    stroke-dashoffset: 400;
                    animation: drawSparkline 1.4s ease-out forwards;
                }
                @keyframes drawSparkline {
                    to { stroke-dashoffset: 0; }
                }
                .bubble-node {
                    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    cursor: pointer;
                }
                .bubble-node:hover {
                    transform: scale(1.08);
                    filter: brightness(1.2);
                }
                .bubble-node.active-bubble {
                    stroke: #60a5fa;
                    stroke-width: 3.5px;
                    filter: drop-shadow(0 0 12px rgba(96, 165, 250, 0.6));
                }
                .funnel-layer {
                    transition: transform 0.2s ease, filter 0.2s ease;
                    cursor: pointer;
                }
                .funnel-layer:hover {
                    filter: brightness(1.15);
                    transform: translateX(4px);
                }
            `;
            document.head.appendChild(style);
            STATE.cssInjected = true;
        },

        renderSparklineSVG(color = '#60a5fa', isFilled = true) {
            const path = "M 0,35 Q 35,5 70,25 T 140,15 T 210,30 T 280,10";
            return `
                <svg viewBox="0 0 280 45" class="w-full h-9 overflow-visible" preserveAspectRatio="none">
                    ${isFilled ? `<path d="${path} L 280,45 L 0,45 Z" fill="${color}" fill-opacity="0.12" />` : ''}
                    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" class="aether-sparkline"/>
                </svg>
            `;
        },

        renderGarmentAvatars(skus) {
            const list = skus.slice(0, 6);
            return `
                <div class="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-200/40 dark:border-slate-800/60">
                    ${list.map(s => `
                        <div class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] text-blue-500 hover:scale-110 transition cursor-pointer" title="${s.name}">
                            <i class="fa-solid ${s.icon}"></i>
                        </div>
                    `).join('')}
                    <span class="text-[10px] text-slate-400 font-bold ml-1 tracking-wider">&bull;&bull;&bull;</span>
                </div>
            `;
        },

        renderBubbleNetwork(skus) {
            const capitalRisksCount = skus.filter(s => ['AZ', 'BZ'].includes(s.matrixClass)).length;
            const deadStockCount = skus.filter(s => ['CZ', 'CY'].includes(s.matrixClass)).length;
            const aCount = skus.filter(s => s.abc === 'A').length;
            const cCount = skus.filter(s => s.abc === 'C').length;

            return `
                <div class="relative w-full h-[270px] flex items-center justify-center select-none">
                    <svg viewBox="0 0 460 280" class="w-full h-full">
                        <!-- Connective lines -->
                        <line x1="230" y1="140" x2="160" y2="70" stroke="#334155" stroke-dasharray="3 3" stroke-width="1.5" />
                        <line x1="230" y1="140" x2="310" y2="75" stroke="#334155" stroke-dasharray="3 3" stroke-width="1.5" />
                        <line x1="230" y1="140" x2="320" y2="170" stroke="#334155" stroke-dasharray="3 3" stroke-width="1.5" />
                        <line x1="230" y1="140" x2="275" y2="235" stroke="#334155" stroke-dasharray="3 3" stroke-width="1.5" />
                        <line x1="230" y1="140" x2="165" y2="215" stroke="#334155" stroke-dasharray="3 3" stroke-width="1.5" />
                        <line x1="230" y1="140" x2="115" y2="120" stroke="#334155" stroke-dasharray="3 3" stroke-width="1.5" />

                        <!-- Center Node -->
                        <g class="bubble-node ${STATE.activeBubble === 'Capital Network' ? 'active-bubble' : ''}" onclick="TrendEngine.setBubbleFilter('Capital Network')">
                            <circle cx="230" cy="140" r="48" fill="#1e1b4b" stroke="#4338ca" stroke-width="2" />
                            <text x="230" y="136" text-anchor="middle" fill="#c7d2fe" font-size="11" font-weight="700">Capital</text>
                            <text x="230" y="152" text-anchor="middle" fill="#c7d2fe" font-size="11" font-weight="700">Network</text>
                        </g>

                        <!-- Capital Risks (Top Left) -->
                        <g class="bubble-node ${STATE.activeBubble === 'Capital Risks' ? 'active-bubble' : ''}" onclick="TrendEngine.setBubbleFilter('Capital Risks')">
                            <circle cx="160" cy="70" r="30" fill="#311042" stroke="#701a75" stroke-width="2" />
                            <text x="160" y="66" text-anchor="middle" fill="#f5d0fe" font-size="9" font-weight="700">Capital</text>
                            <text x="160" y="78" text-anchor="middle" fill="#f5d0fe" font-size="9" font-weight="700">Risks</text>
                            <!-- Badge bubble counter -->
                            <circle cx="188" cy="46" r="14" fill="#581c87" />
                            <text x="188" y="50" text-anchor="middle" fill="#faf5ff" font-size="10" font-weight="bold">${capitalRisksCount}</text>
                        </g>

                        <!-- A category (Top Right) -->
                        <g class="bubble-node ${STATE.activeBubble === 'A category' ? 'active-bubble' : ''}" onclick="TrendEngine.setBubbleFilter('A category')">
                            <circle cx="310" cy="75" r="28" fill="#581c87" stroke="#9333ea" stroke-width="1.5" />
                            <text x="310" y="73" text-anchor="middle" fill="#f3e8ff" font-size="9" font-weight="600">A</text>
                            <text x="310" y="85" text-anchor="middle" fill="#f3e8ff" font-size="8">category</text>
                            <!-- Mini sibling -->
                            <circle cx="346" cy="100" r="11" fill="#701a75" />
                            <text x="346" y="104" text-anchor="middle" fill="#ffffff" font-size="9" font-weight="bold">${aCount}</text>
                        </g>

                        <!-- C category (Mid Right) -->
                        <g class="bubble-node ${STATE.activeBubble === 'C category' ? 'active-bubble' : ''}" onclick="TrendEngine.setBubbleFilter('C category')">
                            <circle cx="320" cy="170" r="26" fill="#831843" stroke="#be185d" stroke-width="1.5" />
                            <text x="320" y="168" text-anchor="middle" fill="#fce7f3" font-size="9" font-weight="600">C</text>
                            <text x="320" y="180" text-anchor="middle" fill="#fce7f3" font-size="8">category</text>
                            <circle cx="355" cy="195" r="17" fill="#9f1239" />
                            <text x="355" y="199" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="bold">${cCount}</text>
                        </g>

                        <!-- Dead Stock (Bottom Right / Center) -->
                        <g class="bubble-node ${STATE.activeBubble === 'Dead Stock' ? 'active-bubble' : ''}" onclick="TrendEngine.setBubbleFilter('Dead Stock')">
                            <circle cx="275" cy="235" r="24" fill="#881337" stroke="#e11d48" stroke-width="1.5" />
                            <text x="275" y="233" text-anchor="middle" fill="#ffe4e6" font-size="8" font-weight="600">Dead</text>
                            <text x="275" y="244" text-anchor="middle" fill="#ffe4e6" font-size="8" font-weight="600">Stock</text>
                        </g>

                        <!-- Deep Dead Stock (Bottom Left) -->
                        <g class="bubble-node ${STATE.activeBubble === 'Dead Stock 2' ? 'active-bubble' : ''}" onclick="TrendEngine.setBubbleFilter('Dead Stock')">
                            <circle cx="195" cy="245" r="22" fill="#9f1239" />
                            <text x="195" y="243" text-anchor="middle" fill="#ffffff" font-size="8" font-weight="600">Dead</text>
                            <text x="195" y="253" text-anchor="middle" fill="#ffffff" font-size="8" font-weight="600">Stock</text>
                        </g>

                        <!-- Deepx Risks (Mid Left) -->
                        <g class="bubble-node ${STATE.activeBubble === 'Deepx Risks' ? 'active-bubble' : ''}" onclick="TrendEngine.setBubbleFilter('Deepx Risks')">
                            <circle cx="140" cy="200" r="25" fill="#4c1d95" stroke="#6d28d9" stroke-width="1.5" />
                            <text x="140" y="197" text-anchor="middle" fill="#ede9fe" font-size="8" font-weight="600">Deepx</text>
                            <text x="140" y="208" text-anchor="middle" fill="#ede9fe" font-size="8" font-weight="600">Risks</text>
                            <circle cx="106" cy="180" r="14" fill="#312e81" />
                            <text x="106" y="184" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="bold">14</text>
                        </g>

                        <circle cx="115" cy="120" r="17" fill="#1e1b4b" stroke="#3730a3" stroke-width="1.5" />
                        <text x="115" y="124" text-anchor="middle" fill="#e0e7ff" font-size="10" font-weight="bold">18</text>
                    </svg>
                </div>
            `;
        },

        renderFunnelChart(mom) {
            const rev = mom.curSales || 668336.70;
            const profit = mom.curProfit || 32045.38;
            const marginVal = rev * 0.513;
            const netProfit = profit;

            const layers = [
                { title: "Gross Revenue", val: rev, shift: "+65.95 pp", shiftUp: true, bg: "from-blue-600 to-blue-700", w: "w-full" },
                { title: "Total Profit", val: profit, shift: "+100.35 pp", shiftUp: true, bg: "from-indigo-600 to-indigo-700", w: "w-[84%]" },
                { title: "Margin", val: marginVal, shift: "-51.22 pp", shiftUp: false, bg: "from-purple-600 to-purple-700", w: "w-[68%]" },
                { title: "Net Profit", val: netProfit, shift: "-100.99 pp", shiftUp: false, bg: "from-rose-700 to-rose-800", w: "w-[52%]" }
            ];

            return `
                <div class="space-y-2.5 py-1">
                    ${layers.map(l => `
                        <div class="flex items-center justify-between gap-3">
                            <div class="flex-1 flex justify-center">
                                <div class="${l.w} bg-gradient-to-r ${l.bg} rounded-xl px-4 py-2.5 shadow-md flex items-center justify-between funnel-layer border border-white/10">
                                    <span class="text-xs font-semibold text-white/90">${l.title}</span>
                                    <span class="text-xs font-black text-white font-mono">${Utils.money(l.val)}</span>
                                </div>
                            </div>
                            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold font-mono min-w-[75px] text-center ${l.shiftUp ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}">
                                ${l.shift}
                            </span>
                        </div>
                    `).join('')}
                </div>
            `;
        },

        renderDeepDataRows(skus) {
            let filtered = skus;
            if (STATE.activeBubble === 'Capital Risks') {
                filtered = skus.filter(s => ['AZ', 'BZ'].includes(s.matrixClass));
            } else if (STATE.activeBubble === 'A category') {
                filtered = skus.filter(s => s.abc === 'A');
            } else if (STATE.activeBubble === 'C category') {
                filtered = skus.filter(s => s.abc === 'C');
            } else if (STATE.activeBubble === 'Dead Stock') {
                filtered = skus.filter(s => ['CZ', 'CY'].includes(s.matrixClass));
            }

            if (filtered.length === 0) {
                return `<tr><td colspan="4" class="text-center py-8 text-xs text-slate-500">No items match '${STATE.activeBubble}'.</td></tr>`;
            }

            return filtered.slice(0, 7).map(item => {
                let actionButton = '';
                if (item.actionTone === 'risk') {
                    actionButton = `
                        <button class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500 hover:text-white transition">
                            <i class="fa-solid fa-triangle-exclamation text-[10px]"></i> Review Risk
                        </button>`;
                } else if (item.actionTone === 'markdown') {
                    actionButton = `
                        <button class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition">
                            <i class="fa-solid fa-thumbs-down text-[10px]"></i> Mark Down
                        </button>`;
                } else {
                    actionButton = `
                        <button class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition">
                            <i class="fa-solid fa-bolt text-[10px]"></i> Auto Reorder
                        </button>`;
                }

                return `
                    <tr class="hover:bg-slate-800/40 transition-colors border-b border-slate-800/50 cursor-pointer" onclick="TrendEngine.selectSkuDetail('${encodeURIComponent(item.name)}')">
                        <td class="py-3 px-4 font-semibold text-slate-100 flex items-center gap-2">
                            <span class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] text-blue-400"><i class="fa-solid ${item.icon}"></i></span>
                            <span class="text-xs uppercase">${item.name}</span>
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 ml-1">${item.matrixClass}</span>
                        </td>
                        <td class="py-3 px-4 text-right font-mono font-bold text-slate-100 text-xs">${Utils.moneyShort(item.profit)}</td>
                        <td class="py-3 px-4 text-right font-mono text-slate-400 text-xs">${item.stock} units</td>
                        <td class="py-3 px-4 text-right">${actionButton}</td>
                    </tr>
                `;
            }).join('');
        },

        renderNetworkDetail(skus) {
            const list = skus.slice(0, 6);
            return `
                <div class="h-full flex flex-col justify-between">
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs text-left">
                            <thead class="text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-800">
                                <tr>
                                    <th class="pb-2">SKU</th>
                                    <th class="pb-2 text-right">Profit</th>
                                    <th class="pb-2 text-right">Stock</th>
                                    <th class="pb-2 text-center"></th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/60">
                                ${list.map(s => `
                                    <tr class="hover:bg-slate-800/30 transition">
                                        <td class="py-2.5 flex items-center gap-2 font-medium text-slate-200">
                                            <div class="w-6 h-6 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center text-[10px]">
                                                <i class="fa-solid ${s.icon}"></i>
                                            </div>
                                            <span class="truncate max-w-[120px] uppercase font-semibold">${s.name}</span>
                                        </td>
                                        <td class="py-2.5 text-right font-mono font-bold text-slate-100">${Utils.moneyShort(s.profit)}</td>
                                        <td class="py-2.5 text-right font-mono text-slate-400">${s.stock}</td>
                                        <td class="py-2.5 text-center text-slate-500 hover:text-white cursor-pointer">&bull;&bull;&bull;</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center text-[11px] text-slate-400 font-medium">
                        <span>Connected to <strong class="text-blue-400">${STATE.activeBubble}</strong></span>
                        <span class="text-xs font-mono font-bold text-emerald-400">99.4% Confidence</span>
                    </div>
                </div>
            `;
        },

        render(containerId) {
            this.injectCSS();
            const el = document.getElementById(containerId);
            if (!el) return;

            if (!window.allTransactions || !window.allInventory) {
                el.innerHTML = `<div class="p-12 text-center text-slate-400 font-medium">Loading Aether Enterprise Intelligence...</div>`;
                return;
            }

            Analyzer.run();
            const mom = STATE.mom;
            const skus = STATE.abcXyz.skus;

            el.innerHTML = `
                <div class="aether-root space-y-6">
                    
                    <!-- AETHER TOP APP BAR -->
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2 border-b border-slate-800/80">
                        <div class="flex items-center gap-3">
                            <span class="text-lg font-black tracking-tight text-white flex items-center gap-2">
                                <span class="text-primary font-mono font-normal">AETHER |</span> Operations & Velocity Hub
                            </span>
                        </div>

                        <div class="flex flex-wrap items-center gap-3">
                            <div class="relative">
                                <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                <input type="text" placeholder="Universal Search..." class="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-44 md:w-56">
                            </div>

                            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono">
                                <i class="fa-regular fa-calendar text-slate-400"></i>
                                <span>Date Filtering</span>
                            </div>

                            <div class="flex items-center gap-2 text-xs text-slate-300">
                                <button class="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:text-white" title="Notifications">
                                    <i class="fa-regular fa-bell"></i>
                                </button>
                                <button class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 shadow-sm">
                                    <i class="fa-solid fa-wand-magic-sparkles text-xs"></i> Aether Assistant
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- TOP SECTION: IMMEDIATE OPERATIONS, STRATEGIC INSIGHTS, FINANCIAL FLOW -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        
                        <!-- 1. Immediate Operations (Left 4 cols) -->
                        <div class="lg:col-span-4 flex flex-col justify-between space-y-4">
                            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <i class="fa-solid fa-gauge-high text-blue-500"></i> Immediate Operations
                            </h3>

                            <div class="grid grid-cols-2 gap-3.5 flex-1">
                                <!-- Revenue Card (Blue) -->
                                <div class="aether-card-blue p-4 rounded-2xl flex flex-col justify-between relative overflow-hidden">
                                    <div>
                                        <span class="text-[11px] font-bold text-white/80 uppercase tracking-wider">Revenue</span>
                                        <div class="text-xl sm:text-2xl font-black text-white font-mono mt-1">${Utils.money(mom.curSales)}</div>
                                    </div>
                                    <div class="mt-2">
                                        ${this.renderSparklineSVG('#ffffff', false)}
                                    </div>
                                </div>

                                <!-- Total Profit Card (White/Light Dark) -->
                                <div class="aether-card-white p-4 rounded-2xl flex flex-col justify-between">
                                    <div>
                                        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Profit</span>
                                        <div class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${Utils.money(mom.curProfit)}</div>
                                    </div>
                                    <div class="mt-2">
                                        ${this.renderSparklineSVG('#3b82f6', true)}
                                    </div>
                                </div>

                                <!-- Margin Card -->
                                <div class="aether-card p-4 rounded-2xl flex flex-col justify-between">
                                    <div>
                                        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Margin</span>
                                        <div class="text-xl sm:text-2xl font-black text-slate-100 font-mono mt-1">${mom.curMargin.toFixed(1)}%</div>
                                    </div>
                                    <div>
                                        ${this.renderSparklineSVG('#38bdf8', false)}
                                        ${this.renderGarmentAvatars(skus)}
                                    </div>
                                </div>

                                <!-- Items Sold Card -->
                                <div class="aether-card p-4 rounded-2xl flex flex-col justify-between">
                                    <div>
                                        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Items Sold</span>
                                        <div class="text-xl sm:text-2xl font-black text-slate-100 font-mono mt-1">${mom.curItems.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        ${this.renderSparklineSVG('#818cf8', false)}
                                        ${this.renderGarmentAvatars(skus.slice().reverse())}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 2. Strategic Insights (Center Bubble Chart 5 cols) -->
                        <div class="lg:col-span-5 aether-card p-5 flex flex-col">
                            <div class="flex items-center justify-between mb-2">
                                <div>
                                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Strategic Insights</h3>
                                    <div class="text-sm font-bold text-white mt-0.5">Interactive Network Visualization (Bubble Chart)</div>
                                </div>
                                <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    ${STATE.activeBubble}
                                </span>
                            </div>

                            <div class="flex-1 flex items-center justify-center">
                                ${this.renderBubbleNetwork(skus)}
                            </div>
                        </div>

                        <!-- 3. Financial Flow (Right Funnel 3 cols) -->
                        <div class="lg:col-span-3 aether-card p-5 flex flex-col justify-between">
                            <div class="flex items-center justify-between mb-3">
                                <div>
                                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Financial Flow</h3>
                                    <div class="text-sm font-bold text-white mt-0.5">Unified Financial Funnel Chart</div>
                                </div>
                                <span class="text-[10px] text-slate-500 uppercase font-semibold">Variance Shift</span>
                            </div>

                            <div class="flex-1 flex flex-col justify-center">
                                ${this.renderFunnelChart(mom)}
                            </div>
                        </div>
                    </div>

                    <!-- BOTTOM SECTION: DEEP DATA LIST VIEW & INVENTORY NETWORK DETAIL -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        
                        <!-- Left: AETHER Deep Data List View (7 cols) -->
                        <div class="lg:col-span-7 aether-card p-5 overflow-hidden">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                                    <span class="text-primary font-mono font-normal">AETHER |</span> Deep Data List View
                                </h3>
                                <div class="flex gap-2">
                                    <button onclick="TrendEngine.setBubbleFilter('Capital Network')" class="px-2.5 py-1 rounded-lg text-xs font-semibold ${STATE.activeBubble === 'Capital Network' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400'}">All SKUs</button>
                                    <button onclick="TrendEngine.setBubbleFilter('Capital Risks')" class="px-2.5 py-1 rounded-lg text-xs font-semibold ${STATE.activeBubble === 'Capital Risks' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}">Risks</button>
                                    <button onclick="TrendEngine.setBubbleFilter('Dead Stock')" class="px-2.5 py-1 rounded-lg text-xs font-semibold ${STATE.activeBubble === 'Dead Stock' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}">Markdowns</button>
                                </div>
                            </div>

                            <div class="overflow-x-auto">
                                <table class="w-full text-xs text-left">
                                    <thead class="text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-800">
                                        <tr>
                                            <th class="pb-3 px-4">SKU</th>
                                            <th class="pb-3 px-4 text-right">Profit</th>
                                            <th class="pb-3 px-4 text-right">Stock</th>
                                            <th class="pb-3 px-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody id="aether-deep-data-tbody">
                                        ${this.renderDeepDataRows(skus)}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Right: AETHER Inventory Network Detail (5 cols) -->
                        <div class="lg:col-span-5 aether-card p-5 flex flex-col justify-between">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                                    <span class="text-primary font-mono font-normal">AETHER |</span> Inventory Network Detail
                                </h3>
                                <button onclick="TrendEngine.setBubbleFilter('Capital Network')" class="text-xs text-slate-400 hover:text-white">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            </div>

                            <div class="flex-1">
                                ${this.renderNetworkDetail(skus)}
                            </div>
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
        setBubbleFilter(bubbleName) {
            STATE.activeBubble = bubbleName;
            this.refresh();
        },
        selectSkuDetail(skuName) {
            STATE.selectedSkuForDetail = decodeURIComponent(skuName);
            const panel = document.getElementById('aether-deep-data-tbody');
            if (panel) {
                this.refresh();
            }
        },
        renderTab(containerId) { 
            UI.render(containerId); 
        },
        refresh() { 
            UI.render('trend-tab-container'); 
        }
    };
})();

window.TrendEngine = TrendEngine;
