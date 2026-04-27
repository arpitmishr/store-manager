// ============================================================================
// TIER-3/4 LOCALIZED TREND ENGINE (BHAGWANPUR / HARIDWAR CONTEXT)
// Focuses on: Capital Leaks, Dead Stock, Regional Festivals, YoY Analysis, Predictors
// ============================================================================

const TrendEngine = (() => {
    const STATE = {
        initialized: false,
        insights: [],
        events: [],
        yoy: [],
        monthlyYoY: { cmSales: 0, lymSales: 0, change: 0 },
        deadStock: [],
        marginLeaks: [],
        stockoutRisks: [],
        hotItems: []
    };

    // Bhagwanpur & Haridwar Belt specific events
    const getLocalEvents = (year) => [
        { id: 'kanwar', name: 'Kanwar Yatra / Shravan', start: new Date(`${year}-07-20`), end: new Date(`${year}-08-10`), type: 'pilgrimage' },
        { id: 'chaitra', name: 'Chaitra Navratri', start: new Date(`${year}-03-22`), end: new Date(`${year}-03-30`), type: 'festival' },
        { id: 'sharad', name: 'Sharad Navratri', start: new Date(`${year}-10-10`), end: new Date(`${year}-10-19`), type: 'festival' },
        { id: 'diwali', name: 'Diwali & Dhanteras', start: new Date(`${year}-10-28`), end: new Date(`${year}-11-03`), type: 'festival' },
        { id: 'holi', name: 'Holi', start: new Date(`${year}-03-03`), end: new Date(`${year}-03-05`), type: 'festival' },
        { id: 'makar', name: 'Makar Sankranti', start: new Date(`${year}-01-13`), end: new Date(`${year}-01-15`), type: 'festival' },
        { id: 'rabi', name: 'Wheat Harvest (Rabi)', start: new Date(`${year}-04-10`), end: new Date(`${year}-05-15`), type: 'agriculture' },
        { id: 'kharif', name: 'Paddy Harvest (Kharif)', start: new Date(`${year}-10-15`), end: new Date(`${year}-11-20`), type: 'agriculture' },
        { id: 'wedding_w', name: 'Winter Weddings', start: new Date(`${year}-11-15`), end: new Date(`${year+1}-02-28`), type: 'wedding' },
        { id: 'wedding_s', name: 'Summer Weddings', start: new Date(`${year}-04-15`), end: new Date(`${year}-06-15`), type: 'wedding' },
        { id: 'school', name: 'Back to School Session', start: new Date(`${year}-06-25`), end: new Date(`${year}-07-15`), type: 'education' }
    ];

    const Utils = {
        money: v => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        daysDiff: (d1, d2) => Math.floor((d2 - d1) / 86400000),
        formatDate: d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
    };

    const Analyzer = {
        run() {
            if (!window.allTransactions || !window.allInventory) return;
            
            // Reset state
            STATE.insights = []; STATE.events = []; STATE.yoy = []; STATE.deadStock = []; 
            STATE.marginLeaks = []; STATE.stockoutRisks = []; STATE.hotItems = [];

            const now = new Date();
            
            // 1. Group Transactions by Item
            const itemTx = {};
            window.allTransactions.forEach(t => {
                if (!itemTx[t.item]) itemTx[t.item] = { sales: [], purchases: [] };
                if (t.type.includes('Sale')) itemTx[t.item].sales.push(t);
                if (t.type.includes('Purchase')) itemTx[t.item].purchases.push(t);
            });

            // 2. Month-wise YoY Analysis (Current Month vs Same Month Last Year)
            let currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            let lastYearMonthStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
            let lastYearMonthEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0, 23, 59, 59);

            let cmSales = 0, lymSales = 0;
            window.allTransactions.forEach(t => {
                if(!t.type.includes('Sale')) return;
                let d = new Date(t.date);
                if (d >= currentMonthStart) cmSales += Number(t.amount);
                if (d >= lastYearMonthStart && d <= lastYearMonthEnd) lymSales += Number(t.amount);
            });
            STATE.monthlyYoY = { 
                cmSales, lymSales, 
                change: lymSales > 0 ? ((cmSales - lymSales) / lymSales) * 100 : 0 
            };

            // 3. Margin Leak Detector
            for (let item in itemTx) {
                let purchases = itemTx[item].purchases.sort((a,b) => new Date(b.date) - new Date(a.date));
                let sales = itemTx[item].sales.sort((a,b) => new Date(b.date) - new Date(a.date));

                if (purchases.length >= 2 && sales.length >= 1) {
                    let recentP = purchases[0], oldP = purchases[purchases.length - 1], currentS = sales[0];
                    let recentCost = recentP.qty > 0 ? (recentP.amount / recentP.qty) : 0;
                    let oldCost = oldP.qty > 0 ? (oldP.amount / oldP.qty) : 0;
                    let currentRate = currentS.rate || (currentS.qty > 0 ? (currentS.amount / currentS.qty) : 0);

                    if (oldCost > 0 && recentCost > oldCost * 1.05) { 
                        let oldMargin = ((currentRate - oldCost) / currentRate) * 100;
                        let newMargin = ((currentRate - recentCost) / currentRate) * 100;
                        if (newMargin < oldMargin && currentRate <= (oldCost * 1.5)) {
                            STATE.marginLeaks.push({ item, oldCost, recentCost, currentRate, drop: oldMargin - newMargin });
                        }
                    }
                }
            }

            // 4. Dead Stock, Stockout Risk, & Hot Items
            let t30 = new Date(); t30.setDate(now.getDate() - 30);
            let t7 = new Date(); t7.setDate(now.getDate() - 7);

            window.allInventory.forEach(inv => {
                let sales = itemTx[inv.name]?.sales || [];
                
                // Dead Stock (Unsold for 45+ days)
                let lastSaleDate = sales.length > 0 ? new Date(sales[0].date) : null;
                let daysSince = lastSaleDate ? Utils.daysDiff(lastSaleDate, now) : 999;
                let lockedCapital = inv.qty * inv.price;

                if (inv.qty > 0 && daysSince >= 45 && lockedCapital >= 200) {
                    STATE.deadStock.push({ item: inv.name, qty: inv.qty, days: daysSince, value: lockedCapital });
                }

                // Advanced Burn Rate / Stockout Predictor & Hot Items
                let recent30 = sales.filter(t => new Date(t.date) >= t30).reduce((sum, t) => sum + Number(t.qty), 0);
                let recent7 = sales.filter(t => new Date(t.date) >= t7).reduce((sum, t) => sum + Number(t.qty), 0);
                
                let dailyBurn = recent30 / 30;
                let burn7 = recent7 / 7;
                let prev23 = recent30 - recent7;
                let burn23 = prev23 / 23;

                // Stockout Risk (Running out in <= 10 days based on recent burn)
                if (dailyBurn > 0) {
                    let daysLeft = inv.qty / dailyBurn;
                    if (daysLeft <= 10 && daysLeft >= 0 && inv.qty > 0) {
                        STATE.stockoutRisks.push({ item: inv.name, daysLeft: Math.round(daysLeft), qty: inv.qty });
                    }
                }

                // Hot Items (Sales jumped >200% in last 7 days vs previous 23 days)
                if (burn23 > 0 && burn7 > (burn23 * 2) && recent7 > 5) {
                    STATE.hotItems.push({ item: inv.name, jump: Math.round(((burn7 - burn23) / burn23) * 100), recent7 });
                }
            });

            STATE.deadStock.sort((a,b) => b.value - a.value);
            STATE.stockoutRisks.sort((a,b) => a.daysLeft - b.daysLeft);
            STATE.hotItems.sort((a,b) => b.jump - a.jump);

            // 5. Item Level YoY Performance (Last 30 Days)
            let ly30Start = new Date(t30); ly30Start.setFullYear(ly30Start.getFullYear() - 1);
            let ly30End = new Date(now); ly30End.setFullYear(ly30End.getFullYear() - 1);

            let tySales = window.allTransactions.filter(t => t.type.includes('Sale') && new Date(t.date) >= t30);
            let lySales = window.allTransactions.filter(t => t.type.includes('Sale') && new Date(t.date) >= ly30Start && new Date(t.date) <= ly30End);

            let tyVol = {}; tySales.forEach(t => tyVol[t.item] = (tyVol[t.item] || 0) + Number(t.qty));
            let lyVol = {}; lySales.forEach(t => lyVol[t.item] = (lyVol[t.item] || 0) + Number(t.qty));

            new Set([...Object.keys(tyVol), ...Object.keys(lyVol)]).forEach(item => {
                let ty = tyVol[item] || 0, ly = lyVol[item] || 0;
                if (ly > 3) STATE.yoy.push({ item, ty, ly, change: ((ty - ly) / ly) * 100 });
            });
            STATE.yoy.sort((a,b) => a.change - b.change); // Biggest drops first

            // 6. Regional Event Prep
            let upcoming = getLocalEvents(now.getFullYear()).filter(e => {
                let diff = Utils.daysDiff(now, e.start);
                return diff >= -5 && diff <= 45; 
            });

            upcoming.forEach(e => {
                let lyStart = new Date(e.start); lyStart.setFullYear(lyStart.getFullYear() - 1);
                let lyEnd = new Date(e.end); lyEnd.setFullYear(lyEnd.getFullYear() - 1);

                let lyEventSales = window.allTransactions.filter(t => t.type.includes('Sale') && new Date(t.date) >= lyStart && new Date(t.date) <= lyEnd);
                
                let vol = {};
                lyEventSales.forEach(t => vol[t.item] = (vol[t.item] || 0) + Number(t.qty));
                let topItems = Object.keys(vol).sort((a,b) => vol[b] - vol[a]).slice(0, 3);

                let eventAction = "";
                topItems.forEach(item => {
                    let lyQty = vol[item];
                    let inv = window.allInventory.find(i => i.name === item);
                    let currentStock = inv ? inv.qty : 0;
                    if (currentStock < lyQty * 0.7) {
                        eventAction += `<li><b class="text-gray-900 dark:text-white" data-evt-item="${item}">${item}</b>: Stock is ${currentStock}. Last year sold ${lyQty}.</li>`;
                    }
                });

                STATE.events.push({
                    name: e.name, type: e.type, days: Utils.daysDiff(now, e.start),
                    actionHtml: eventAction || "<li class='text-green-600 font-semibold'>Stock levels look sufficient based on last year's pattern.</li>"
                });
            });

            // 7. Generate "Sharp Insights"
            if (STATE.stockoutRisks.length > 0) {
                STATE.insights.push({ type: 'stockout', icon: '⚠️', text: `<b>Restock Alert:</b> <b>${STATE.stockoutRisks[0].item}</b> is selling incredibly fast. Expected to run out of stock in approx ${STATE.stockoutRisks[0].daysLeft} days!` });
            }
            if (STATE.monthlyYoY.change <= -10) {
                STATE.insights.push({ type: 'yoy', icon: '🚨', text: `<b>Revenue Warning:</b> You are down ${Math.abs(STATE.monthlyYoY.change).toFixed(1)}% this month compared to exactly the same time last year.`});
            } else if (STATE.monthlyYoY.change >= 15) {
                STATE.insights.push({ type: 'yoy', icon: '🚀', text: `<b>Massive Growth:</b> You are up ${STATE.monthlyYoY.change.toFixed(1)}% this month compared to last year. Keep it up!`});
            }
            if (STATE.events.length > 0 && STATE.events[0].actionHtml.includes('<b')) {
                STATE.insights.push({ type: 'event', icon: '🎪', text: `<b>${STATE.events[0].name} is approaching.</b> Check the Event Radar to restock items that sold out fast last year.` });
            }
            if (STATE.marginLeaks.length > 0) {
                STATE.insights.push({ type: 'margin', icon: '💸', text: `<b>Silent Margin Leak:</b> Purchase cost for <b>${STATE.marginLeaks[0].item}</b> has gone up, but you are still selling it for the same old price. Profit is bleeding.` });
            }
        }
    };

    const UI = {
        injectCSS() {
            if (document.getElementById('te-styles')) return;
            const style = document.createElement('style');
            style.id = 'te-styles';
            style.textContent = `
                .te-wrapper { font-family: 'Inter', sans-serif; display: flex; flex-direction: column; gap: 24px; padding-bottom: 20px;}
                .te-section-title { font-size: 14px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 16px; }
                .dark-mode .te-section-title { color: #9ca3af; border-color: #374151; }
                
                .te-insight-card { display: flex; gap: 16px; padding: 16px; border-radius: 12px; background: white; border: 1px solid #e5e7eb; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 12px; align-items: center; cursor: pointer; transition: transform 0.2s; }
                .te-insight-card:active, .te-insight-card:hover { transform: translateY(-2px); border-color: #3b82f6; }
                .dark-mode .te-insight-card { background: #1f2937; border-color: #374151; }
                .te-insight-icon { font-size: 28px; flex-shrink: 0; background: #f3f4f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
                .dark-mode .te-insight-icon { background: #374151; }
                .te-insight-text { font-size: 14px; color: #374151; line-height: 1.5; }
                .dark-mode .te-insight-text { color: #e5e7eb; }
                
                .te-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
                @media(min-width: 768px) { .te-grid { grid-template-columns: 1fr 1fr; } }
                
                .te-data-card { background: white; border-radius: 12px; border: 1px solid #e5e7eb; padding: 16px; overflow: hidden; position: relative; }
                .dark-mode .te-data-card { background: #1f2937; border-color: #374151; }
                .te-card-strip { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; }
                
                .te-event-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
                .te-event-title { font-size: 16px; font-weight: bold; color: #111827; }
                .dark-mode .te-event-title { color: #f9fafb; }
                .te-event-days { font-size: 12px; font-weight: bold; padding: 4px 8px; border-radius: 12px; background: #fee2e2; color: #b91c1c; }
                .te-event-list { list-style: disc; padding-left: 16px; font-size: 13px; color: #4b5563; margin-top: 8px; line-height: 1.6; }
                .dark-mode .te-event-list { color: #9ca3af; }
                
                .te-table-wrap { overflow-x: auto; background: white; border: 1px solid #e5e7eb; border-radius: 12px; }
                .dark-mode .te-table-wrap { background: #1f2937; border-color: #374151; }
                .te-table { width: 100%; text-align: left; border-collapse: collapse; font-size: 13px; }
                .te-table th { background: #f9fafb; padding: 12px 16px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
                .dark-mode .te-table th { background: #374151; color: #d1d5db; border-color: #4b5563; }
                .te-table td { padding: 12px 16px; border-bottom: 1px solid #f3f4f6; color: #111827; }
                .dark-mode .te-table td { border-color: #374151; color: #f9fafb; }
                
                .text-red { color: #ef4444 !important; font-weight: bold; }
                .text-green { color: #10b981 !important; font-weight: bold; }
                .text-orange { color: #f97316 !important; font-weight: bold; }
                .text-muted { color: #9ca3af !important; font-size: 11px; }

                #te-drill-modal { display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 16px; }
                .te-drill-content { background: white; width: 100%; max-width: 600px; max-height: 80vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .dark-mode .te-drill-content { background: #1f2937; border: 1px solid #374151; }
                .te-drill-header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
                .dark-mode .te-drill-header { border-color: #374151; }
                .te-drill-body { overflow-y: auto; padding: 0; background: #f9fafb; max-height: 60vh;}
                .dark-mode .te-drill-body { background: #111827; }
                .te-tx-row { padding: 12px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 13px; background: white; }
                .dark-mode .te-tx-row { background: #1f2937; border-color: #374151; }
            `;
            document.head.appendChild(style);
        },

        render(containerId) {
            this.injectCSS();
            const el = document.getElementById(containerId);
            if (!el) return;

            if (!window.allTransactions || window.allTransactions.length === 0 || !window.allInventory) {
                el.innerHTML = `
                <div class="p-8 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <i class="fa-solid fa-cloud-arrow-down text-3xl text-gray-300 mb-3 block"></i>
                    <p class="text-gray-500 font-medium">Please wait while transactions and inventory data are syncing...</p>
                    <button onclick="TrendEngine.refresh()" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded shadow text-sm font-bold">Refresh Connection</button>
                </div>`;
                return;
            }

            Analyzer.run();

            // 1. Month YoY Banner HTML
            let yoyChangeClass = STATE.monthlyYoY.change >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            let yoyBannerHtml = `
                <div class="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-between items-center mb-6 shadow-sm">
                    <div>
                        <div class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Current Month vs Last Year</div>
                        <div class="flex items-center gap-3">
                            <span class="text-3xl font-bold text-gray-900 dark:text-white">${Utils.money(STATE.monthlyYoY.cmSales)}</span>
                            <span class="text-xs font-bold px-2 py-1 rounded-md ${yoyChangeClass}">
                                ${STATE.monthlyYoY.change >= 0 ? '▲' : '▼'} ${Math.abs(STATE.monthlyYoY.change).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                    <div class="text-right hidden sm:block">
                        <div class="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Same Month Last Year</div>
                        <div class="text-xl font-bold text-gray-400 dark:text-gray-500">${Utils.money(STATE.monthlyYoY.lymSales)}</div>
                    </div>
                </div>`;

            // 2. INSIGHTS HTML
            let insightsHtml = STATE.insights.map(i => `
                <div class="te-insight-card" onclick="TrendEngine.openDrillDown('${i.type}')">
                    <div class="te-insight-icon">${i.icon}</div>
                    <div class="te-insight-text">${i.text} <br><span class="text-blue-500 text-xs font-bold mt-1 inline-block"><i class="fa-solid fa-list text-[10px] mr-1"></i> Tap for history</span></div>
                </div>
            `).join('');

            // 3. HOT ITEMS (Velocity HTML)
            let hotHtml = STATE.hotItems.slice(0, 5).map(h => `
                <tr>
                    <td class="font-medium cursor-pointer text-blue-500 hover:underline" onclick="TrendEngine.openDrillDownItem('${h.item}')">${h.item}</td>
                    <td class="text-right text-green">↑ ${h.jump}%</td>
                    <td class="text-right">${h.recent7} units</td>
                </tr>
            `).join('');

            // 4. STOCKOUT RISKS HTML
            let riskHtml = STATE.stockoutRisks.slice(0, 5).map(r => `
                <tr>
                    <td class="font-medium cursor-pointer text-blue-500 hover:underline" onclick="TrendEngine.openDrillDownItem('${r.item}')">${r.item}</td>
                    <td class="text-right text-orange">${r.daysLeft} Days</td>
                    <td class="text-right text-muted">${r.qty} left</td>
                </tr>
            `).join('');

            // 5. REGIONAL EVENT RADAR
            let eventsHtml = STATE.events.slice(0, 2).map(e => `
                <div class="te-data-card">
                    <div class="te-card-strip" style="background:#8b5cf6"></div>
                    <div class="te-event-header">
                        <div class="te-event-title">${e.name}</div>
                        <div class="te-event-days">${e.days === 0 ? 'Happening Now' : (e.days < 0 ? 'Started' : 'In ' + e.days + ' Days')}</div>
                    </div>
                    <div class="text-xs font-bold text-gray-500 dark:text-gray-400">YOUR PAST PATTERNS SHOW:</div>
                    <ul class="te-event-list">${e.actionHtml}</ul>
                </div>
            `).join('');

            // 6. DEAD STOCK HTML
            let deadHtml = STATE.deadStock.slice(0, 5).map(d => `
                <tr>
                    <td class="font-medium cursor-pointer text-blue-500 hover:underline" onclick="TrendEngine.openDrillDownItem('${d.item}')">${d.item}</td>
                    <td class="text-right text-red">${d.days} days</td>
                    <td class="text-right font-bold text-gray-900 dark:text-white">${Utils.money(d.value)}</td>
                </tr>
            `).join('');


            // Full Render
            el.innerHTML = `
                <div class="te-wrapper">
                    <div class="flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900 mb-2">
                        <div>
                            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-1"><i class="fa-solid fa-brain text-blue-500 mr-2"></i> Shop Intelligence</h2>
                            <p class="text-xs text-blue-600 dark:text-blue-300">Predictive retail analytics based on your data history</p>
                        </div>
                        <button id="te-btn-sync" onclick="TrendEngine.refresh()" class="bg-white hover:bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 shadow-sm border border-blue-200 dark:border-gray-600 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center min-w-[100px]">
                            <i class="fa-solid fa-rotate mr-2"></i> Resync
                        </button>
                    </div>

                    ${yoyBannerHtml}

                    <div>
                        <div class="te-section-title"><i class="fa-solid fa-bolt text-yellow-400 mr-1"></i> Fast Actions & Diagnostics</div>
                        ${insightsHtml || '<div class="text-sm text-gray-500 border rounded-xl p-4 text-center">Business looking smooth right now. No urgent diagnostic alerts.</div>'}
                    </div>

                    <div class="te-grid mt-2">
                        <div>
                            <div class="te-section-title">🔥 Trending Up (Last 7 Days)</div>
                            <div class="te-table-wrap">
                                <table class="te-table">
                                    <thead><tr><th>Item</th><th class="text-right">Velocity Jump</th><th class="text-right">7-Day Sales</th></tr></thead>
                                    <tbody>${hotHtml || '<tr><td colspan="3" class="text-center text-muted py-8">No significant spikes in velocity detected this week.</td></tr>'}</tbody>
                                </table>
                            </div>
                        </div>

                        <div>
                            <div class="te-section-title">⚠️ Stockout Warning (< 10 Days)</div>
                            <div class="te-table-wrap">
                                <table class="te-table">
                                    <thead><tr><th>Item Name</th><th class="text-right">Runs Out In</th><th class="text-right">Current Stock</th></tr></thead>
                                    <tbody>${riskHtml || '<tr><td colspan="3" class="text-center text-muted py-8">Your inventory levels look healthy for current sales velocities.</td></tr>'}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div class="te-grid mt-4">
                        <div>
                            <div class="te-section-title">📅 Tier-3 Local Festival Engine</div>
                            <div class="flex flex-col gap-3">${eventsHtml || '<div class="text-sm text-gray-500 border rounded-xl p-4 text-center">No upcoming major regional events in the next 45 days.</div>'}</div>
                        </div>

                        <div>
                            <div class="te-section-title">💀 Rotting Stock Detector</div>
                            <div class="te-table-wrap">
                                <table class="te-table">
                                    <thead><tr><th>Product Name</th><th class="text-right">Unsold For</th><th class="text-right">Capital Stuck</th></tr></thead>
                                    <tbody>${deadHtml || '<tr><td colspan="3" class="text-center text-muted py-8">Great job! You have very little capital rotting in old inventory.</td></tr>'}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- POPUP DRILL DOWN MENU -->
                <div id="te-drill-modal">
                    <div class="te-drill-content">
                        <div class="te-drill-header">
                            <h3 id="te-drill-title" class="font-bold text-lg text-gray-900 dark:text-white">Under The Hood: Transaction Level</h3>
                            <button onclick="document.getElementById('te-drill-modal').style.display='none'" class="text-gray-400 hover:text-gray-800 dark:hover:text-white text-3xl font-light leading-none cursor-pointer">&times;</button>
                        </div>
                        <div id="te-drill-body" class="te-drill-body"></div>
                    </div>
                </div>
            `;
        },

        showDrillDown(title, transactions) {
            document.getElementById('te-drill-title').innerText = title;
            let body = document.getElementById('te-drill-body');
            
            if (!transactions || transactions.length === 0) {
                body.innerHTML = `<div class="p-8 text-center text-gray-500">No raw records found directly correlated to this pattern yet.</div>`;
            } else {
                body.innerHTML = transactions.map(t => {
                    let typeClass = t.type.includes('Purchase') ? 'bg-red-50 text-red-600 dark:bg-red-900/30' : 'bg-green-50 text-green-600 dark:bg-green-900/30';
                    return `
                    <div class="te-tx-row items-center hover:bg-gray-50 transition-colors">
                        <div class="flex items-center gap-3">
                            <div class="${typeClass} p-2 rounded-full w-8 h-8 flex justify-center items-center font-bold text-[10px] shrink-0">
                                <i class="${t.type.includes('Purchase') ? 'fa-solid fa-arrow-right-to-bracket' : 'fa-solid fa-arrow-right-from-bracket'}"></i>
                            </div>
                            <div>
                                <div class="font-bold text-gray-900 dark:text-white text-sm leading-tight mb-1">${t.item}</div>
                                <div class="text-muted">${Utils.formatDate(t.date)} &bull; ${t.type}</div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="font-bold text-gray-900 dark:text-white">${Utils.money(t.amount)}</div>
                            <div class="text-muted mt-1 whitespace-nowrap">x${t.qty} @ ${Utils.money(t.amount/t.qty)} each</div>
                        </div>
                    </div>`;
                }).join('');
            }
            document.getElementById('te-drill-modal').style.display = 'flex';
        }
    };

    return {
        init(db) { }, 
        
        renderTab(containerId) {
            UI.render(containerId);
        },

        // FIXED REFRESH BUTTON LOGIC with UI spinner
        refresh() {
            const btn = document.getElementById('te-btn-sync');
            if (btn) {
                const ogText = btn.innerHTML;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Syncing...`;
                btn.disabled = true;
                
                // Allow UI to breathe and show spinner before heavy JS recalculations
                setTimeout(() => {
                    UI.render('trend-tab-container');
                }, 400); 
            } else {
                UI.render('trend-tab-container');
            }
        },

        openDrillDownItem(item) {
            let txs = window.allTransactions.filter(t => t.item === item).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
            UI.showDrillDown(`Data For: ${item}`, txs);
        },

        openDrillDown(insightType) {
            let itemSet = [];
            let modalTitle = "";

            if (insightType === 'margin') {
                modalTitle = "Margin Killers (History Tracker)";
                itemSet = STATE.marginLeaks.map(x => x.item);
            } 
            else if (insightType === 'dead') {
                modalTitle = "Stuck Items History (Old Invoices)";
                itemSet = STATE.deadStock.map(x => x.item);
            }
            else if (insightType === 'yoy') {
                modalTitle = "Year-Over-Year Tracker";
                itemSet = STATE.yoy.slice(0, 10).map(x => x.item);
            }
            else if (insightType === 'event') {
                modalTitle = "Previous Festival Successes";
                let domElts = document.querySelectorAll('b[data-evt-item]');
                domElts.forEach(el => itemSet.push(el.getAttribute('data-evt-item')));
            }
            else if (insightType === 'stockout') {
                modalTitle = "Fast Moving (Stockout Risk Items)";
                itemSet = STATE.stockoutRisks.map(x => x.item);
            }

            let matchingTxs = window.allTransactions
                .filter(t => itemSet.includes(t.item))
                .sort((a,b) => new Date(b.date) - new Date(a.date))
                .slice(0, 80); 
            
            UI.showDrillDown(modalTitle, matchingTxs);
        }
    };

})();

window.TrendEngine = TrendEngine;
