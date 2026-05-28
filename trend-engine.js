// ============================================================================
// TIER-6 EXECUTIVE AI PREDICTIVE ENGINE (ROORKEE REGION SPECIALIZED)
// MBA-Style UI/UX: Smart Structure, High-Density Data, Modern SaaS Aesthetics
// Features: Z-Score, EMA Forecasting, Dynamic Firebase Imports, Real-time Sync
// ============================================================================

const TrendEngine = (() => {
    // --- STATE MANAGEMENT ---
    const STATE = {
        focusedEventId: null, 
        healthMetrics: { optimal: 0, stockoutRisk: 0, overstocked: 0, capitalAtRisk: 0 }, 
        events: [],
        forecast: [],
        deadStock: [],
        hotItems: [],
        cssInjected: false
    };

    // --- STANDALONE FIREBASE IMPORTER (No app.js changes needed) ---
    let fsModule = null;
    const loadFirestore = async () => {
        if (!fsModule) fsModule = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        return fsModule;
    };

    // --- 1. ROORKEE-SPECIFIC DYNAMIC EVENT GENERATOR ---
    const getLocalEvents = (year) => {
        const createEvent = (id, name, month, day, type, preDays = 7, postDays = 1) => {
            let eventDate = new Date(year, month - 1, day);
            let start = new Date(eventDate);
            start.setDate(start.getDate() - preDays); 
            let end = new Date(eventDate);
            end.setDate(end.getDate() + postDays); 
            return { id: id + '_' + year, name: name, start: start, end: end, type: type, exactDate: eventDate };
        };

        return [
            createEvent('lohri', "Lohri / Makar Sankranti", 1, 13, 'festival', 5, 1),
            createEvent('republic_day', "Republic Day", 1, 26, 'national', 3, 1),
            createEvent('maha_shivaratri', "Maha Shivaratri", 2, 26, 'festival', 7, 1),
            createEvent('holi', "Holi", 3, 14, 'festival', 15, 2),
            createEvent('eid_al_fitr', "Eid al-Fitr", 3, 30, 'festival', 10, 2),
            createEvent('baisakhi', "Baisakhi", 4, 13, 'festival', 5, 1),
            createEvent('kanwar_yatra', "Kanwar Yatra (Highway Peak)", 7, 25, 'local_peak', 15, 5),
            createEvent('iit_session', "IIT/College Session Start", 7, 20, 'education', 15, 10),
            createEvent('independence_day', "Independence Day", 8, 15, 'national', 3, 1),
            createEvent('raksha_bandhan', "Raksha Bandhan", 8, 19, 'festival', 10, 1),
            createEvent('janmashtami', "Janmashtami", 8, 26, 'festival', 5, 1),
            createEvent('kaliyar_urs', "Piran Kaliyar Sharif Urs", 9, 15, 'local_festival', 7, 3), 
            createEvent('dussehra', "Dussehra", 10, 12, 'festival', 10, 2),
            createEvent('karwa_chauth', "Karwa Chauth", 10, 20, 'festival', 7, 1),
            createEvent('diwali', "Diwali & Dhanteras", 10, 31, 'festival', 20, 3),
            { id: 'winter_drop_' + year, name: 'North India Winter Drop', start: new Date(`${year}-11-20`), end: new Date(`${year+1}-01-20`), type: 'climate', exactDate: new Date(`${year}-12-15`) },
            { id: 'wedding_s_' + year, name: 'Summer Weddings', start: new Date(`${year}-04-15`), end: new Date(`${year}-06-15`), type: 'wedding', exactDate: new Date(`${year}-05-15`) }
        ];
    };

    // --- 2. ADVANCED MATHEMATICAL MODELS ---
    const MathUtils = {
        mean: arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
        stdDev: arr => {
            if (arr.length < 2) return 0;
            const m = MathUtils.mean(arr);
            const variance = arr.reduce((sq, n) => sq + Math.pow(n - m, 2), 0) / (arr.length - 1);
            return Math.sqrt(variance);
        },
        zScore: (val, arr) => {
            const std = MathUtils.stdDev(arr);
            return std === 0 ? 0 : (val - MathUtils.mean(arr)) / std;
        },
        ema: (arr, period) => {
            if (!arr.length) return 0;
            const k = 2 / (period + 1);
            return arr.reduce((acc, val, idx) => idx === 0 ? val : (val * k) + (acc * (1 - k)), arr[0]);
        }
    };

    const Utils = {
        money: v => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        formatDate: d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    };

    // --- 3. DATA ANALYZER ENGINE ---
    const Analyzer = {
        run() {
            if (!window.allTransactions || !window.allInventory) return;
            
            STATE.events = []; STATE.deadStock = []; 
            STATE.hotItems = []; STATE.forecast = [];
            STATE.healthMetrics = { optimal: 0, stockoutRisk: 0, overstocked: 0, capitalAtRisk: 0 };

            const now = new Date();
            const currentYear = now.getFullYear();
            
            // Map Customer Requests with Intensity Weights
            const reqMap = {};
            (window.allRequests || []).forEach(r => {
                const intensityMultipliers = { '1': 0.5, '2': 1.0, '3': 1.5, '4': 2.5 }; 
                const weight = intensityMultipliers[r.intensity] || 1.0;
                if(!reqMap[r.item.toLowerCase()]) reqMap[r.item.toLowerCase()] = { qty: 0, weight: 0, rawQty: 0 };
                reqMap[r.item.toLowerCase()].qty += (Number(r.qty) * weight);
                reqMap[r.item.toLowerCase()].rawQty += Number(r.qty);
                reqMap[r.item.toLowerCase()].weight = Math.max(reqMap[r.item.toLowerCase()].weight, weight);
            });

            // Process Transactions
            const itemTx = {};
            let totalTySales = 0, totalLySales = 0;
            window.allTransactions.forEach(t => {
                if (!itemTx[t.item]) itemTx[t.item] = { sales: [], purchases: [] };
                if (t.type.includes('Sale')) {
                    itemTx[t.item].sales.push(t);
                    let d = new Date(t.date);
                    if (d.getFullYear() === currentYear) totalTySales += Number(t.amount);
                    if (d.getFullYear() === currentYear - 1) totalLySales += Number(t.amount);
                }
            });

            const globalGrowthFactor = totalLySales > 0 ? Math.min(Math.max(totalTySales / totalLySales, 0.5), 1.5) : 1.1;
            let allEvents = [...getLocalEvents(currentYear), ...getLocalEvents(currentYear + 1)];
            let focusedEvent = STATE.focusedEventId ? allEvents.find(e => e.id === STATE.focusedEventId) : null;

            // Generate Timeline Data
            window.allInventory.forEach(inv => {
                let sales = itemTx[inv.name]?.sales || [];
                let weeklySales = [0, 0, 0, 0];
                let today = new Date();
                
                sales.forEach(t => {
                    let diffDays = Math.floor((today - new Date(t.date)) / 86400000);
                    if (diffDays <= 7) weeklySales[0] += Number(t.qty);
                    else if (diffDays <= 14) weeklySales[1] += Number(t.qty);
                    else if (diffDays <= 21) weeklySales[2] += Number(t.qty);
                    else if (diffDays <= 28) weeklySales[3] += Number(t.qty);
                });

                let recent7 = weeklySales[0];
                let reqData = reqMap[inv.name.toLowerCase()] || { qty: 0, weight: 0, rawQty: 0 };
                
                // SPIKE DETECTION
                let zScore = MathUtils.zScore(recent7, weeklySales.slice(1)); 
                let isSpike = zScore > 1.5 && recent7 > 2; 
                
                if (isSpike || reqData.weight >= 1.5) {
                    STATE.hotItems.push({ 
                        item: inv.name, zScore, recent7, requests: reqData.rawQty, score: (zScore * 10) + (reqData.weight * 20)
                    });
                }

                // ADVANCED FORECASTING
                let pastDemand = 0;
                if (focusedEvent) {
                    let lyStart = new Date(focusedEvent.start); lyStart.setFullYear(lyStart.getFullYear() - 1);
                    let lyEnd = new Date(focusedEvent.end); lyEnd.setFullYear(lyEnd.getFullYear() - 1);
                    pastDemand = sales.filter(t => new Date(t.date) >= lyStart && new Date(t.date) <= lyEnd).reduce((sum, t) => sum + Number(t.qty), 0);
                }

                let baselineEMA = MathUtils.ema(weeklySales.reverse(), 4); 
                let projectedQty = Math.ceil((baselineEMA * (focusedEvent ? 0.3 : 0.8)) + (pastDemand * globalGrowthFactor * (focusedEvent ? 0.7 : 0.2)) + reqData.qty);
                let demandIntensityScore = (zScore * 10) + (reqData.qty * 5) + (pastDemand * globalGrowthFactor);

                let intensityObj = { label: 'Steady', class: 'te-badge-steady' };
                if (demandIntensityScore > 30 || reqData.weight > 2) intensityObj = { label: 'Critical', class: 'te-badge-critical' };
                else if (demandIntensityScore > 15 || zScore > 1.5) intensityObj = { label: 'High Velocity', class: 'te-badge-high' };

                if (inv.qty > 0 || projectedQty > 0) {
                    if (projectedQty > inv.qty && projectedQty > 0) STATE.healthMetrics.stockoutRisk++;
                    else if (inv.qty > (projectedQty * 3) && inv.qty > 5) STATE.healthMetrics.overstocked++;
                    else if (inv.qty > 0) STATE.healthMetrics.optimal++;
                }

                if (projectedQty > 0 || reqData.rawQty > 0) { 
                    let gap = projectedQty - Number(inv.qty);
                    if (gap > 0 || reqData.rawQty > 0) {
                        STATE.forecast.push({ item: inv.name, projected: projectedQty, currentStock: inv.qty, suggestedOrder: gap > 0 ? gap : 0, intensity: intensityObj, score: demandIntensityScore });
                    }
                }

                // DEAD STOCK
                let lastSaleDate = sales.length > 0 ? new Date(sales[sales.length - 1].date) : null;
                let daysSince = lastSaleDate ? Math.floor((today - lastSaleDate) / 86400000) : 999;
                let lockedCapital = inv.qty * inv.price;

                if (inv.qty > 0 && daysSince >= 45 && lockedCapital >= 100) {
                    STATE.deadStock.push({ item: inv.name, qty: inv.qty, days: daysSince, value: lockedCapital });
                    STATE.healthMetrics.capitalAtRisk += lockedCapital;
                }
            });
            
            STATE.forecast.sort((a,b) => b.score - a.score); 
            STATE.deadStock.sort((a,b) => b.value - a.value);
            STATE.hotItems.sort((a,b) => b.score - a.score);

            // EVENTS
            let upcomingEvents = allEvents.filter(e => e.exactDate >= now).sort((a, b) => a.exactDate - b.exactDate).slice(0, 3);
            if (focusedEvent && !upcomingEvents.find(e => e.id === focusedEvent.id)) upcomingEvents.unshift(focusedEvent);

            upcomingEvents.forEach(e => {
                let lyStart = new Date(e.start); lyStart.setFullYear(lyStart.getFullYear() - 1);
                let lyEnd = new Date(e.end); lyEnd.setFullYear(lyEnd.getFullYear() - 1);

                let lyEventSales = window.allTransactions.filter(t => t.type.includes('Sale') && new Date(t.date) >= lyStart && new Date(t.date) <= lyEnd);
                let vol = {}; lyEventSales.forEach(t => vol[t.item] = (vol[t.item] || 0) + Number(t.qty));
                let topItems = Object.keys(vol).sort((a,b) => vol[b] - vol[a]).slice(0, 3);

                let eventAction = "";
                topItems.forEach(item => {
                    let lyQty = vol[item];
                    let inv = window.allInventory.find(i => i.name === item);
                    let currentStock = inv ? inv.qty : 0;
                    if (currentStock < lyQty * 0.8) {
                        eventAction += `<div class="flex justify-between items-center py-1"><span class="text-sm font-medium truncate pr-2">${item}</span><span class="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">Need ${Math.ceil(lyQty * globalGrowthFactor)}</span></div>`;
                    }
                });

                STATE.events.push({
                    name: e.name, days: Math.floor((e.exactDate - now) / 86400000), isFocused: e.id === STATE.focusedEventId,
                    actionHtml: eventAction || "<div class="+"text-sm text-green-600 font-medium py-2"+"><i class='fa-solid fa-check-circle mr-1'></i> Inventory aligned for event.</div>"
                });
            });
        }
    };

    // --- 4. MBA SMART STRUCTURE UI RENDERER ---
    const UI = {
        injectCSS() {
            if (STATE.cssInjected) return;
            const style = document.createElement('style');
            style.innerHTML = `
                /* MBA Dashboard Scoped CSS */
                .te-mba-container { font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
                .te-mba-card { background: #ffffff; border-radius: 16px; border: 1px solid #eaebec; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02); overflow: hidden; display: flex; flex-direction: column; }
                .dark-mode .te-mba-card { background: #18181b; border-color: #27272a; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); }
                
                .te-mba-header { padding: 20px 24px; border-bottom: 1px solid #eaebec; }
                .dark-mode .te-mba-header { border-color: #27272a; }
                .te-mba-title { font-size: 0.875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #52525b; display: flex; align-items: center; gap: 8px;}
                .dark-mode .te-mba-title { color: #a1a1aa; }
                
                .te-mba-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
                .te-mba-kpi { padding: 20px; border-radius: 12px; border: 1px solid #eaebec; background: #fafafa; }
                .dark-mode .te-mba-kpi { background: #121214; border-color: #27272a; }
                .te-mba-kpi-val { font-size: 2rem; font-weight: 800; line-height: 1.1; margin-top: 8px; color: #09090b; }
                .dark-mode .te-mba-kpi-val { color: #ffffff; }
                
                .te-mba-table-wrap { overflow-x: auto; width: 100%; }
                .te-mba-table { width: 100%; text-align: left; border-collapse: collapse; min-width: 600px; }
                .te-mba-table th { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; padding: 12px 24px; background: #fafafa; border-bottom: 1px solid #eaebec; white-space: nowrap;}
                .dark-mode .te-mba-table th { background: #121214; color: #a1a1aa; border-color: #27272a; }
                .te-mba-table td { font-size: 0.875rem; color: #27272a; padding: 16px 24px; border-bottom: 1px solid #f4f4f5; vertical-align: middle; white-space: nowrap;}
                .dark-mode .te-mba-table td { color: #e4e4e7; border-color: #27272a; }
                .te-mba-table tr:hover td { background: #fafafa; }
                .dark-mode .te-mba-table tr:hover td { background: #1f1f22; }
                
                /* Badges */
                .te-badge { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; }
                .te-badge-steady { background: #f1f5f9; color: #475569; }
                .dark-mode .te-badge-steady { background: #1e293b; color: #94a3b8; }
                .te-badge-high { background: #fef3c7; color: #b45309; }
                .dark-mode .te-badge-high { background: #78350f; color: #fde68a; }
                .te-badge-critical { background: #fee2e2; color: #b91c1c; }
                .dark-mode .te-badge-critical { background: #7f1d1d; color: #fca5a5; }
                .te-badge-order { background: #2563eb; color: #ffffff; box-shadow: 0 2px 4px rgba(37,99,235,0.2); }
                
                /* Input Forms */
                .te-mba-input { width: 100%; background: #ffffff; border: 1px solid #d4d4d8; border-radius: 8px; padding: 10px 14px; font-size: 0.875rem; color: #09090b; outline: none; transition: border-color 0.2s; }
                .dark-mode .te-mba-input { background: #09090b; border-color: #3f3f46; color: #ffffff; }
                .te-mba-input:focus { border-color: #2563eb; ring: 2px solid #2563eb; }
                .te-mba-btn { background: #2563eb; color: white; border: none; border-radius: 8px; padding: 10px 16px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: background 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 8px;}
                .te-mba-btn:hover { background: #1d4ed8; }
            `;
            document.head.appendChild(style);
            STATE.cssInjected = true;
        },

        render(containerId) {
            this.injectCSS();
            const el = document.getElementById(containerId);
            if (!el) return;

            if (!window.allTransactions || !window.allInventory) {
                el.innerHTML = `<div class="p-8 text-center text-gray-500 font-medium">Initializing Executive Engine...</div>`;
                return;
            }

            Analyzer.run();

            // 1. Forecast Table
            let forecastHtml = STATE.forecast.slice(0, 10).map(f => `
                <tr>
                    <td class="font-semibold">${f.item}</td>
                    <td><span class="te-badge ${f.intensity.class}">${f.intensity.label}</span></td>
                    <td class="text-right text-gray-500">${f.currentStock}</td>
                    <td class="text-right font-bold">${f.projected}</td>
                    <td class="text-right"><span class="te-badge te-badge-order">+${f.suggestedOrder}</span></td>
                </tr>
            `).join('');

            // 2. Velocity Anomalies (Hot Items)
            let hotHtml = STATE.hotItems.slice(0, 8).map(h => `
                <tr>
                    <td class="font-semibold">${h.item}</td>
                    <td class="text-center">
                        ${h.zScore > 2 ? '<span class="text-red-600 font-bold"><i class="fa-solid fa-arrow-trend-up"></i> Severe</span>' : '<span class="text-amber-600 font-bold">Elevated</span>'}
                    </td>
                    <td class="text-center font-bold ${h.requests > 0 ? 'text-blue-600' : 'text-gray-400'}">${h.requests > 0 ? h.requests : '-'}</td>
                    <td class="text-right">${h.recent7} units</td>
                </tr>
            `).join('');

            // 3. Customer Requests
            let requestsHtml = (window.allRequests || []).map(r => {
                const badgeMap = { '1': { c: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300', l: 'Casual' }, '2': { c: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', l: 'Normal' }, '3': { c: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300', l: 'Urgent' }, '4': { c: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', l: 'Critical' } };
                let b = badgeMap[r.intensity] || badgeMap['2'];
                return `
                <div class="flex justify-between items-center py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div>
                        <div class="font-semibold text-sm text-gray-900 dark:text-white">${r.item} <span class="font-normal text-gray-500">(x${r.qty})</span></div>
                        <div class="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${b.c}">${b.l}</div>
                    </div>
                    <button onclick="TrendEngine.deleteRequest('${r.id}')" class="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-lg transition-colors"><i class="fa-solid fa-check mr-1"></i> Resolve</button>
                </div>
            `}).join('');

            // 4. Events
            let eventOptions = [...getLocalEvents(new Date().getFullYear()), ...getLocalEvents(new Date().getFullYear() + 1)]
                .filter(e => e.exactDate >= new Date() || e.id === STATE.focusedEventId).sort((a,b) => a.exactDate - b.exactDate)
                .map(e => `<option value="${e.id}" ${STATE.focusedEventId === e.id ? 'selected' : ''}>${e.name} (${Utils.formatDate(e.exactDate)})</option>`).join('');

            let eventsHtml = STATE.events.map(e => `
                <div class="border-b border-gray-100 dark:border-gray-800 last:border-0 py-4 ${e.isFocused ? 'bg-blue-50/50 dark:bg-blue-900/10 px-3 rounded-lg -mx-3' : ''}">
                    <div class="flex justify-between items-center mb-2">
                        <div class="font-bold text-sm text-gray-900 dark:text-white">${e.name}</div>
                        <div class="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">${e.days <= 0 ? 'Active Now' : e.days+' Days'}</div>
                    </div>
                    <div class="space-y-1">${e.actionHtml}</div>
                </div>
            `).join('');

            // MBA Dashboard Assembly
            el.innerHTML = `
                <div class="te-mba-container">
                    
                    <!-- Header -->
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                        <div>
                            <h2 class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-1">Executive Market Intelligence</h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400 font-medium">Algorithmic demand forecasting for the Roorkee region.</p>
                        </div>
                        <div class="w-full md:w-auto">
                            <select onchange="TrendEngine.setEvent(this.value)" class="te-mba-input w-full md:w-64 font-semibold cursor-pointer">
                                <option value="">-- Auto-Detect Upcoming Event --</option>
                                ${eventOptions}
                            </select>
                        </div>
                    </div>

                    <!-- Executive KPIs -->
                    <div class="te-mba-kpi-grid">
                        <div class="te-mba-kpi">
                            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest">Stockout Risk</div>
                            <div class="te-mba-kpi-val text-red-600 dark:text-red-500">${STATE.healthMetrics.stockoutRisk} <span class="text-sm text-gray-400 font-normal">SKUs</span></div>
                        </div>
                        <div class="te-mba-kpi">
                            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest">Capital Trapped (45d+)</div>
                            <div class="te-mba-kpi-val">${Utils.money(STATE.healthMetrics.capitalAtRisk)}</div>
                        </div>
                        <div class="te-mba-kpi">
                            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest">Optimal Flow</div>
                            <div class="te-mba-kpi-val text-emerald-600 dark:text-emerald-500">${STATE.healthMetrics.optimal} <span class="text-sm text-gray-400 font-normal">SKUs</span></div>
                        </div>
                    </div>

                    <!-- Main Grid -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-12">
                        
                        <!-- Left Column: Data Tables (Col Span 2) -->
                        <div class="lg:col-span-2 flex flex-col gap-6">
                            
                            <!-- Procurement Advisory -->
                            <div class="te-mba-card">
                                <div class="te-mba-header">
                                    <div class="te-mba-title"><i class="fa-solid fa-layer-group text-blue-600"></i> Procurement Advisory</div>
                                </div>
                                <div class="te-mba-table-wrap">
                                    <table class="te-mba-table">
                                        <thead><tr><th>Asset / SKU</th><th class="text-center">Demand Signal</th><th class="text-right">Current Pos.</th><th class="text-right">Proj. Need</th><th class="text-right">Deficit (Order)</th></tr></thead>
                                        <tbody>${forecastHtml || '<tr><td colspan="5" class="text-center py-8 text-gray-500">Supply aligns perfectly with projected demand.</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Velocity Anomalies -->
                            <div class="te-mba-card">
                                <div class="te-mba-header">
                                    <div class="te-mba-title"><i class="fa-solid fa-chart-line text-amber-500"></i> Velocity Anomalies (Z-Score > 1.5)</div>
                                </div>
                                <div class="te-mba-table-wrap">
                                    <table class="te-mba-table">
                                        <thead><tr><th>Asset / SKU</th><th class="text-center">Deviation</th><th class="text-center">Market Reqs</th><th class="text-right">7-Day Volume</th></tr></thead>
                                        <tbody>${hotHtml || '<tr><td colspan="4" class="text-center py-8 text-gray-500">No statistically significant anomalies detected.</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>

                        </div>

                        <!-- Right Column: Actions & Context -->
                        <div class="flex flex-col gap-6">
                            
                            <!-- Market Demand Input (Customer Requests) -->
                            <div class="te-mba-card">
                                <div class="te-mba-header">
                                    <div class="te-mba-title"><i class="fa-solid fa-users text-purple-600"></i> Market Demand Input</div>
                                </div>
                                <div class="p-5">
                                    <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 mb-4 flex flex-col gap-3">
                                        <input type="text" id="te-req-item" placeholder="SKU or Description..." class="te-mba-input">
                                        <div class="flex gap-2">
                                            <input type="number" id="te-req-qty" placeholder="Qty" value="1" min="1" class="te-mba-input w-20 text-center">
                                            <select id="te-req-intensity" class="te-mba-input flex-1">
                                                <option value="1">Low Priority</option>
                                                <option value="2" selected>Standard</option>
                                                <option value="3">High (Active Buyer)</option>
                                                <option value="4">Critical (Revenue Loss)</option>
                                            </select>
                                        </div>
                                        <button onclick="TrendEngine.addRequest()" class="te-mba-btn w-full mt-1">Inject Demand Signal</button>
                                    </div>
                                    <div class="max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                        ${requestsHtml || '<div class="text-center text-sm text-gray-500 py-4">No unfulfilled market requests.</div>'}
                                    </div>
                                </div>
                            </div>

                            <!-- Event Intelligence -->
                            <div class="te-mba-card">
                                <div class="te-mba-header">
                                    <div class="te-mba-title"><i class="fa-solid fa-map-location-dot text-emerald-600"></i> Regional Event Intelligence</div>
                                </div>
                                <div class="p-5">
                                    ${eventsHtml}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            `;
        }
    };

    return {
        // --- INITIALIZATION & DYNAMIC FIREBASE SYNC ---
        async init(db) { 
            if (!db) return;
            try {
                const fs = await loadFirestore();
                fs.onSnapshot(fs.collection(db, "customer_requests"), (snapshot) => {
                    window.allRequests = [];
                    snapshot.forEach((docSnap) => {
                        const req = docSnap.data();
                        req.id = docSnap.id;
                        window.allRequests.push(req);
                    });
                    if (document.getElementById('tab-trends')?.classList.contains('active')) {
                        TrendEngine.refresh();
                    }
                });
            } catch (e) {
                console.warn("Could not start real-time listener:", e);
            }
        }, 
        
        renderTab(containerId) { UI.render(containerId); },
        refresh() { UI.render('trend-tab-container'); },
        
        setEvent(eventId) {
            STATE.focusedEventId = eventId || null;
            this.refresh();
        },

        async addRequest() {
            const itemInput = document.getElementById('te-req-item');
            const qtyInput = document.getElementById('te-req-qty');
            const intInput = document.getElementById('te-req-intensity');
            
            const item = itemInput.value.trim();
            const qty = parseInt(qtyInput.value);
            const intensity = intInput.value;

            if (!item || isNaN(qty) || qty <= 0) return alert("Valid SKU and quantity required.");

            try {
                const fs = await loadFirestore();
                await fs.addDoc(fs.collection(window.db, "customer_requests"), {
                    item: item, qty: qty, intensity: intensity, date: new Date().toISOString()
                });
                itemInput.value = ''; qtyInput.value = '1'; intInput.value = '2';
            } catch(e) {
                console.error(e); alert("Transmission failed: " + e.message); 
            }
        },

        async deleteRequest(id) {
            try {
                const fs = await loadFirestore();
                await fs.deleteDoc(fs.doc(window.db, "customer_requests", id));
            } catch(e) {
                console.error(e); alert("Resolution failed.");
            }
        }
    };
})();

window.TrendEngine = TrendEngine;
