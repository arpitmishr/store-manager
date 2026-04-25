const TrendEngine = (() => {
  const STATE = {
    initialized: false,
    location: null,
    holidays:[],
    weatherForecast: [],
    salesHistory: [],
    trainedModel: {},
    notifications:[],
    lastTrainDate: null,
    currentTrend: {},
  };

  const CFG = {
    COUNTRY_CODE: 'IN',
    CURRENCY: '₹',
    CATEGORIES:[],
    FS_SALES_COL: 'transactions',
    FS_TRENDS_COL: 'trends_cache',
    FS_NOTIF_COL: 'notifications',
    TREND_HIGH_SCORE: 70,
    TREND_LOW_SCORE: 30,
    HISTORY_DAYS_BACK: 365,
    RETRAIN_INTERVAL_H: 24,
    WEATHER_BOOST: {
      RAIN: { codes:[51, 53, 55, 61, 63, 65, 80, 81, 82, 95], keywords:['rain', 'umbrella', 'monsoon', 'waterproof'], boost: 40 },
      COLD: { tempMax: 15, keywords:['winter', 'jacket', 'sweater', 'cold', 'hoodie', 'thermal'], boost: 35 },
      HOT: { tempMin: 35, keywords:['summer', 'cotton', 't-shirt', 'shorts', 'cool'], boost: 30 },
    },
  };

  const INDIA_EVENTS =[
    { name: 'New Year', month: 1, dayStart: 1, dayEnd: 3, keywords: ['casual', 'party', 'gift'], boost: 30 },
    { name: 'Makar Sankranti', month: 1, dayStart: 13, dayEnd: 15, keywords: ['ethnic', 'kite', 'traditional'], boost: 35 },
    { name: 'Republic Day', month: 1, dayStart: 24, dayEnd: 26, keywords: ['formal', 'flag', 'kids'], boost: 20 },
    { name: 'Valentine\'s Day', month: 2, dayStart: 10, dayEnd: 14, keywords: ['gift', 'perfume', 'casual', 'red'], boost: 25 },
    { name: 'Holi', month: 3, dayStart: -7, dayEnd: 1, keywords: ['casual', 'white', 'color', 'ethnic'], boost: 55 },
    { name: 'Wedding Season 1', month: 4, dayStart: 20, dayEnd: 30, keywords: ['bridal', 'wedding', 'suit', 'ethnic', 'gift'], boost: 70 },
    { name: 'Summer Peak', month: 5, dayStart: 1, dayEnd: 31, keywords: ['summer', 'cotton', 'cool'], boost: 50 },
    { name: 'Monsoon Start', month: 7, dayStart: 1, dayEnd: 31, keywords:['rain', 'umbrella', 'monsoon'], boost: 60 },
    { name: 'Back to School', month: 7, dayStart: 1, dayEnd: 15, keywords:['bag', 'bottle', 'kids', 'school', 'uniform'], boost: 40 },
    { name: 'Independence Day', month: 8, dayStart: 13, dayEnd: 15, keywords: ['formal', 'traditional'], boost: 20 },
    { name: 'Navratri', month: 10, dayStart: 2, dayEnd: 12, keywords: ['ethnic', 'traditional', 'festive'], boost: 65 },
    { name: 'Diwali', month: 11, dayStart: 1, dayEnd: 5, keywords: ['ethnic', 'gift', 'festive', 'sweet', 'decor'], boost: 90 },
    { name: 'Winter Onset', month: 11, dayStart: 15, dayEnd: 30, keywords: ['winter', 'jacket', 'sweater'], boost: 55 },
    { name: 'Christmas', month: 12, dayStart: 20, dayEnd: 25, keywords: ['casual', 'gift', 'kids', 'party'], boost: 40 },
    { name: 'Year End Sale', month: 12, dayStart: 26, dayEnd: 31, keywords: ['casual', 'electronics', 'apparel'], boost: 35 },
  ];

  const Utils = {
    today() { return new Date(); },
    todayStr() { return this.today().toISOString().split('T')[0]; },
    pad: n => String(n).padStart(2, '0'),
    daysBetween(a, b) { return Math.round(Math.abs(b - a) / 86400000); },
    sameDateLastYear(d = new Date()) {
      const ly = new Date(d);
      ly.setFullYear(ly.getFullYear() - 1);
      return ly;
    },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    weightedAvg(values, weights) {
      const sumW = weights.reduce((a, b) => a + b, 0);
      if (!sumW) return 0;
      return values.reduce((acc, v, i) => acc + v * weights[i], 0) / sumW;
    },
    sigmoid: x => 1 / (1 + Math.exp(-x)),
    r1: v => Math.round(v * 10) / 10,
    ls: {
      get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
      del: k => { try { localStorage.removeItem(k); } catch {} },
    },
    debounce(fn, ms) {
      let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    },
    money: v => `${CFG.CURRENCY}${Number(v).toLocaleString('en-IN')}`,
    trendLabel(score) {
      if (score >= 85) return { label: '🔥 PEAK', cls: 'peak' };
      if (score >= CFG.TREND_HIGH_SCORE) return { label: '📈 HIGH', cls: 'high' };
      if (score >= CFG.TREND_LOW_SCORE) return { label: '➡ MEDIUM', cls: 'medium' };
      return { label: '📉 LOW', cls: 'low' };
    },
    monthName: m =>['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m],
  };

  const API = {
    async getCoords() {
      return new Promise((res, rej) => {
        if (!navigator.geolocation) return rej('no-geo');
        navigator.geolocation.getCurrentPosition(
          p => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
          () => rej('denied'),
          { timeout: 8000 }
        );
      });
    },
    async reverseGeocode(lat, lon) {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const d = await r.json();
        return {
          city: d.address?.city || d.address?.town || d.address?.village || 'Unknown',
          state: d.address?.state || '',
          country: d.address?.country_code?.toUpperCase() || CFG.COUNTRY_CODE,
        };
      } catch { return { city: 'Unknown', state: '', country: CFG.COUNTRY_CODE }; }
    },
    async fetchHolidays(countryCode, year) {
      const cacheKey = `te_holidays_${countryCode}_${year}`;
      const cached = Utils.ls.get(cacheKey);
      if (cached) return cached;
      try {
        const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
        const data = await r.json();
        Utils.ls.set(cacheKey, data);
        return data;
      } catch { return[]; }
    },
    async fetchWeather(lat, lon) {
      const cacheKey = `te_weather_${Utils.todayStr()}`;
      const cached = Utils.ls.get(cacheKey);
      if (cached) return cached;
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&timezone=auto&forecast_days=14`;
        const r = await fetch(url);
        const d = await r.json();
        const forecast = (d.daily?.time ||[]).map((date, i) => ({
          date,
          tempMax: d.daily.temperature_2m_max[i],
          tempMin: d.daily.temperature_2m_min[i],
          weatherCode: d.daily.weathercode[i],
          rain: d.daily.precipitation_sum[i],
        }));
        Utils.ls.set(cacheKey, forecast);
        return forecast;
      } catch { return[]; }
    },
    async fetchNearbyOSMEvents(lat, lon) {
      const query = `[out:json][timeout:15];(node["event"](around:30000,${lat},${lon});node["amenity"="marketplace"](around:30000,${lat},${lon});node["tourism"="attraction"](around:30000,${lat},${lon});way["leisure"="stadium"](around:30000,${lat},${lon}););out body;`;
      try {
        const r = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST', body: query
        });
        const d = await r.json();
        return (d.elements || []).map(e => ({
          name: e.tags?.name || e.tags?.['name:en'] || 'Local Venue',
          type: e.tags?.event || e.tags?.amenity || e.tags?.tourism || 'venue',
          lat: e.lat || e.center?.lat,
          lon: e.lon || e.center?.lon,
        }));
      } catch { return[]; }
    },
  };

  const FireStore = {
    db: null,
    async saveTrendCache(data) {
      if (!this.db) return;
      try {
        const docRef = window.db ? window.doc(window.collection(window.db, CFG.FS_TRENDS_COL), 'latest') : null;
        if (docRef && window.setDoc) await window.setDoc(docRef, { ...data, savedAt: new Date().toISOString() });
      } catch(e) { }
    },
    async loadTrendCache() {
      if (!this.db) return null;
      try {
        const docRef = window.db ? window.doc(window.collection(window.db, CFG.FS_TRENDS_COL), 'latest') : null;
        if (docRef && window.getDoc) {
          const snap = await window.getDoc(docRef);
          return snap.exists() ? snap.data() : null;
        }
        return null;
      } catch { return null; }
    },
    async loadSalesHistory(days = 365) {
      if (typeof allTransactions !== 'undefined' && Array.isArray(allTransactions)) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        return allTransactions.filter(t => 
          (t.type === 'Sale' || t.type === 'Cosmetic Sale') && 
          new Date(t.date) >= since
        );
      }
      return Utils.ls.get('te_sales_history') ||[];
    },
    async saveNotification(notif) {
      const existing = Utils.ls.get('te_notifications') ||[];
      existing.unshift(notif);
      Utils.ls.set('te_notifications', existing.slice(0, 100));
    },
    loadNotifications() {
      return Utils.ls.get('te_notifications') ||[];
    },
  };

  const TrendComputer = {
    compute(date, history, holidays, weather, nearbyEvents) {
      const results = {};
      CFG.CATEGORIES.forEach(cat => {
        const signals =[];
        const evtSignal = this._eventSignal(date, cat);
        if (evtSignal.value > 0) signals.push(evtSignal);
        const holSignal = this._holidaySignal(date, cat, holidays);
        if (holSignal.value > 0) signals.push(holSignal);
        const wxSignal = this._weatherSignal(date, cat, weather);
        if (wxSignal.value > 0) signals.push(wxSignal);
        const histSignal = this._historicalSignal(date, cat, history);
        signals.push(histSignal);
        const momentumSignal = this._momentumSignal(date, cat, history);
        signals.push(momentumSignal);
        signals.push(this._seasonalBaseline(date, cat));
        const nearbySignal = this._nearbySignal(cat, nearbyEvents);
        if (nearbySignal.value > 0) signals.push(nearbySignal);
        const rawScore = Utils.weightedAvg(
          signals.map(s => s.value),
          signals.map(s => s.weight)
        );
        const score = Utils.clamp(Math.round(rawScore), 0, 100);
        const tl = Utils.trendLabel(score);
        const lastYearScore = this._lastYearScore(date, cat, history);
        const delta = score - lastYearScore;
        results[cat] = {
          score,
          label: tl.label,
          cls: tl.cls,
          delta: Utils.r1(delta),
          reasons: signals.filter(s => s.reason).map(s => s.reason),
        };
      });
      return results;
    },
    _hasKeyword(cat, keywords) {
      const lower = cat.toLowerCase();
      return keywords.some(kw => lower.includes(kw));
    },
    _eventSignal(date, cat) {
      const m = date.getMonth() + 1;
      const day = date.getDate();
      let maxBoost = 0;
      let reason = '';
      INDIA_EVENTS.forEach(evt => {
        if (evt.month !== m) return;
        if (!this._hasKeyword(cat, evt.keywords)) return;
        const start = evt.dayStart < 0 ? (day >= 1 && day <= 31) : day >= evt.dayStart;
        const end = day <= evt.dayEnd;
        if (start && end && evt.boost > maxBoost) {
          maxBoost = evt.boost;
          reason = `📅 ${evt.name} demand boost`;
        }
        const preStart = evt.dayStart - 7;
        if (preStart > 0 && day >= preStart && day < evt.dayStart && evt.boost * 0.6 > maxBoost) {
          maxBoost = evt.boost * 0.6;
          reason = `⏰ Pre-${evt.name} demand rising`;
        }
      });
      return { value: maxBoost, weight: 0.30, reason };
    },
    _holidaySignal(date, cat, holidays) {
      const ds = date.toISOString().split('T')[0];
      const hit = holidays.find(h => h.date === ds);
      if (!hit) {
        const soon = holidays.find(h => {
          const diff = Utils.daysBetween(date, new Date(h.date));
          return diff >= 0 && diff <= 5;
        });
        if (soon) return { value: 25, weight: 0.10, reason: `🗓 Holiday approaching: ${soon.localName}` };
        return { value: 0, weight: 0.05, reason: '' };
      }
      const isFestive = this._hasKeyword(cat,['ethnic', 'festive', 'traditional', 'gift']);
      const boost = isFestive ? 60 : 30;
      return { value: boost, weight: 0.15, reason: `🏖 Public holiday: ${hit.localName}` };
    },
    _weatherSignal(date, cat, weather) {
      if (!weather.length) return { value: 0, weight: 0.05, reason: '' };
      const ds = date.toISOString().split('T')[0];
      const today = weather.find(w => w.date === ds) || weather[0];
      if (!today) return { value: 0, weight: 0.05, reason: '' };
      const { tempMax, tempMin, weatherCode, rain } = today;
      const rain7 = CFG.WEATHER_BOOST.RAIN;
      const cold = CFG.WEATHER_BOOST.COLD;
      const hot = CFG.WEATHER_BOOST.HOT;
      if (rain7.codes.includes(weatherCode) && this._hasKeyword(cat, rain7.keywords))
        return { value: rain7.boost, weight: 0.20, reason: `🌧 Rain forecasted (${rain}mm) — ${cat} demand up` };
      if (tempMax <= cold.tempMax && this._hasKeyword(cat, cold.keywords))
        return { value: cold.boost, weight: 0.20, reason: `🥶 Cold weather (${tempMax}°C max) — ${cat} demand up` };
      if (tempMin >= hot.tempMin && this._hasKeyword(cat, hot.keywords))
        return { value: hot.boost, weight: 0.20, reason: `☀ Heatwave (${tempMin}°C min) — ${cat} demand up` };
      return { value: 0, weight: 0.05, reason: '' };
    },
    _historicalSignal(date, cat, history) {
      if (!history.length) return { value: 50, weight: 0.25, reason: '📊 Baseline (no history yet)' };
      const lyDate = Utils.sameDateLastYear(date);
      const windowStart = new Date(lyDate); windowStart.setDate(lyDate.getDate() - 15);
      const windowEnd = new Date(lyDate); windowEnd.setDate(lyDate.getDate() + 15);
      const windowSales = history.filter(s => {
        const sd = new Date(s.date);
        return s.item === cat && sd >= windowStart && sd <= windowEnd;
      });
      if (!windowSales.length)
        return { value: 50, weight: 0.15, reason: '📊 No last-year data for this window' };
      const totalQty = windowSales.reduce((a, s) => a + (Number(s.qty) || 0), 0);
      const avgQty = totalQty / windowSales.length;
      const bestWindow = this._bestWindowQty(cat, history);
      const ratio = bestWindow > 0 ? (avgQty / bestWindow) : 0.5;
      const value = Utils.clamp(Math.round(ratio * 100), 0, 100);
      return { value, weight: 0.25, reason: `📅 Last year same period: avg ${Utils.r1(avgQty)} units/day sold` };
    },
    _momentumSignal(date, cat, history) {
      const cutoff = new Date(date); cutoff.setDate(date.getDate() - 14);
      const recent = history.filter(s => s.item === cat && new Date(s.date) >= cutoff);
      if (!recent.length) return { value: 50, weight: 0.10, reason: '' };
      const days = recent.map((s, i) => i);
      const qtys = recent.map(s => Number(s.qty) || 0);
      const slope = this._linearSlope(days, qtys);
      let value = 50;
      let reason = '';
      if (slope > 1.5) { value = 80; reason = `📈 Strong upward momentum (+${Utils.r1(slope)} units/day)`; }
      else if (slope > 0.5) { value = 65; reason = `↗ Moderate growth trend`; }
      else if (slope < -1.5) { value = 20; reason = `📉 Declining sales trend`; }
      else if (slope < -0.5) { value = 35; reason = `↘ Slight downward trend`; }
      return { value, weight: 0.12, reason };
    },
    _seasonalBaseline(date, cat) {
      return { value: 50, weight: 0.08, reason: '' };
    },
    _nearbySignal(cat, nearbyEvents) {
      if (!nearbyEvents.length) return { value: 0, weight: 0.05, reason: '' };
      const map = {
        marketplace: { keywords:['casual', 'ethnic', 'daily'], boost: 20 },
        stadium: { keywords:['sport', 'casual', 'jersey', 'shoes'], boost: 15 },
        attraction: { keywords:['casual', 'ethnic', 'gift'], boost: 15 },
      };
      let best = 0, reason = '';
      nearbyEvents.forEach(ev => {
        const entry = map[ev.type];
        if (entry && this._hasKeyword(cat, entry.keywords) && entry.boost > best) {
          best = entry.boost;
          reason = `📍 Nearby ${ev.type}: ${ev.name}`;
        }
      });
      return { value: best, weight: 0.05, reason };
    },
    _lastYearScore(date, cat, history) {
      const ly = Utils.sameDateLastYear(date);
      const seasonal = this._seasonalBaseline(ly, cat);
      const histSig = this._historicalSignal(ly, cat, history);
      return Utils.weightedAvg([seasonal.value, histSig.value], [seasonal.weight, histSig.weight]);
    },
    _bestWindowQty(cat, history) {
      const catSales = history.filter(s => s.item === cat).sort((a, b) => a.date > b.date ? 1 : -1);
      if (!catSales.length) return 1;
      let best = 0;
      catSales.forEach((_, i) => {
        const window30 = catSales.slice(i, i + 30);
        const sum = window30.reduce((a, s) => a + (Number(s.qty) || 0), 0);
        const avg = sum / (window30.length || 1);
        if (avg > best) best = avg;
      });
      return best || 1;
    },
    _linearSlope(xs, ys) {
      const n = xs.length;
      if (n < 2) return 0;
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
      const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
      return den ? num / den : 0;
    },
  };

  const Alerter = {
    generate(trends, previousTrends, weatherForecast, events) {
      const alerts = [];
      const now = new Date();
      Object.entries(trends).forEach(([cat, t]) => {
        if (t.score >= 85) {
          alerts.push({
            id: `peak_${cat}_${Utils.todayStr()}`,
            type: 'PEAK',
            icon: '🔥',
            title: `Peak Demand: ${cat}`,
            body: `Score ${t.score}/100. ${t.reasons[0] || ''}. Stock up immediately.`,
            cat,
            score: t.score,
            ts: now.toISOString(),
            read: false,
            priority: 1,
          });
        }
      });
      Object.entries(trends).forEach(([cat, t]) => {
        if (t.delta > 15 && t.score >= CFG.TREND_LOW_SCORE) {
          alerts.push({
            id: `rising_${cat}_${Utils.todayStr()}`,
            type: 'RISING',
            icon: '📈',
            title: `Rising Demand: ${cat}`,
            body: `Up ${t.delta} points vs last year. ${t.reasons[0] || ''}`,
            cat,
            score: t.score,
            ts: now.toISOString(),
            read: false,
            priority: 2,
          });
        }
      });
      Object.entries(trends).forEach(([cat, t]) => {
        if (t.score >= CFG.TREND_HIGH_SCORE) {
          const ls = Utils.ls.get(`stock_${cat}`) || null;
          if (ls !== null && ls < 10) {
            alerts.push({
              id: `lowstock_${cat}_${Utils.todayStr()}`,
              type: 'STOCK',
              icon: '⚠️',
              title: `Low Stock Alert: ${cat}`,
              body: `Only ${ls} units left while demand is ${t.label}. Reorder now!`,
              cat,
              score: t.score,
              ts: now.toISOString(),
              read: false,
              priority: 1,
            });
          }
        }
      });
      const next3 = weatherForecast.slice(0, 3);
      next3.forEach(w => {
        if (CFG.WEATHER_BOOST.RAIN.codes.includes(w.weatherCode) && w.rain > 10) {
          alerts.push({
            id: `rain_${w.date}`,
            type: 'WEATHER',
            icon: '🌧',
            title: `Rain Alert: ${w.date}`,
            body: `Heavy rain (${w.rain}mm) expected.`,
            cat: 'Rainwear / Umbrellas',
            score: 80,
            ts: now.toISOString(),
            read: false,
            priority: 2,
          });
        }
        if (w.tempMax <= 12) {
          alerts.push({
            id: `cold_${w.date}`,
            type: 'WEATHER',
            icon: '❄',
            title: `Cold Snap Alert: ${w.date}`,
            body: `Very cold (${w.tempMax}°C max).`,
            cat: 'Winter Wear',
            score: 80,
            ts: now.toISOString(),
            read: false,
            priority: 2,
          });
        }
      });
      const lookahead = 7;
      INDIA_EVENTS.forEach(evt => {
        const evtDate = new Date(now.getFullYear(), evt.month - 1, Math.max(1, evt.dayStart));
        const diff = Utils.daysBetween(now, evtDate);
        if (diff > 0 && diff <= lookahead && evt.boost >= 50) {
          alerts.push({
            id: `event_${evt.name.replace(/\s/g, '_')}_${now.getFullYear()}`,
            type: 'EVENT',
            icon: '📅',
            title: `${evt.name} in ${diff} days!`,
            body: `High demand expected based on keywords: ${evt.keywords.join(', ')}.`,
            cat: evt.keywords[0],
            score: evt.boost,
            ts: now.toISOString(),
            read: false,
            priority: diff <= 3 ? 1 : 2,
          });
        }
      });
      Object.entries(trends).forEach(([cat, t]) => {
        if (t.delta < -15 && t.score < CFG.TREND_LOW_SCORE) {
          alerts.push({
            id: `decline_${cat}_${Utils.todayStr()}`,
            type: 'DECLINE',
            icon: '📉',
            title: `Declining Demand: ${cat}`,
            body: `Down ${Math.abs(t.delta)} pts vs last year. Consider discounts to clear stock.`,
            cat,
            score: t.score,
            ts: now.toISOString(),
            read: false,
            priority: 3,
          });
        }
      });
      const seen = new Set();
      const deduped = alerts.filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id); return true;
      }).sort((a, b) => a.priority - b.priority);
      return deduped;
    },
  };

  const UI = {
    activeSubTab: 'trends',
    injectCSS() {
      if (document.getElementById('te-styles')) return;
      const style = document.createElement('style');
      style.id = 'te-styles';
      style.textContent = `
        :root {
          --te-bg: transparent;
          --te-surface: rgba(0,0,0,0.03);
          --te-card: #ffffff;
          --te-border: #e5e7eb;
          --te-accent: #3b82f6;
          --te-accent2: #f59e0b;
          --te-green: #10b981;
          --te-red: #ef4444;
          --te-orange: #f97316;
          --te-text: #1f2937;
          --te-muted: #6b7280;
          --te-peak: #ef4444;
          --te-high: #f97316;
          --te-medium: #3b82f6;
          --te-low: #9ca3af;
        }
        .dark-mode {
          --te-bg: transparent;
          --te-surface: #1f2937;
          --te-card: #374151;
          --te-border: #4b5563;
          --te-text: #f3f4f6;
          --te-muted: #9ca3af;
        }
        #te-root { font-family: 'Inter', system-ui, sans-serif; color: var(--te-text); background: var(--te-bg); width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid var(--te-border); }
        .te-subtabs { display: flex; background: var(--te-surface); border-bottom: 1px solid var(--te-border); }
        .te-subtab { flex: 1; padding: 14px 8px; text-align: center; cursor: pointer; font-size: 0.875rem; font-weight: 600; color: var(--te-muted); transition: all 0.2s; }
        .te-subtab.active { color: var(--te-accent); border-bottom: 2px solid var(--te-accent); background: rgba(59,130,246,0.1); margin-bottom: -1px; }
        .te-subtab-badge { background: var(--te-red); color: #fff; border-radius: 10px; padding: 2px 6px; font-size: 0.7rem; margin-left: 4px; }
        .te-panel { padding: 20px; background: var(--te-bg); }
        .te-panel.hidden { display: none; }
        .te-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .te-header h2 { font-size: 1.25rem; margin: 0; font-weight: 700; color: var(--te-text); }
        .te-refresh-btn { background: var(--te-accent); color: #fff; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 0.875rem; font-weight: 600; transition: opacity 0.2s; }
        .te-refresh-btn:hover { opacity: 0.9; }
        .te-loc-bar { background: var(--te-surface); border-radius: 10px; padding: 10px 14px; font-size: 0.875rem; color: var(--te-text); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--te-border); }
        .te-date-ctx { font-size: 0.875rem; color: var(--te-accent2); background: rgba(245,158,11,0.1); border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; font-weight: 500; }
        .te-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media(min-width:768px){ .te-grid{ grid-template-columns: repeat(2, 1fr); } }
        @media(min-width:1024px){ .te-grid{ grid-template-columns: repeat(3, 1fr); } }
        .te-card { background: var(--te-card); border-radius: 12px; padding: 16px; border: 1px solid var(--te-border); position: relative; overflow: hidden; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .te-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .te-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; }
        .te-card.peak::before { background: var(--te-peak); }
        .te-card.high::before { background: var(--te-high); }
        .te-card.medium::before { background: var(--te-medium); }
        .te-card.low::before { background: var(--te-low); }
        .te-card-cat { font-size: 0.875rem; font-weight: 600; color: var(--te-text); margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .te-card-score { font-size: 2.5rem; font-weight: 800; line-height: 1; margin-bottom: 4px; }
        .te-card.peak .te-card-score { color: var(--te-peak); }
        .te-card.high .te-card-score { color: var(--te-high); }
        .te-card.medium .te-card-score { color: var(--te-medium); }
        .te-card.low .te-card-score { color: var(--te-low); }
        .te-card-label { font-size: 0.875rem; font-weight: 700; margin-bottom: 8px; color: var(--te-muted); }
        .te-card-delta { font-size: 0.75rem; font-weight: 600; }
        .te-card-delta.pos { color: var(--te-green); }
        .te-card-delta.neg { color: var(--te-red); }
        .te-progress { height: 6px; background: var(--te-surface); border-radius: 4px; overflow: hidden; margin: 12px 0; }
        .te-progress-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
        .peak .te-progress-fill { background: var(--te-peak); }
        .high .te-progress-fill { background: var(--te-high); }
        .medium .te-progress-fill { background: var(--te-medium); }
        .low .te-progress-fill { background: var(--te-low); }
        .te-card-reasons { font-size: 0.75rem; color: var(--te-muted); margin-top: 8px; padding-left: 16px; list-style-type: disc; }
        .te-card-reasons li { margin-bottom: 4px; }
        .te-weather { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 20px; }
        .te-wx-card { background: var(--te-card); border-radius: 10px; padding: 12px; min-width: 90px; text-align: center; border: 1px solid var(--te-border); flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .te-wx-date { font-size: 0.75rem; font-weight: 600; color: var(--te-muted); }
        .te-wx-icon { font-size: 1.75rem; margin: 8px 0; }
        .te-wx-temp { font-size: 0.875rem; font-weight: 700; color: var(--te-text); }
        .te-timeline { margin-top: 16px; background: var(--te-card); border-radius: 12px; border: 1px solid var(--te-border); overflow: hidden; }
        .te-tl-item { display: flex; gap: 12px; align-items: center; padding: 16px; border-bottom: 1px solid var(--te-border); }
        .te-tl-item:last-child { border-bottom: none; }
        .te-tl-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .te-tl-dot.urgent { background: var(--te-red); box-shadow: 0 0 8px rgba(239,68,68,0.5); }
        .te-tl-dot.soon { background: var(--te-orange); }
        .te-tl-dot.normal { background: var(--te-accent); }
        .te-tl-days { font-size: 0.875rem; font-weight: 600; color: var(--te-text); white-space: nowrap; }
        .te-tl-name { font-size: 1rem; font-weight: 700; color: var(--te-text); }
        .te-tl-cats { font-size: 0.75rem; color: var(--te-muted); margin-top: 4px; }
        .te-notif-filter { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .te-nf-btn { border: 1px solid var(--te-border); background: var(--te-card); color: var(--te-text); border-radius: 20px; padding: 6px 16px; cursor: pointer; font-size: 0.875rem; font-weight: 500; transition: all 0.2s; }
        .te-nf-btn.active { background: var(--te-accent); color: #fff; border-color: var(--te-accent); }
        .te-notif-item { background: var(--te-card); border-radius: 12px; padding: 16px; margin-bottom: 12px; border-left: 4px solid var(--te-border); border-top: 1px solid var(--te-border); border-right: 1px solid var(--te-border); border-bottom: 1px solid var(--te-border); cursor: pointer; transition: opacity 0.2s, transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .te-notif-item:hover { transform: translateX(4px); }
        .te-notif-item.unread { border-left-width: 6px; }
        .te-notif-item.PEAK { border-left-color: var(--te-peak); }
        .te-notif-item.RISING { border-left-color: var(--te-green); }
        .te-notif-item.WEATHER { border-left-color: #0ea5e9; }
        .te-notif-item.EVENT { border-left-color: var(--te-accent2); }
        .te-notif-item.DECLINE { border-left-color: var(--te-low); }
        .te-notif-item.STOCK { border-left-color: var(--te-red); }
        .te-notif-item.read { opacity: 0.6; }
        .te-notif-title { font-size: 1rem; font-weight: 700; margin-bottom: 6px; color: var(--te-text); display: flex; align-items: center; }
        .te-notif-body { font-size: 0.875rem; color: var(--te-muted); }
        .te-notif-ts { font-size: 0.75rem; color: var(--te-low); margin-top: 8px; }
        .te-notif-badge { display: inline-block; font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; margin-left: 8px; font-weight: 700; text-transform: uppercase; }
        .te-mark-all { background: var(--te-surface); border: 1px solid var(--te-border); color: var(--te-text); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 0.875rem; font-weight: 500; margin-left: auto; transition: background 0.2s; }
        .te-mark-all:hover { background: var(--te-border); }
        .te-loading { text-align: center; padding: 60px 20px; color: var(--te-muted); font-size: 1rem; font-weight: 500; }
        .te-spinner { width: 40px; height: 40px; border: 3px solid var(--te-border); border-top-color: var(--te-accent); border-radius: 50%; animation: te-spin 1s linear infinite; margin: 0 auto 16px; }
        @keyframes te-spin { to { transform: rotate(360deg); } }
        .te-sec-title { font-size: 0.875rem; font-weight: 700; color: var(--te-muted); letter-spacing: 0.5px; text-transform: uppercase; margin: 24px 0 12px; }
        .te-hl-row { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .te-hl-chip { flex: 1; border-radius: 12px; padding: 16px; text-align: center; min-width: 200px; }
        .te-hl-chip.high { background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.2); }
        .te-hl-chip.low { background: rgba(156,163,175,0.05); border: 1px solid rgba(156,163,175,0.2); }
        .te-hl-label { font-size: 0.75rem; font-weight: 700; color: var(--te-muted); margin-bottom: 4px; }
        .te-hl-val { font-size: 1.125rem; font-weight: 700; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .high .te-hl-val { color: var(--te-peak); }
        .low .te-hl-val { color: var(--te-low); }
        .te-empty { text-align: center; padding: 40px; color: var(--te-muted); font-size: 1rem; background: var(--te-card); border-radius: 12px; border: 1px dashed var(--te-border); }
      `;
      document.head.appendChild(style);
    },
    render(containerId) {
      this.injectCSS();
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = `
        <div id="te-root">
          <div class="te-subtabs">
            <div class="te-subtab active" data-tab="trends" onclick="TrendEngine._switchTab('trends',this)">
              <i class="fa-solid fa-fire mr-1"></i> Trends
            </div>
            <div class="te-subtab" data-tab="events" onclick="TrendEngine._switchTab('events',this)">
              <i class="fa-solid fa-calendar-check mr-1"></i> Events
            </div>
            <div class="te-subtab" data-tab="notifications" onclick="TrendEngine._switchTab('notifications',this)">
              <i class="fa-solid fa-bell mr-1"></i> Alerts
              <span class="te-subtab-badge" id="te-notif-badge">0</span>
            </div>
          </div>
          <div class="te-panel" id="te-panel-trends">
            <div class="te-header">
              <h2>Smart Demand Trends</h2>
              <button class="te-refresh-btn" onclick="TrendEngine.refresh()"><i class="fa-solid fa-rotate-right mr-1"></i> Sync</button>
            </div>
            <div class="te-loc-bar" id="te-loc-bar"><i class="fa-solid fa-location-dot"></i> Detecting location context...</div>
            <div class="te-date-ctx" id="te-date-ctx">Loading context...</div>
            <div class="te-hl-row" id="te-hl-row"></div>
            <div class="te-sec-title">14-Day Weather Forecast</div>
            <div class="te-weather" id="te-weather-strip"></div>
            <div class="te-sec-title">Product Demand Scores</div>
            <div class="te-grid" id="te-demand-grid">
              <div class="te-loading"><div class="te-spinner"></div>Analyzing inventory and sales trends...</div>
            </div>
          </div>
          <div class="te-panel hidden" id="te-panel-events">
            <div class="te-header"><h2>Upcoming Events Radar</h2></div>
            <div class="te-sec-title">Next 60 Days — Demand Triggers</div>
            <div id="te-events-list"></div>
          </div>
          <div class="te-panel hidden" id="te-panel-notifications">
            <div class="te-header">
              <h2>Insight Alerts</h2>
              <button class="te-mark-all" onclick="TrendEngine._markAllRead()"><i class="fa-solid fa-check-double mr-1"></i> Mark read</button>
            </div>
            <div class="te-notif-filter" id="te-notif-filter">
              <button class="te-nf-btn active" onclick="TrendEngine._filterNotifs('ALL',this)">All</button>
              <button class="te-nf-btn" onclick="TrendEngine._filterNotifs('PEAK',this)">🔥 Peak</button>
              <button class="te-nf-btn" onclick="TrendEngine._filterNotifs('RISING',this)">📈 Rising</button>
              <button class="te-nf-btn" onclick="TrendEngine._filterNotifs('WEATHER',this)">🌧 Weather</button>
              <button class="te-nf-btn" onclick="TrendEngine._filterNotifs('EVENT',this)">📅 Events</button>
              <button class="te-nf-btn" onclick="TrendEngine._filterNotifs('STOCK',this)">⚠️ Stock</button>
            </div>
            <div id="te-notif-list"></div>
          </div>
        </div>
      `;
      this._updateNotifBadge();
      this._renderNotifications('ALL');
      this._renderEventsList();
      if (Object.keys(STATE.currentTrend).length) {
        this._renderTrends();
        this._renderWeather();
      }
    },
    _renderTrends() {
      const grid = document.getElementById('te-demand-grid');
      if (!grid) return;
      const sorted = Object.entries(STATE.currentTrend).sort((a, b) => b[1].score - a[1].score);
      const hlRow = document.getElementById('te-hl-row');
      if (hlRow) {
        if (sorted.length) {
          const [topCat, topT] = sorted[0];
          const[botCat, botT] = sorted[sorted.length - 1];
          hlRow.innerHTML = `
            <div class="te-hl-chip high">
              <div class="te-hl-label">🔥 HIGHEST DEMAND</div>
              <div class="te-hl-val" title="${topCat}">${topCat}</div>
              <div style="font-size:0.875rem;color:var(--te-muted);font-weight:600;">Score: ${topT.score}/100</div>
            </div>
            <div class="te-hl-chip low">
              <div class="te-hl-label">📉 LOWEST DEMAND</div>
              <div class="te-hl-val" title="${botCat}">${botCat}</div>
              <div style="font-size:0.875rem;color:var(--te-muted);font-weight:600;">Score: ${botT.score}/100</div>
            </div>
          `;
        } else {
          hlRow.innerHTML = '';
        }
      }
      const ctx = document.getElementById('te-date-ctx');
      if (ctx) {
        const now = new Date();
        const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const ds = now.toLocaleDateString('en-IN', opts);
        const loc = STATE.location;
        ctx.innerHTML = `<i class="fa-regular fa-calendar"></i> ${ds}${loc ? ` &bull; ${loc.city}, ${loc.state}` : ''}`;
      }
      const lb = document.getElementById('te-loc-bar');
      if (lb && STATE.location) {
        lb.innerHTML = `<i class="fa-solid fa-location-dot text-primary"></i> ${STATE.location.city}, ${STATE.location.country} &bull; Live weather & regional events enabled`;
      }
      if (!sorted.length) {
        grid.innerHTML = '<div class="te-empty" style="grid-column: 1 / -1;">No sales history found to analyze trends.</div>';
        return;
      }
      grid.innerHTML = sorted.map(([cat, t]) => `
        <div class="te-card ${t.cls}">
          <div class="te-card-cat" title="${cat}">${cat}</div>
          <div class="te-card-score">${t.score}</div>
          <div class="te-card-label">${t.label}</div>
          <div class="te-progress"><div class="te-progress-fill" style="width:${t.score}%"></div></div>
          <div class="te-card-delta ${t.delta >= 0 ? 'pos' : 'neg'}">
            ${t.delta >= 0 ? '▲' : '▼'} ${Math.abs(t.delta)} pts vs last year
          </div>
          <ul class="te-card-reasons">
            ${t.reasons.slice(0, 3).map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      `).join('');
    },
    _renderWeather() {
      const strip = document.getElementById('te-weather-strip');
      if (!strip || !STATE.weatherForecast.length) {
        if(strip) strip.innerHTML = '<div style="color:var(--te-muted);font-size:0.875rem;">Weather data unavailable.</div>';
        return;
      }
      const wxIcon = code => {
        if ([0].includes(code)) return '☀';
        if ([1, 2, 3].includes(code)) return '⛅';
        if ([45, 48].includes(code)) return '🌫';
        if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return '🌧';
        if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄';
        if ([95, 96, 99].includes(code)) return '⛈';
        return '🌤';
      };
      strip.innerHTML = STATE.weatherForecast.slice(0, 14).map(w => {
        const d = new Date(w.date);
        const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        return `
          <div class="te-wx-card">
            <div class="te-wx-date">${label}</div>
            <div class="te-wx-icon">${wxIcon(w.weatherCode)}</div>
            <div class="te-wx-temp">${w.tempMin}°–${w.tempMax}°</div>
            ${w.rain > 1 ? `<div style="font-size:0.7rem;color:#0ea5e9;font-weight:600;margin-top:4px;">${w.rain}mm</div>` : ''}
          </div>
        `;
      }).join('');
    },
    _renderEventsList() {
      const list = document.getElementById('te-events-list');
      if (!list) return;
      const now = new Date();
      const cutoff = new Date(now); cutoff.setDate(now.getDate() + 60);
      const upcoming = [];
      INDIA_EVENTS.forEach(evt => {[now.getFullYear(), now.getFullYear() + 1].forEach(year => {
          const d = new Date(year, evt.month - 1, Math.max(1, evt.dayStart));
          if (d >= now && d <= cutoff) {
            upcoming.push({
              name: evt.name,
              date: d,
              days: Utils.daysBetween(now, d),
              cats: evt.keywords,
              boost: evt.boost,
            });
          }
        });
      });
      STATE.holidays.forEach(h => {
        const d = new Date(h.date);
        if (d >= now && d <= cutoff) {
          upcoming.push({
            name: h.localName || h.name,
            date: d,
            days: Utils.daysBetween(now, d),
            cats: ['ethnic', 'festive', 'casual'],
            boost: 40,
          });
        }
      });
      upcoming.sort((a, b) => a.days - b.days);
      const seen2 = new Set();
      const deduped = upcoming.filter(u => {
        const key = `${u.name}_${u.days}`;
        if (seen2.has(key)) return false;
        seen2.add(key); return true;
      });
      if (!deduped.length) {
        list.innerHTML = '<div class="te-empty">No major regional events or holidays detected in the next 60 days.</div>';
        return;
      }
      list.innerHTML = `<div class="te-timeline">` + deduped.slice(0, 20).map(u => {
        const dotCls = u.days <= 3 ? 'urgent' : u.days <= 10 ? 'soon' : 'normal';
        const dateStr = u.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `
          <div class="te-tl-item">
            <div class="te-tl-dot ${dotCls}"></div>
            <div style="flex: 1;">
              <div class="te-tl-name">${u.name}
                <span style="font-size:0.7rem;background:rgba(245,158,11,0.15);color:var(--te-accent2);padding:2px 8px;border-radius:12px;margin-left:8px;font-weight:600;">${u.boost}% Impact</span>
              </div>
              <div class="te-tl-cats"><i class="fa-solid fa-tags text-gray-400 mr-1"></i> ${u.cats.join(', ')}</div>
            </div>
            <div style="text-align:right">
              <div class="te-tl-days">${dateStr}</div>
              <div style="font-size:0.75rem;font-weight:600;margin-top:4px;color:${u.days <= 3 ? 'var(--te-red)' : 'var(--te-muted)'}">
                ${u.days === 0 ? 'Today!' : `in ${u.days} days`}
              </div>
            </div>
          </div>
        `;
      }).join('') + `</div>`;
    },
    _renderNotifications(filter) {
      const list = document.getElementById('te-notif-list');
      if (!list) return;
      let notifs = (Utils.ls.get('te_notifications') ||[]);
      if (filter !== 'ALL') notifs = notifs.filter(n => n.type === filter);
      if (!notifs.length) {
        list.innerHTML = '<div class="te-empty">All caught up! No insights available right now.</div>';
        return;
      }
      list.innerHTML = notifs.map(n => {
        const ts = new Date(n.ts).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const readCls = n.read ? 'read' : 'unread';
        return `
          <div class="te-notif-item ${n.type} ${readCls}" onclick="TrendEngine._readNotif('${n.id}')">
            <div class="te-notif-title">
              <span style="margin-right:8px;">${n.icon}</span> ${n.title}
              <span class="te-notif-badge" style="background:${_typeColor(n.type)};color:#fff">${n.type}</span>
            </div>
            <div class="te-notif-body">${n.body}</div>
            <div class="te-notif-ts"><i class="fa-regular fa-clock"></i> ${ts}</div>
          </div>
        `;
      }).join('');
      function _typeColor(t) {
        return { PEAK: '#ef4444', RISING: '#10b981', WEATHER: '#0ea5e9', EVENT: '#f59e0b', STOCK: '#ef4444', DECLINE: '#9ca3af' }[t] || '#3b82f6';
      }
    },
    _updateNotifBadge() {
      const badge = document.getElementById('te-notif-badge');
      if (!badge) return;
      const unread = (Utils.ls.get('te_notifications') ||[]).filter(n => !n.read).length;
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = unread ? 'inline-block' : 'none';
    },
  };

  function _switchTab(tab, el) {['trends', 'events', 'notifications'].forEach(t => {
      const p = document.getElementById(`te-panel-${t}`);
      if(p) p.classList.toggle('hidden', t !== tab);
    });
    document.querySelectorAll('.te-subtab').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    UI.activeSubTab = tab;
    if (tab === 'notifications') UI._renderNotifications('ALL');
  }

  function _filterNotifs(filter, el) {
    document.querySelectorAll('.te-nf-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    UI._renderNotifications(filter);
  }

  function _markAllRead() {
    const notifs = Utils.ls.get('te_notifications') ||[];
    notifs.forEach(n => n.read = true);
    Utils.ls.set('te_notifications', notifs);
    UI._renderNotifications('ALL');
    UI._updateNotifBadge();
  }

  function _readNotif(id) {
    const notifs = Utils.ls.get('te_notifications') ||[];
    const n = notifs.find(x => x.id === id);
    if (n) { n.read = true; Utils.ls.set('te_notifications', notifs); }
    UI._renderNotifications('ALL');
    UI._updateNotifBadge();
  }

  async function refresh() {
    try {
      try {
        const coords = await API.getCoords();
        const geo = await API.reverseGeocode(coords.lat, coords.lon);
        STATE.location = { ...coords, ...geo };
      } catch {
        STATE.location = { lat: 28.6139, lon: 77.2090, city: 'New Delhi', state: 'Delhi', country: 'IN' };
      }
      const yr = new Date().getFullYear();
      const cc = STATE.location.country || CFG.COUNTRY_CODE;
      const[h1, h2] = await Promise.all([
        API.fetchHolidays(cc, yr),
        API.fetchHolidays(cc, yr + 1),
      ]);
      STATE.holidays =[...(h1 || []), ...(h2 ||[])];
      STATE.weatherForecast = await API.fetchWeather(STATE.location.lat, STATE.location.lon);
      const nearbyEvents = await API.fetchNearbyOSMEvents(STATE.location.lat, STATE.location.lon);
      STATE.salesHistory = await FireStore.loadSalesHistory(CFG.HISTORY_DAYS_BACK);
      
      const uniqueItems =[...new Set(STATE.salesHistory.map(s => s.item))];
      CFG.CATEGORIES = uniqueItems.length ? uniqueItems :[];

      if(CFG.CATEGORIES.length > 0) {
        const now = new Date();
        const trends = TrendComputer.compute(now, STATE.salesHistory, STATE.holidays, STATE.weatherForecast, nearbyEvents);
        STATE.currentTrend = trends;
        const alerts = Alerter.generate(trends, {}, STATE.weatherForecast, INDIA_EVENTS);
        const existingIds = new Set((Utils.ls.get('te_notifications') ||[]).map(n => n.id));
        const newAlerts = alerts.filter(a => !existingIds.has(a.id));
        newAlerts.forEach(a => FireStore.saveNotification(a));
        await FireStore.saveTrendCache({ trends, generatedAt: now.toISOString() });
      } else {
        STATE.currentTrend = {};
      }

      STATE.lastTrainDate = new Date().toISOString();
      Utils.ls.set('te_lastTrain', STATE.lastTrainDate);
      UI._renderTrends();
      UI._renderWeather();
      UI._renderEventsList();
      UI._renderNotifications(UI.activeSubTab === 'notifications' ? 'ALL' : 'ALL');
      UI._updateNotifBadge();
    } catch (err) { }
  }

  async function _autoRetrain() {
    const last = Utils.ls.get('te_lastTrain');
    if (!last) return refresh();
    const hoursElapsed = (Date.now() - new Date(last).getTime()) / 3600000;
    if (hoursElapsed >= CFG.RETRAIN_INTERVAL_H) return refresh();
    const cached = await FireStore.loadTrendCache();
    if (cached?.trends) {
      STATE.currentTrend = cached.trends;
      UI._renderTrends();
      UI._renderWeather();
      UI._renderEventsList();
      UI._updateNotifBadge();
    }
  }

  async function init(firestoreDb) {
    if (STATE.initialized) return;
    STATE.initialized = true;
    FireStore.db = firestoreDb || null;
    await _autoRetrain();
  }

  function renderTab(containerId) {
    UI.render(containerId);
    if (Object.keys(STATE.currentTrend).length) {
      UI._renderTrends();
      UI._renderWeather();
    }
  }

  function setStock(category, qty) {
    Utils.ls.set(`stock_${category}`, qty);
    const t = STATE.currentTrend[category];
    if (t && t.score >= CFG.TREND_HIGH_SCORE && qty < 10) {
      const alert = {
        id: `lowstock_${category}_${Utils.todayStr()}`,
        type: 'STOCK', icon: '⚠️',
        title: `Low Stock Alert: ${category}`,
        body: `Only ${qty} units left while demand is ${t.label}. Reorder now!`,
        cat: category, score: t.score,
        ts: new Date().toISOString(), read: false, priority: 1,
      };
      FireStore.saveNotification(alert);
      UI._updateNotifBadge();
    }
  }

  function recordSale(saleObj) {
    const history = Utils.ls.get('te_sales_history') ||
