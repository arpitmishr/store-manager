// ============================================================================
// TIER-5 ADVANCED PREDICTIVE ENGINE (ROORKEE REGION SPECIALIZED)
// Features: Exponential Moving Average (EMA), Z-Score Spike Detection, 
// Weighted Customer Intensity, Localized Festival Targeting, & Standalone DB Sync
// ============================================================================

const TrendEngine = (() => {
    let teChartInstance = null; 

    const STATE = {
        initialized: false,
        focusedEventId: null, 
        healthMetrics: { optimal: 0, stockoutRisk: 0, overstocked: 0 }, 
        events: [],
        chartData: { labels: [], currentYear: [], lastYear: [] },
        forecast: [],
        deadStock: [],
        hotItems: [],
        monthlyYoY: { change: 0 }
    };

    // --- STANDALONE FIREBASE IMPORTER ---
    // Loads Firestore functions dynamically so we don't have to modify app.js
    let fsModule = null;
    const loadFirestore = async () => {
        if (!fsModule) {
            fsModule = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        }
        return fsModule;
    };

    // 1. ROORKEE-SPECIFIC DYNAMIC FESTIVAL & EVENT GENERATOR
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
            // Standard Indian Festivals
            createEvent('lohri', "Lohri / Makar Sankranti", 1, 13, 'festival', 5, 1),
            createEvent('republic_day', "Republic Day", 1, 26, 'national', 3, 1),
            createEvent('maha_shivaratri', "Maha Shivaratri", 2, 26, 'festival', 7, 1),
            createEvent('holi', "Holi", 3, 14, 'festival', 15, 2),
            createEvent('eid_al_fitr', "Eid al-Fitr", 3, 30, 'festival', 10, 2),
            createEvent('baisakhi', "Baisakhi", 4, 13, 'festival', 5, 1),
            createEvent('raksha_bandhan', "Raksha Bandhan", 8, 19, 'festival', 10, 1),
            createEvent('independence_day', "Independence Day", 8, 15, 'national', 3, 1),
            createEvent('janmashtami', "Janmashtami", 8, 26, 'festival', 5, 1),
            createEvent('dussehra', "Dussehra", 10, 12, 'festival', 10, 2),
            createEvent('karwa_chauth', "Karwa Chauth", 10, 20, 'festival', 7, 1),
            createEvent('diwali', "Diwali & Dhanteras", 10, 31, 'festival', 20, 3),
            
            // ROORKEE REGION SPECIFIC EVENTS
            createEvent('kanwar_yatra', "Kanwar Yatra (Haridwar Highway Peak)", 7, 25, 'local_peak', 15, 5),
            createEvent('iit_session', "IIT/College New Session Start", 7, 20, 'education', 15, 10),
            createEvent('kaliyar_urs', "Piran Kaliyar Sharif Urs", 9, 15, 'local_festival', 7, 3), 
            
            // Climatic Sales Windows
            { id: 'winter_drop_' + year, name: 'North India Winter Drop', start: new Date(`${year}-11-20`), end: new Date(`${year+1}-01-20`), type: 'climate', exactDate: new Date(`${year}-12-15`) },
            { id: 'wedding_s_' + year, name: 'Summer Weddings', start: new Date(`${year}-04-15`), end: new Date(`${year}-06-15`), type: 'wedding', exactDate: new Date(`${year}-05-15`) }
        ];
    };

    // 2. ADVANCED MATHEMATICAL MODELS
    const MathUtils = {
        mean: arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
        stdDev: arr => {
            if (arr.length < 2) return 0;
            const m = MathUtils.mean(arr);
            const variance = arr.reduce((sq, n) => sq + Math.pow(n - m, 2), 0) / (arr.length - 1);
            return Math.sqrt(variance);
        },
        // Z-Score detects statistical anomalies (Sudden Spikes)
        zScore: (val, arr) => {
            const std = MathUtils.stdDev(arr);
            return std === 0 ? 0 : (val - MathUtils.mean(arr)) / std;
        },
        // Exponential Moving Average gives more weight to recent days
        ema: (arr, period) => {
            if (!arr.length) return 0;
            const k = 2 / (period + 1);
            return arr.reduce((acc, val, idx) => idx === 0 ? val : (val * k) + (acc * (1 - k)), arr[0]);
        }
    };

    const Utils = {
        money: v => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        formatDate: d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    };

    const Analyzer = {
        run() {
            if (!window.allTransactions || !window.allInventory) return;
            
            STATE.events = []; STATE.deadStock = []; 
            STATE.hotItems = []; STATE.forecast = [];
            STATE.healthMetrics = { optimal: 0, stockoutRisk: 0, overstocked: 0 };

            const now = new Date();
            const currentYear = now.getFullYear();
            
            // Map Customer Requests with Intensity Weights
            const reqMap = {};
            (window.allRequests || []).forEach(r => {
                const intensityMultipliers = { '1': 0.5, '2': 1.0, '3': 1.5, '4': 2.5 }; // Low, Normal, Urgent, Critical
                const weight = intensityMultipliers[r.intensity] || 1.0;
                
                if(!reqMap[r.item.toLowerCase()]) reqMap[r.item.toLowerCase()] = { qty: 0, weight: 0, rawQty: 0 };
                reqMap[r.item.toLowerCase()].qty += (Number(r.qty) * weight);
                reqMap[r.item.toLowerCase()].rawQty += Number(r.qty);
                reqMap[r.item.toLowerCase()].weight = Math.max(reqMap[r.item.toLowerCase()].weight, weight);
            });

            // Bucket transactions by item
            const itemTx = {};
            let totalTySales = 0, totalLySales = 0;

            window.allTransactions.forEach(t => {
                if (!itemTx[t.item]) itemTx[t.item] = { sales: [], purchases: [] };
                if (t.type.includes('Sale')) itemTx[t.item].sales.push(t);
                
                let d = new Date(t.date);
                if (t.type.includes('Sale') && d.getFullYear() === currentYear) totalTySales += Number(t.amount);
                if (t.type.includes('Sale') && d.getFullYear() === currentYear - 1) totalLySales += Number(t.amount);
            });

            const globalGrowthFactor = totalLySales > 0 ? Math.min(Math.max(totalTySales / totalLySales, 0.5), 1.5) : 1.1;

            let allEvents = [...getLocalEvents(currentYear), ...getLocalEvents(currentYear + 1)];
            let focusedEvent = STATE.focusedEventId ? allEvents.find(e => e.id === STATE.focusedEventId) : null;

            // Generate Timeline Data arrays for advanced math
            window.allInventory.forEach(inv => {
                let sales = itemTx[inv.name]?.sales || [];
                
                // Group sales into the last 4 weeks to establish standard deviation
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
                
                // --- SPIKE DETECTION (Z-SCORE) ---
                let zScore = MathUtils.zScore(recent7, weeklySales.slice(1)); 
                let isSpike = zScore > 1.5 && recent7 > 2; // Statistically significant sudden demand
                
                if (isSpike || reqData.weight >= 1.5) {
                    STATE.hotItems.push({ 
                        item: inv.name, 
                        zScore: zScore, 
                        recent7: recent7, 
                        requests: reqData.rawQty,
                        score: (zScore * 10) + (reqData.weight * 20)
                    });
                }

                // --- ADVANCED DEMAND FORECASTING ---
                let pastDemand = 0;
                if (focusedEvent) {
                    let lyStart = new Date(focusedEvent.start); lyStart.setFullYear(lyStart.getFullYear() - 1);
                    let lyEnd = new Date(focusedEvent.end); lyEnd.setFullYear(lyEnd.getFullYear() - 1);
                    pastDemand = sales.filter(t => new Date(t.date) >= lyStart && new Date(t.date) <= lyEnd).reduce((sum, t) => sum + Number(t.qty), 0);
                }

                // Baseline is derived from Exponential Moving Average of recent weeks
                let baselineEMA = MathUtils.ema(weeklySales.reverse(), 4); 
                let historyWeight = focusedEvent ? 0.7 : 0.2;
                let recentWeight = focusedEvent ? 0.3 : 0.8;
                
                // Forecast = (EMA Trend) + (Historical Event Demand) + (Weighted Requests)
                let projectedQty = Math.ceil(
                    (baselineEMA * recentWeight) + 
                    (pastDemand * globalGrowthFactor * historyWeight) + 
                    reqData.qty
                );
                
                let demandIntensityScore = (zScore * 10) + (reqData.qty * 5) + (pastDemand * globalGrowthFactor);
                
                let intensityLabel = '<span class="text-gray-400">Low</span>';
                if (demandIntensityScore > 30 || reqData.weight > 2) intensityLabel = '<span class="text-red-500 font-bold">🔥 Critical</span>';
                else if (demandIntensityScore > 15 || zScore > 1.5) intensityLabel = '<span class="text-orange-500 font-bold">⚡ High Spike</span>';
                else if (demandIntensityScore > 5) intensityLabel = '<span class="text-blue-500 font-bold">📈 Steady</span>';

                // Health Calculation
                if (inv.qty > 0 || projectedQty > 0) {
                    if (projectedQty > inv.qty && projectedQty > 0) STATE.healthMetrics.stockoutRisk++;
                    else if (inv.qty > (projectedQty * 3) && inv.qty > 5) STATE.healthMetrics.overstocked++;
                    else if (inv.qty > 0) STATE.healthMetrics.optimal++;
                }

                // Push to Forecast Engine
                if (projectedQty > 0 || reqData.rawQty > 0) { 
                    let gap = projectedQty - Number(inv.qty);
                    if (gap > 0 || reqData.rawQty > 0) {
                        STATE.forecast.push({
                            item: inv.name,
                            projected: projectedQty,
                            currentStock: inv.qty,
                            suggestedOrder: gap > 0 ? gap : 0,
                            intensity: intensityLabel,
                            score: demandIntensityScore
                        });
                    }
                }

                // --- DEAD STOCK CALCULATION ---
                let lastSaleDate = sales.length > 0 ? new Date(sales[sales.length - 1].date) : null;
                let daysSince = lastSaleDate ? Math.floor((today - lastSaleDate) / 86400000) : 999;
                let lockedCapital = inv.qty * inv.price;

                if (inv.qty > 0 && daysSince >= 45 && lockedCapital >= 100) {
                    STATE.deadStock.push({ item: inv.name, qty: inv.qty, days: daysSince, value: lockedCapital });
                }
            });
            
            STATE.forecast.sort((a,b) => b.score - a.score); 
            STATE.deadStock.sort((a,b) => b.value - a.value);
            STATE.hotItems.sort((a,b) => b.score - a.score);

            // Populate Event Action Advice
            let upcomingEvents = allEvents.filter(e => e.exactDate >= now).sort((a, b) => a.exactDate - b.exactDate).slice(0, 3);
            if (focusedEvent && !upcomingEvents.find(e => e.id === focusedEvent.id)) upcomingEvents.unshift(focusedEvent);

            upcomingEvents.forEach(e => {
                let lyStart = new Date(e.start); lyStart.setFullYear(lyStart.getFullYear() - 1);
                let lyEnd = new Date(e.end); lyEnd.setFullYear(lyEnd.getFullYear() - 1);

                let lyEventSales = window.allTransactions.filter(t => t.type.includes('Sale') && new Date(t.date) >= lyStart && new Date(t.date) <= lyEnd);
                let vol = {};
                lyEventSales.forEach(t => vol[t.item] = (vol[t.item] || 0) + Number(t.qty));
                let topItems = Object.keys(vol).sort((a,b) => vol[b] - vol[a]).slice(0, 4);

                let eventAction = "";
                topItems.forEach(item => {
                    let lyQty = vol[item];
                    let inv = window.allInventory.find(i => i.name === item);
                    let currentStock = inv ? inv.qty : 0;
                    if (currentStock < lyQty * 0.8) {
                        eventAction += `<li><b class="text-gray-900 dark:text-white">${item}</b>: Have ${currentStock}, need approx ${Math.ceil(lyQty * globalGrowthFactor)} based on last year.</li>`;
                    }
                });

                STATE.events.push({
                    name: e.name, 
                    type: e.type, 
                    days: Math.floor((e.exactDate - now) / 86400000),
                    isFocused: e.id === STATE.focusedEventId,
                    actionHtml: eventAction || "<li class='text-green-600 font-semibold'>Inventory looks fully prepared for this event.</li>"
                });
            });
        }
    };

    const UI = {
        render(containerId) {
            const el = document.getElementById(containerId);
            if (!el) return;

            if (!window.allTransactions || !window.allInventory) {
                el.innerHTML = `<div class="p-8 text-center text-gray-500">Syncing with Firestore Database...</div>`;
                return;
            }

            Analyzer.run();

            // 1. Upcoming Demand Forecast
            let forecastHtml = STATE.forecast.slice(0, 15).map(f => `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td class="font-semibold text-blue-600 dark:text-blue-400 py-3 px-4">${f.item}</td>
                    <td class="text-center py-3 px-4">${f.intensity}</td>
                    <td class="text-right text-gray-500 dark:text-gray-400 py-3 px-4">${f.currentStock}</td>
                    <td class="text-right font-bold text-gray-900 dark:text-white py-3 px-4">${f.projected}</td>
                    <td class="text-right py-3 px-4"><span class="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 py-1 px-3 rounded-full font-bold text-xs">+${f.suggestedOrder}</span></td>
                </tr>
            `).join('');

            // 2. Hot Items (Z-Score Spikes)
            let hotHtml = STATE.hotItems.slice(0, 8).map(h => `
                <tr class="border-b border-gray-100 dark:border-gray-700">
                    <td class="font-medium py-3 px-4">${h.item}</td>
                    <td class="text-center py-3 px-4">
                        ${h.zScore > 2 ? '<span class="text-red-500 font-bold"><i class="fa-solid fa-arrow-trend-up"></i> Massive</span>' : '<span class="text-orange-500 font-bold">Rising</span>'}
                    </td>
                    <td class="text-center font-bold ${h.requests > 0 ? 'text-purple-600' : 'text-gray-400'} py-3 px-4">${h.requests > 0 ? h.requests : '-'}</td>
                    <td class="text-right py-3 px-4">${h.recent7} sold recently</td>
                </tr>
            `).join('');

            // 3. Customer Requests UI
            let requestsHtml = (window.allRequests || []).map(r => {
                const colors = { '1': 'bg-gray-400', '2': 'bg-blue-500', '3': 'bg-orange-500', '4': 'bg-red-600' };
                const labels = { '1': 'Casual', '2': 'Normal', '3': 'Urgent', '4': 'Critical!' };
                return `
                <li class="flex justify-between items-center py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-800 dark:text-gray-200 text-sm">${r.item} <span class="text-xs text-gray-500 font-normal">(x${r.qty})</span></span>
                        <span class="text-[10px] font-bold text-white ${colors[r.intensity] || colors['2']} px-1.5 py-0.5 rounded w-max mt-1">${labels[r.intensity] || 'Normal'}</span>
                    </div>
                    <button onclick="TrendEngine.deleteRequest('${r.id}')" class="text-green-600 hover:text-green-800 border border-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg text-xs transition-colors font-bold"><i class="fa-solid fa-check"></i> Fulfilled</button>
                </li>
            `}).join('');

            // 4. Festival Selector Options
            let allEvents = [...getLocalEvents(new Date().getFullYear()), ...getLocalEvents(new Date().getFullYear() + 1)];
            let eventOptions = allEvents.filter(e => e.exactDate >= new Date() || e.id === STATE.focusedEventId).sort((a,b) => a.exactDate - b.exactDate)
                .map(e => `<option value="${e.id}" ${STATE.focusedEventId === e.id ? 'selected' : ''}>${e.name} (${Utils.formatDate(e.exactDate)})</option>`).join('');

            // 5. Event Cards
            let eventsHtml = STATE.events.map(e => `
                <div class="bg-white dark:bg-gray-800 p-5 rounded-xl border ${e.isFocused ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-900' : 'border-gray-200 dark:border-gray-700'} shadow-sm relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-purple-500"></div>
                    <div class="flex justify-between items-center mb-3 ml-2">
                        <h4 class="font-bold text-gray-900 dark:text-white text-md">${e.name}</h4>
                        <span class="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">${e.days <= 0 ? 'Active Now' : 'In '+e.days+' Days'}</span>
                    </div>
                    <div class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide ml-2">Stock Recommendations:</div>
                    <ul class="list-disc pl-7 text-sm text-gray-600 dark:text-gray-300 space-y-1.5">${e.actionHtml}</ul>
                </div>
            `).join('');

            el.innerHTML = `
                <div class="flex flex-col gap-6 pb-10">
                    <!-- Dashboard Header -->
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-900 dark:bg-black p-6 rounded-2xl shadow-xl text-white gap-4 relative overflow-hidden">
                        <div class="absolute -right-10 -top-10 opacity-10 text-9xl"><i class="fa-solid fa-brain"></i></div>
                        <div class="relative z-10">
                            <h2 class="text-2xl font-extrabold mb-1 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">Roorkee Region AI Forecasting</h2>
                            <p class="text-gray-400 text-sm">Uses Z-Score spike detection and historic local event tracking.</p>
                        </div>
                        <div class="relative z-10 flex flex-row gap-2 w-full sm:w-auto">
                            <select onchange="TrendEngine.setEvent(this.value)" class="flex-1 sm:flex-none bg-gray-800 border border-gray-700 text-white text-sm font-bold rounded-lg px-4 py-2.5 outline-none shadow-sm cursor-pointer">
                                <option value="">-- Target Local Event: Auto --</option>
                                ${eventOptions}
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <!-- Left Side: Forecast & Events -->
                        <div class="lg:col-span-2 flex flex-col gap-6">
                            
                            <!-- FORECAST TABLE -->
                            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div class="p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                                    <h3 class="font-bold text-gray-800 dark:text-white"><i class="fa-solid fa-cart-arrow-down text-primary mr-2"></i> Purchasing Recommendations</h3>
                                    <p class="text-xs text-gray-500 mt-1">What you need to buy to fulfill upcoming demand.</p>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="min-w-full text-sm text-left">
                                        <thead class="bg-gray-50 dark:bg-gray-900">
                                            <tr>
                                                <th class="py-3 px-4 font-semibold text-gray-500">Item to Buy</th>
                                                <th class="text-center py-3 px-4 font-semibold text-gray-500">Demand Type</th>
                                                <th class="text-right py-3 px-4 font-semibold text-gray-500">Current Stock</th>
                                                <th class="text-right py-3 px-4 font-semibold text-gray-500">Projected Need</th>
                                                <th class="text-right py-3 px-4 font-semibold text-gray-500">Order Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                            ${forecastHtml || '<tr><td colspan="5" class="text-center text-gray-500 py-8">Your inventory is perfect. No purchases required.</td></tr>'}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- SUDDEN SPIKES TABLE -->
                            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div class="p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                                    <h3 class="font-bold text-gray-800 dark:text-white"><i class="fa-solid fa-arrow-trend-up text-orange-500 mr-2"></i> Statistical Sudden Spikes</h3>
                                    <p class="text-xs text-gray-500 mt-1">Items that broke normal sales velocity this week (Z-Score > 1.5).</p>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="min-w-full text-sm text-left">
                                        <thead class="bg-gray-50 dark:bg-gray-900">
                                            <tr>
                                                <th class="py-3 px-4 font-semibold text-gray-500">Item</th>
                                                <th class="text-center py-3 px-4 font-semibold text-gray-500">Spike Level</th>
                                                <th class="text-center py-3 px-4 font-semibold text-gray-500">Cust. Requests</th>
                                                <th class="text-right py-3 px-4 font-semibold text-gray-500">Recent Sales</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                            ${hotHtml || '<tr><td colspan="4" class="text-center text-gray-500 py-8">No sudden spikes detected currently.</td></tr>'}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                        
                        <!-- Right Side: Real Time Requests & Events -->
                        <div class="flex flex-col gap-6">
                            
                            <!-- CUSTOMER REQUESTS WIDGET -->
                            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                                <h3 class="font-bold text-gray-800 dark:text-white mb-1"><i class="fa-solid fa-clipboard-user text-purple-500 mr-2"></i> Manual Customer Requests</h3>
                                <p class="text-xs text-gray-500 mb-4">Add items customers are asking for. It directly updates your forecast recommendations.</p>
                                
                                <div class="flex flex-col gap-2 mb-4 bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                                    <input type="text" id="te-req-item" placeholder="Enter item name..." class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500">
                                    <div class="flex gap-2">
                                        <input type="number" id="te-req-qty" placeholder="Qty" min="1" value="1" class="w-20 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 text-center">
                                        <select id="te-req-intensity" class="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 font-medium">
                                            <option value="1">Low Urgency</option>
                                            <option value="2" selected>Normal</option>
                                            <option value="3">Urgent (Customer waiting)</option>
                                            <option value="4">Critical (High Profit Loss)</option>
                                        </select>
                                    </div>
                                    <button onclick="TrendEngine.addRequest()" class="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow mt-1"><i class="fa-solid fa-plus mr-1"></i> Add Request</button>
                                </div>
                                
                                <ul class="text-sm max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                    ${requestsHtml || '<li class="text-center text-gray-500 py-4 text-xs">No pending requests.</li>'}
                                </ul>
                            </div>

                            <!-- LOCAL EVENTS -->
                            <div>
                                <h3 class="font-bold text-gray-800 dark:text-white mb-3 uppercase tracking-wide text-sm"><i class="fa-solid fa-calendar-star text-primary mr-2"></i> Upcoming Local Events</h3>
                                <div class="flex flex-col gap-4">${eventsHtml}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    };

    return {
        // Init uses Dynamic Loading so it doesn't need to be modified in app.js
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
                    
                    // Auto-refresh UI in real time
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

            if (!item || isNaN(qty) || qty <= 0) {
                alert("Please enter a valid item name and quantity.");
                return;
            }

            try {
                const fs = await loadFirestore();
                await fs.addDoc(fs.collection(window.db, "customer_requests"), {
                    item: item,
                    qty: qty,
                    intensity: intensity,
                    date: new Date().toISOString()
                });
                
                itemInput.value = '';
                qtyInput.value = '1';
                intInput.value = '2';
                // Note: The dynamically loaded listener triggers refresh() automatically!
            } catch(e) {
                console.error(e);
                alert("Failed to save request. Error: " + e.message); 
            }
        },

        async deleteRequest(id) {
            try {
                const fs = await loadFirestore();
                await fs.deleteDoc(fs.doc(window.db, "customer_requests", id));
            } catch(e) {
                console.error(e);
                alert("Failed to remove request.");
            }
        }
    };
})();

window.TrendEngine = TrendEngine;
