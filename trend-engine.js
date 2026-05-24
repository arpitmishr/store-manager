// ============================================================================
// TIER-4 LOCALIZED TREND ENGINE (ADVANCED ANALYTICS & PREDICTIONS)
// Focuses on: AI Demand Forecasting, Dynamic Festival Targeting, Customer Requests
// ============================================================================

const TrendEngine = (() => {
    let teChartInstance = null; 

    const STATE = {
        initialized: false,
        focusedEventId: null, 
        healthMetrics: { optimal: 0, stockoutRisk: 0, overstocked: 0 }, 
        events: [],
        yoy: [],
        monthlyYoY: { cmSales: 0, lymSales: 0, change: 0 },
        chartData: { labels: [], currentYear: [], lastYear: [] },
        forecast: [],
        deadStock: [],
        marginLeaks: [],
        hotItems: []
    };

    // DYNAMIC FESTIVAL GENERATOR (Auto-resets year and creates pre-shopping windows)
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
            createEvent('new_year', "New Year's Day", 1, 1, 'national', 5, 1),
            createEvent('guru_gobind', "Guru Gobind Singh Jayanti", 1, 3, 'festival'),
            createEvent('lohri', "Lohri", 1, 13, 'festival'),
            createEvent('makar_sankranti', "Makar Sankranti", 1, 14, 'festival'),
            createEvent('pongal', "Pongal", 1, 14, 'festival'),
            createEvent('bhogali_bihu', "Bhogali Bihu", 1, 14, 'festival'),
            createEvent('vasant_panchami', "Vasant Panchami", 1, 23, 'festival'),
            createEvent('republic_day', "Republic Day", 1, 26, 'national', 3, 1),
            createEvent('maha_shivaratri', "Maha Shivaratri", 2, 15, 'festival', 7, 1),
            createEvent('holi', "Holi", 3, 4, 'festival', 12, 2),
            createEvent('ugadi', "Ugadi", 3, 19, 'festival'),
            createEvent('gudi_padwa', "Gudi Padwa", 3, 19, 'festival'),
            createEvent('eid_al_fitr', "Eid al-Fitr", 3, 20, 'festival', 10, 2),
            createEvent('ram_navami', "Ram Navami", 3, 26, 'festival'),
            createEvent('good_friday', "Good Friday", 4, 3, 'festival'),
            createEvent('easter', "Easter Sunday", 4, 5, 'festival'),
            createEvent('mahavir_jayanti', "Mahavir Jayanti", 4, 6, 'festival'),
            createEvent('vaisakhi', "Vaisakhi", 4, 14, 'festival'),
            createEvent('bohag_bihu', "Bohag Bihu", 4, 14, 'festival'),
            createEvent('vishu', "Vishu", 4, 14, 'festival'),
            createEvent('buddha_purnima', "Buddha Purnima", 5, 1, 'festival'),
            createEvent('eid_al_adha', "Eid al-Adha", 5, 27, 'festival', 10, 2),
            createEvent('muharram', "Muharram", 6, 26, 'festival'),
            createEvent('rath_yatra', "Rath Yatra", 7, 16, 'festival'),
            createEvent('independence_day', "Independence Day", 8, 15, 'national', 3, 1),
            createEvent('raksha_bandhan', "Raksha Bandhan", 8, 19, 'festival', 10, 1),
            createEvent('janmashtami', "Janmashtami", 8, 25, 'festival'),
            createEvent('milad_un_nabi', "Milad-un-Nabi", 8, 26, 'festival'),
            createEvent('onam', "Onam", 8, 26, 'festival'),
            createEvent('ganesh_chaturthi', "Ganesh Chaturthi", 9, 14, 'festival', 7, 3),
            createEvent('gandhi_jayanti', "Gandhi Jayanti", 10, 2, 'national', 2, 1),
            createEvent('durga_puja', "Durga Puja", 10, 17, 'festival', 12, 3),
            createEvent('dussehra', "Dussehra", 10, 20, 'festival', 10, 2),
            createEvent('karwa_chauth', "Karwa Chauth", 10, 29, 'festival', 7, 1),
            createEvent('dhanteras', "Dhanteras", 11, 6, 'festival', 7, 1),
            createEvent('diwali', "Diwali", 11, 8, 'festival', 15, 2),
            createEvent('govardhan_puja', "Govardhan Puja", 11, 10, 'festival'),
            createEvent('bhai_dooj', "Bhai Dooj", 11, 11, 'festival'),
            createEvent('chhath_puja', "Chhath Puja", 11, 15, 'festival', 7, 2),
            createEvent('guru_nanak_jayanti', "Guru Nanak Jayanti", 11, 24, 'festival'),
            createEvent('christmas', "Christmas", 12, 25, 'festival', 12, 2),
            
            { id: 'wedding_w_' + year, name: 'Winter Weddings', start: new Date(`${year}-11-15`), end: new Date(`${year+1}-02-28`), type: 'wedding', exactDate: new Date(`${year}-12-15`) },
            { id: 'wedding_s_' + year, name: 'Summer Weddings', start: new Date(`${year}-04-15`), end: new Date(`${year}-06-15`), type: 'wedding', exactDate: new Date(`${year}-05-15`) },
            { id: 'school_' + year, name: 'Back to School', start: new Date(`${year}-06-25`), end: new Date(`${year}-07-15`), type: 'education', exactDate: new Date(`${year}-07-01`) }
        ];
    };

    const Utils = {
        money: v => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        daysDiff: (d1, d2) => Math.floor((d2 - d1) / 86400000),
        formatDate: d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
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
            const currentMonth = now.getMonth(); 
            
            const isWinterSeason = (currentMonth >= 9 || currentMonth <= 1);
            const isWinterItem = (itemName) => {
                const lowerName = itemName.toLowerCase();
                return lowerName.includes('g frock') || lowerName.match(/\bg\b/); 
            };
            
            const reqMap = {};
            (window.allRequests || []).forEach(r => {
                reqMap[r.item.toLowerCase()] = (reqMap[r.item.toLowerCase()] || 0) + Number(r.qty);
            });

            const itemTx = {};
            window.allTransactions.forEach(t => {
                if (!itemTx[t.item]) itemTx[t.item] = { sales: [], purchases: [] };
                if (t.type.includes('Sale')) itemTx[t.item].sales.push(t);
                if (t.type.includes('Purchase')) itemTx[t.item].purchases.push(t);
            });

            STATE.chartData.labels = Utils.months;
            STATE.chartData.currentYear = new Array(12).fill(0);
            STATE.chartData.lastYear = new Array(12).fill(0);

            let cmSales = 0, lymSales = 0;
            let currentMonthStart = new Date(currentYear, currentMonth, 1);
            let lastYearMonthStart = new Date(currentYear - 1, currentMonth, 1);
            let lastYearMonthEnd = new Date(currentYear - 1, currentMonth + 1, 0, 23, 59, 59);
            let totalTySales = 0, totalLySales = 0;

            window.allTransactions.forEach(t => {
                if(!t.type.includes('Sale')) return;
                let d = new Date(t.date);
                let m = d.getMonth();
                let y = d.getFullYear();
                let amt = Number(t.amount) || 0;

                if (y === currentYear) { STATE.chartData.currentYear[m] += amt; totalTySales += amt; }
                if (y === currentYear - 1) { STATE.chartData.lastYear[m] += amt; totalLySales += amt; }

                if (d >= currentMonthStart) cmSales += amt;
                if (d >= lastYearMonthStart && d <= lastYearMonthEnd) lymSales += amt;
            });

            STATE.monthlyYoY = { cmSales, lymSales, change: lymSales > 0 ? ((cmSales - lymSales) / lymSales) * 100 : 0 };
            let globalGrowthFactor = totalLySales > 0 ? (totalTySales / totalLySales) : 1.1; 
            if(globalGrowthFactor > 1.5) globalGrowthFactor = 1.5; 
            if(globalGrowthFactor < 0.5) globalGrowthFactor = 0.5;

            let allEvents = [...getLocalEvents(currentYear), ...getLocalEvents(currentYear + 1)];
            let focusedEvent = STATE.focusedEventId ? allEvents.find(e => e.id === STATE.focusedEventId) : null;

            let futureStartLy = new Date(now); futureStartLy.setFullYear(currentYear - 1);
            let futureEndLy = new Date(futureStartLy); futureEndLy.setDate(futureEndLy.getDate() + 30);
            
            let t30 = new Date(now); t30.setDate(now.getDate() - 30);
            let t14 = new Date(now); t14.setDate(now.getDate() - 14);
            let t7 = new Date(now); t7.setDate(now.getDate() - 7);

            let defaultProjectedMap = {};
            window.allTransactions.forEach(t => {
                if(!t.type.includes('Sale')) return;
                let d = new Date(t.date);
                if(d >= futureStartLy && d <= futureEndLy) {
                    defaultProjectedMap[t.item] = (defaultProjectedMap[t.item] || 0) + Number(t.qty);
                }
            });

            window.allInventory.forEach(inv => {
                let sales = itemTx[inv.name]?.sales || [];
                let requestsQty = reqMap[inv.name.toLowerCase()] || 0;
                
                let recent30 = sales.filter(t => new Date(t.date) >= t30).reduce((sum, t) => sum + Number(t.qty), 0);
                let recent7 = sales.filter(t => new Date(t.date) >= t7).reduce((sum, t) => sum + Number(t.qty), 0);
                let prev7 = sales.filter(t => new Date(t.date) >= t14 && new Date(t.date) < t7).reduce((sum, t) => sum + Number(t.qty), 0);
                
                if (isWinterItem(inv.name) && !isWinterSeason) return; 

                let pastDemand = 0;
                if (focusedEvent) {
                    let lyStart = new Date(focusedEvent.start); lyStart.setFullYear(lyStart.getFullYear() - 1);
                    let lyEnd = new Date(focusedEvent.end); lyEnd.setFullYear(lyEnd.getFullYear() - 1);
                    pastDemand = sales.filter(t => new Date(t.date) >= lyStart && new Date(t.date) <= lyEnd).reduce((sum, t) => sum + Number(t.qty), 0);
                } else {
                    pastDemand = defaultProjectedMap[inv.name] || 0;
                }

                let demandIntensityScore = (recent7 * 2) + (requestsQty * 10) + (pastDemand * globalGrowthFactor);
                
                let historyWeight = focusedEvent ? 0.7 : 0.4;
                let recentWeight = focusedEvent ? 0.3 : 0.6;
                let projectedQty = Math.ceil((recent30 * recentWeight) + (pastDemand * globalGrowthFactor * historyWeight)) + requestsQty; 
                
                let intensityLabel = '<span class="text-gray-400">Low</span>';
                if (demandIntensityScore > 30) intensityLabel = '<span class="text-red-500 font-bold">🔥 Extreme</span>';
                else if (demandIntensityScore > 15) intensityLabel = '<span class="text-orange-500 font-bold">⚡ High</span>';
                else if (demandIntensityScore > 5) intensityLabel = '<span class="text-blue-500 font-bold">📈 Med</span>';

                if (inv.qty > 0 || projectedQty > 0) {
                    if (projectedQty > inv.qty && projectedQty > 0) STATE.healthMetrics.stockoutRisk++;
                    else if (inv.qty > (projectedQty * 3) && inv.qty > 5) STATE.healthMetrics.overstocked++;
                    else if (inv.qty > 0) STATE.healthMetrics.optimal++;
                }

                if (projectedQty > 0 || requestsQty > 0) { 
                    let gap = projectedQty - Number(inv.qty);
                    if (gap > 0 || requestsQty > 0) {
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

                if (recent7 > prev7 || requestsQty > 0) {
                    let jump = prev7 === 0 ? 100 : Math.round(((recent7 - prev7) / prev7) * 100);
                    if (jump >= 20 || requestsQty >= 1) { 
                        STATE.hotItems.push({ item: inv.name, jump, recent7, requests: requestsQty, score: demandIntensityScore });
                    }
                }

                let lastSaleDate = sales.length > 0 ? new Date(sales[0].date) : null;
                let daysSince = lastSaleDate ? Utils.daysDiff(lastSaleDate, now) : 999;
                let lockedCapital = inv.qty * inv.price;

                if (inv.qty > 0 && daysSince >= 45 && lockedCapital >= 100) {
                    STATE.deadStock.push({ item: inv.name, qty: inv.qty, days: daysSince, value: lockedCapital });
                }
            });
            
            STATE.forecast.sort((a,b) => b.score - a.score); 
            STATE.deadStock.sort((a,b) => b.value - a.value);
            STATE.hotItems.sort((a,b) => b.score - a.score);

            let upcomingEvents = allEvents.filter(e => e.exactDate >= now).sort((a, b) => a.exactDate - b.exactDate).slice(0, 3);
            
            if (focusedEvent && !upcomingEvents.find(e => e.id === focusedEvent.id)) {
                upcomingEvents.unshift(focusedEvent); 
            }

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
                        eventAction += `<li><b class="text-gray-900 dark:text-white">${item}</b>: Stock ${currentStock}, Sold ~${lyQty} last year</li>`;
                    }
                });

                STATE.events.push({
                    name: e.name, 
                    type: e.type, 
                    days: Utils.daysDiff(now, e.exactDate),
                    isFocused: e.id === STATE.focusedEventId,
                    actionHtml: eventAction || "<li class='text-green-600 font-semibold'>Inventory looks fully prepared based on last year.</li>"
                });
            });
        }
    };

    const UI = {
        injectCSS() {
            if (document.getElementById('te-styles')) return;
            const style = document.createElement('style');
            style.id = 'te-styles';
            // Added RESPONSIVE CSS updates here (whitespace-nowrap, better grid breakpoints)
            style.textContent = `
                .te-wrapper { font-family: 'Inter', sans-serif; display: flex; flex-direction: column; gap: 24px; padding-bottom: 20px; width: 100%; overflow-x: hidden;}
                .te-section-title { font-size: 14px; font-weight: 800; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; display:flex; align-items:center; gap:8px;}
                .dark-mode .te-section-title { color: #d1d5db; }
                
                .te-grid-2 { display: grid; grid-template-columns: 1fr; gap: 16px; }
                @media(min-width: 768px) { .te-grid-2 { grid-template-columns: 1fr 1fr; } }
                
                .te-grid-3 { display: grid; grid-template-columns: 1fr; gap: 16px; }
                @media(min-width: 768px) { .te-grid-3 { grid-template-columns: 1fr 1fr; } }
                @media(min-width: 1024px) { .te-grid-3 { grid-template-columns: repeat(3, 1fr); } }
                
                .te-data-card { background: white; border-radius: 12px; border: 1px solid #e5e7eb; padding: 16px; overflow: hidden; position: relative; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
                .dark-mode .te-data-card { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
                .te-card-strip { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #3b82f6;}
                
                .te-table-wrap { overflow-x: auto; background: white; border: 1px solid #e5e7eb; border-radius: 12px; width: 100%; }
                .dark-mode .te-table-wrap { background: #1f2937; border-color: #374151; }
                .te-table { width: 100%; text-align: left; border-collapse: collapse; font-size: 13px; }
                .te-table th, .te-table td { white-space: nowrap; } /* ENFORCES CLEAN SCROLLING ON MOBILE */
                .te-table th { background: #f9fafb; padding: 12px 16px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
                .dark-mode .te-table th { background: #374151; color: #d1d5db; border-color: #4b5563; }
                .te-table td { padding: 12px 16px; border-bottom: 1px solid #f3f4f6; color: #111827; }
                .dark-mode .te-table td { border-color: #374151; color: #f9fafb; }
                .te-table tr:last-child td { border-bottom: none; }
                
                .badge-order { background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 99px; font-weight: 700; font-size: 12px;}
                .dark-mode .badge-order { background: #7f1d1d; color: #fca5a5; }

                #te-drill-modal { display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 16px; }
                .te-drill-content { background: white; width: 100%; max-width: 600px; max-height: 80vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); margin: 16px;}
                .dark-mode .te-drill-content { background: #1f2937; border: 1px solid #374151; }
                .te-drill-header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
                .dark-mode .te-drill-header { border-color: #374151; }
                .te-drill-body { overflow-y: auto; padding: 0; background: #f9fafb; max-height: 60vh;}
                .dark-mode .te-drill-body { background: #111827; }
            `;
            document.head.appendChild(style);
        },

        renderChart() {
            const ctx = document.getElementById('te-yoy-chart');
            if (!ctx) return;
            if (teChartInstance) teChartInstance.destroy();

            const isDark = document.body.classList.contains('dark-mode');
            const gridColor = isDark ? '#374151' : '#e5e7eb';
            const textColor = isDark ? '#9ca3af' : '#6b7280';

            teChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: STATE.chartData.labels,
                    datasets: [
                        { label: 'This Year (₹)', data: STATE.chartData.currentYear, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: '#3b82f6', pointBorderColor: '#fff', pointRadius: 4 },
                        { label: 'Last Year (₹)', data: STATE.chartData.lastYear, borderColor: '#9ca3af', borderWidth: 2, borderDash: [5, 5], tension: 0.4, fill: false, pointRadius: 0 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { color: textColor, font: {family: 'Inter'} } }, tooltip: { mode: 'index', intersect: false } },
                    scales: { x: { grid: { display: false }, ticks: { color: textColor } }, y: { grid: { color: gridColor }, ticks: { color: textColor, callback: function(value) { return '₹' + (value/1000) + 'k'; } } } },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false }
                }
            });
        },

        render(containerId) {
            this.injectCSS();
            const el = document.getElementById(containerId);
            if (!el) return;

            if (!window.allTransactions || window.allTransactions.length === 0 || !window.allInventory) {
                el.innerHTML = `<div class="p-8 text-center text-gray-500">Processing database...</div>`;
                return;
            }

            Analyzer.run();

            // 1. Health Metrics
            let healthHtml = `
                <div class="te-data-card !p-4 border-l-4 !border-l-green-500 flex items-center justify-between">
                    <div><div class="text-xs font-bold text-gray-500 uppercase">Optimal Flow</div><div class="text-xl font-black text-green-600">${STATE.healthMetrics.optimal} Items</div></div><i class="fa-solid fa-check-circle text-2xl text-green-200 dark:text-green-900"></i>
                </div>
                <div class="te-data-card !p-4 border-l-4 !border-l-orange-500 flex items-center justify-between">
                    <div><div class="text-xs font-bold text-gray-500 uppercase">Stockout Risk</div><div class="text-xl font-black text-orange-600">${STATE.healthMetrics.stockoutRisk} Items</div></div><i class="fa-solid fa-triangle-exclamation text-2xl text-orange-200 dark:text-orange-900"></i>
                </div>
                <div class="te-data-card !p-4 border-l-4 !border-l-blue-500 flex items-center justify-between">
                    <div><div class="text-xs font-bold text-gray-500 uppercase">Overstocked</div><div class="text-xl font-black text-blue-600">${STATE.healthMetrics.overstocked} Items</div></div><i class="fa-solid fa-boxes-stacked text-2xl text-blue-200 dark:text-blue-900"></i>
                </div>
            `;

            // 2. Upcoming Demand Forecast
            let forecastHtml = STATE.forecast.slice(0, 15).map(f => `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td class="font-semibold cursor-pointer text-blue-600 dark:text-blue-400" onclick="TrendEngine.openDrillDownItem('${f.item}')">${f.item}</td>
                    <td class="text-center">${f.intensity}</td>
                    <td class="text-right text-gray-500 dark:text-gray-400">${f.currentStock}</td>
                    <td class="text-right font-bold text-gray-900 dark:text-white">${f.projected}</td>
                    <td class="text-right"><span class="badge-order">+${f.suggestedOrder}</span></td>
                </tr>
            `).join('');

            // 3. Hot Items (Velocity & Requests)
            let hotHtml = STATE.hotItems.slice(0, 8).map(h => `
                <tr>
                    <td class="font-medium">${h.item}</td>
                    <td class="text-center text-green-500 font-bold">↑ ${h.jump}%</td>
                    <td class="text-center font-bold ${h.requests > 0 ? 'text-purple-600' : 'text-gray-400'}">${h.requests > 0 ? h.requests : '-'}</td>
                    <td class="text-right">${h.recent7} sold</td>
                </tr>
            `).join('');

            // 4. Dead Stock
            let deadHtml = STATE.deadStock.slice(0, 5).map(d => `
                <tr>
                    <td class="font-medium">${d.item}</td>
                    <td class="text-right text-red-500 font-bold">${d.days} days</td>
                    <td class="text-right font-bold text-gray-900 dark:text-white">${Utils.money(d.value)}</td>
                </tr>
            `).join('');

            // 5. Customer Requests UI
            let requestsHtml = (window.allRequests || []).map(r => `
                <li class="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div>
                        <span class="font-bold text-gray-800 dark:text-gray-200">${r.item}</span>
                        <span class="text-xs font-bold text-white bg-purple-500 px-1.5 py-0.5 rounded ml-2">Qty: ${r.qty}</span>
                    </div>
                    <button onclick="TrendEngine.deleteRequest('${r.id}')" class="text-red-500 hover:text-red-700 border border-red-500 hover:bg-red-50 px-2 py-1 rounded text-xs transition-colors"><i class="fa-solid fa-check"></i> Clear</button>
                </li>
            `).join('');
            if(!requestsHtml) requestsHtml = `<li class="text-xs text-gray-500 text-center py-4">No pending customer requests.</li>`;

            // 6. Festival Selector Options
            let allEvents = [...getLocalEvents(new Date().getFullYear()), ...getLocalEvents(new Date().getFullYear() + 1)];
            let eventOptions = allEvents.filter(e => e.exactDate >= new Date() || e.id === STATE.focusedEventId).sort((a,b) => a.exactDate - b.exactDate)
                .map(e => `<option value="${e.id}" ${STATE.focusedEventId === e.id ? 'selected' : ''}>${e.name} (${Utils.formatDate(e.exactDate)})</option>`).join('');

            // 7. Event Cards
            let eventsHtml = STATE.events.map(e => `
                <div class="te-data-card ${e.isFocused ? 'ring-2 ring-purple-500' : ''}">
                    <div class="te-card-strip" style="background-color:#a855f7;"></div>
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="font-bold text-gray-900 dark:text-white text-base">${e.name} ${e.isFocused ? '<i class="fa-solid fa-crosshairs text-purple-500 ml-1"></i>' : ''}</h4>
                        <span class="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">${e.days <= 0 ? 'Today/Past' : 'In '+e.days+' Days'}</span>
                    </div>
                    <div class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Historical Recommendations:</div>
                    <ul class="list-disc pl-4 text-sm text-gray-600 dark:text-gray-300 space-y-1">${e.actionHtml}</ul>
                </div>
            `).join('');


            // --- ASSEMBLE DASHBOARD ---
            el.innerHTML = `
                <div class="te-wrapper">
                    <!-- Dashboard Header -->
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gradient-to-r from-blue-600 to-indigo-700 p-5 rounded-2xl shadow-lg mb-2 text-white gap-4">
                        <div>
                            <h2 class="text-xl md:text-2xl font-extrabold mb-1"><i class="fa-solid fa-microchip mr-2"></i> AI Predictive Engine</h2>
                            <p class="text-blue-100 text-xs md:text-sm">Target festivals and track customer wishlists to maximize profits.</p>
                        </div>
                        <div class="flex flex-row gap-2 w-full sm:w-auto">
                            <select onchange="TrendEngine.setEvent(this.value)" class="flex-1 sm:flex-none bg-white text-gray-900 text-sm font-bold rounded-lg px-3 py-2 outline-none shadow-sm cursor-pointer truncate max-w-full">
                                <option value="">-- Target Festival: Auto --</option>
                                ${eventOptions}
                            </select>
                            <button id="te-btn-sync" onclick="TrendEngine.refresh()" class="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center shadow-sm shrink-0">
                                <i class="fa-solid fa-rotate"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Visual Graph + Inventory Health Row -->
                    <div class="te-grid-3">
                        <div class="lg:col-span-2 te-data-card !p-0 flex flex-col">
                            <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 dark:bg-gray-800/50 gap-2">
                                <h3 class="font-bold text-gray-800 dark:text-gray-200"><i class="fa-solid fa-chart-area text-blue-500 mr-2"></i> Revenue Trajectory (YoY)</h3>
                                <div class="text-xs md:text-sm font-bold ${STATE.monthlyYoY.change >= 0 ? 'text-green-600' : 'text-red-600'} bg-white dark:bg-gray-900 px-3 py-1 rounded shadow-sm border border-gray-200 dark:border-gray-700">
                                    Current Mth: ${STATE.monthlyYoY.change >= 0 ? '▲' : '▼'} ${Math.abs(STATE.monthlyYoY.change).toFixed(1)}%
                                </div>
                            </div>
                            <div class="p-4 flex-1 min-h-[250px] relative"><canvas id="te-yoy-chart"></canvas></div>
                        </div>

                        <div class="flex flex-col gap-3">
                            <h3 class="font-bold text-gray-800 dark:text-gray-200 mb-1 ml-1"><i class="fa-solid fa-heart-pulse text-red-500 mr-2"></i> Inventory Health</h3>
                            ${healthHtml}
                        </div>
                    </div>

                    <!-- FORECAST & CUSTOMER REQUESTS ROW -->
                    <div class="te-grid-3 mt-4">
                        <div class="lg:col-span-2">
                            <div class="te-section-title"><i class="fa-solid fa-cart-flatbed text-primary"></i> Predictive Purchase Orders</div>
                            <div class="te-table-wrap shadow-sm">
                                <table class="te-table">
                                    <thead class="bg-blue-50/50 dark:bg-blue-900/10">
                                        <tr>
                                            <th>Item Description</th>
                                            <th class="text-center">Demand Intensity</th>
                                            <th class="text-right">Current Stock</th>
                                            <th class="text-right">Expected Demand</th>
                                            <th class="text-right">Suggest Order</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${forecastHtml || '<tr><td colspan="5" class="text-center text-muted py-8">Inventory is completely sufficient for projected demand.</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- Customer Requests Widget -->
                        <div>
                            <div class="te-section-title"><i class="fa-solid fa-clipboard-list text-purple-500"></i> Customer Orders / Requests</div>
                            <div class="te-data-card">
                                <div class="flex gap-2 mb-4">
                                    <input type="text" id="te-req-item" placeholder="Item requested..." class="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm flex-1 outline-none focus:ring-2 focus:ring-purple-500 w-0">
                                    <input type="number" id="te-req-qty" placeholder="Qty" min="1" class="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg px-2 py-2 text-sm w-16 outline-none focus:ring-2 focus:ring-purple-500 shrink-0">
                                    <button onclick="TrendEngine.addRequest()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0"><i class="fa-solid fa-plus"></i></button>
                                </div>
                                <ul class="text-sm divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto pr-1">
                                    ${requestsHtml}
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- Event Radar & Velocity -->
                    <div class="te-grid-2 mt-4">
                        <div class="flex flex-col gap-6">
                            <!-- Hot Items -->
                            <div>
                                <div class="te-section-title"><i class="fa-solid fa-fire text-orange-500"></i> High Velocity & Demand Items</div>
                                <div class="te-table-wrap shadow-sm">
                                    <table class="te-table">
                                        <thead class="bg-orange-50/50 dark:bg-orange-900/10">
                                            <tr><th>Item</th><th class="text-center">Velocity Jump</th><th class="text-center">Cust. Requests</th><th class="text-right">Recent Sales</th></tr>
                                        </thead>
                                        <tbody>${hotHtml || '<tr><td colspan="4" class="text-center text-muted py-6">No rapid sales spikes detected this week.</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <!-- Dead Stock -->
                            <div>
                                <div class="te-section-title"><i class="fa-solid fa-skull-crossbones text-gray-500"></i> Capital Graveyard (45+ Days)</div>
                                <div class="te-table-wrap shadow-sm">
                                    <table class="te-table">
                                        <tbody>${deadHtml || '<tr><td colspan="3" class="text-center text-muted py-6">Excellent! No major capital trapped in dead inventory.</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div class="te-section-title"><i class="fa-solid fa-calendar-days text-purple-500"></i> Event Intelligence</div>
                            <div class="flex flex-col gap-4">${eventsHtml}</div>
                        </div>
                    </div>
                </div>

                <!-- Deep Dive Modal -->
                <div id="te-drill-modal">
                    <div class="te-drill-content">
                        <div class="te-drill-header">
                            <h3 id="te-drill-title" class="font-bold text-lg text-gray-900 dark:text-white">Transaction Logs</h3>
                            <button onclick="document.getElementById('te-drill-modal').style.display='none'" class="text-gray-400 hover:text-gray-800 dark:hover:text-white text-3xl font-light leading-none cursor-pointer">&times;</button>
                        </div>
                        <div id="te-drill-body" class="te-drill-body divide-y divide-gray-100 dark:divide-gray-700"></div>
                    </div>
                </div>
            `;

            setTimeout(() => { this.renderChart(); }, 50);
        },

        showDrillDown(title, transactions) {
            document.getElementById('te-drill-title').innerText = title;
            let body = document.getElementById('te-drill-body');
            
            if (!transactions || transactions.length === 0) {
                body.innerHTML = `<div class="p-8 text-center text-gray-500">No raw records found.</div>`;
            } else {
                body.innerHTML = transactions.map(t => {
                    let isPurch = t.type.includes('Purchase');
                    return `
                    <div class="p-3 bg-white dark:bg-gray-800 flex justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <div class="truncate mr-2">
                            <div class="font-bold text-gray-900 dark:text-white truncate">${t.item}</div>
                            <div class="text-xs text-gray-500">${Utils.formatDate(t.date)} &bull; <span class="${isPurch ? 'text-red-500':'text-green-500'} font-semibold">${t.type}</span></div>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="font-bold text-gray-900 dark:text-white">${Utils.money(t.amount)}</div>
                            <div class="text-xs text-gray-500">x${t.qty} @ ${Utils.money(t.amount/t.qty)}/ea</div>
                        </div>
                    </div>`;
                }).join('');
            }
            document.getElementById('te-drill-modal').style.display = 'flex';
        }
    };

    return {
        init(db) { }, 
        
        renderTab(containerId) { UI.render(containerId); },

        refresh() {
            const btn = document.getElementById('te-btn-sync');
            if (btn) {
                const ogText = btn.innerHTML;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
                btn.classList.add('opacity-80', 'pointer-events-none');
                setTimeout(() => { UI.render('trend-tab-container'); }, 600); 
            } else {
                UI.render('trend-tab-container');
            }
        },

        openDrillDownItem(item) {
            let txs = window.allTransactions.filter(t => t.item === item).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
            UI.showDrillDown(`Ledger: ${item}`, txs);
        },

        setEvent(eventId) {
            STATE.focusedEventId = eventId || null;
            this.refresh();
        },

        async addRequest() {
            const itemInput = document.getElementById('te-req-item');
            const qtyInput = document.getElementById('te-req-qty');
            const item = itemInput.value.trim();
            const qty = parseInt(qtyInput.value);

            if (!item || isNaN(qty) || qty <= 0) {
                alert("Please enter a valid item name and quantity.");
                return;
            }

            try {
                if (!window.addDoc) {
                    alert("Error: window.addDoc is missing! Please update your app.js as instructed.");
                    return;
                }
                await window.addDoc(window.collection(window.db, "customer_requests"), {
                    item: item,
                    qty: qty,
                    date: new Date().toISOString()
                });
                itemInput.value = '';
                qtyInput.value = '';
            } catch(e) {
                console.error(e);
                alert("Failed to save request. Error: " + e.message); 
            }
        },

        async deleteRequest(id) {
            try {
                await window.deleteDoc(window.doc(window.db, "customer_requests", id));
            } catch(e) {
                console.error(e);
            }
        }
    };

})();

window.TrendEngine = TrendEngine;
