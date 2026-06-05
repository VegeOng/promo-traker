// ai-team-data.js
// 数据来源：Google Sheets API（主力）+ Supabase（拜访/任务/促销）

const GOOGLE_SHEETS_API = 'https://script.google.com/macros/s/AKfycbwxt23ZB0od7EeBSNvjurKTbkDcM7HLgrWhuoqHc3meKWmhbB0XQzfOdB-X2Pj5O_MY/exec';

const SUPABASE_URL = 'https://wjhgezvrxlhpexocfsea.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqaGdlenZyeGxocGV4b2Nmc2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU4NzgsImV4cCI6MjA5NDA4MTg3OH0.jENcrgEDYDlSRUCqve-T6rxYRJfz-dnZQHnXpPLJ_RE';

const CORE_SKUS = ['KPM', 'CLM', 'SMTS', 'SMCL'];

// ── 日期工具 ──
function getDateRanges() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const yesterday = new Date(now - 86400000).toISOString().split('T')[0];
  const weekAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0];
  return { today, yesterday, year, month, weekAgo };
}

// ── Supabase 查询 ──
async function supabaseQuery(table, params = '') {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

// ── Google Sheets 数据（主力销售数据）──
async function fetchGoogleSheets() {
  try {
    const r = await fetch(GOOGLE_SHEETS_API);
    const json = await r.json();
    return json.data || [];
  } catch (e) {
    console.warn('Google Sheets fetch failed:', e.message);
    return [];
  }
}

// ── 主数据获取函数 ──
async function fetchSalesData() {
  const { year, month, yesterday, weekAgo, today } = getDateRanges();

  const [allOrders, visitYesterday, reports, tasks] = await Promise.all([
    fetchGoogleSheets(),
    supabaseQuery('visit_records', `visit_date=gte.${yesterday}&visit_date=lte.${today}&limit=100`),
    supabaseQuery('daily_reports', `date=gte.${yesterday}&limit=20`),
    supabaseQuery('tasks', `limit=50`),
  ]);

  // 筛选本月数据
  const thisMonthOrders = allOrders.filter(r =>
    parseInt(r['YEAR']) === year && parseInt(r['MONTH']) === month
  );

  // 筛选上月数据
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastMonthYear = month === 1 ? year - 1 : year;
  const lastMonthOrders = allOrders.filter(r =>
    parseInt(r['YEAR']) === lastMonthYear && parseInt(r['MONTH']) === lastMonth
  );

  return {
    allOrders,
    thisMonthOrders,
    lastMonthOrders,
    visitYesterday: visitYesterday || [],
    reports: reports || [],
    tasks: tasks || [],
    dateRanges: getDateRanges(),
  };
}

async function fetchFinanceData() {
  const { year, month } = getDateRanges();
  const allOrders = await fetchGoogleSheets();
  const thisMonthOrders = allOrders.filter(r =>
    parseInt(r['YEAR']) === year && parseInt(r['MONTH']) === month
  );
  return { allOrders, thisMonthOrders, dateRanges: getDateRanges() };
}

async function fetchOpsData() {
  const { weekAgo, today } = getDateRanges();
  const [visitRecent, tasks, stockChecks] = await Promise.all([
    supabaseQuery('visit_records', `visit_date=gte.${weekAgo}&order=visit_date.desc&limit=200`),
    supabaseQuery('tasks', `limit=50`),
    supabaseQuery('outlet_stock_checks', `order=created_at.desc&limit=100`),
  ]);
  return {
    visitRecent: visitRecent || [],
    tasks: tasks || [],
    stockChecks: stockChecks || [],
    dateRanges: getDateRanges(),
  };
}

async function fetchMarketingData() {
  const { year, month } = getDateRanges();
  const [allOrders, promotions, promoActivities] = await Promise.all([
    fetchGoogleSheets(),
    supabaseQuery('promotions', `limit=30&order=created_at.desc`),
    supabaseQuery('promo_activities', `limit=100`),
  ]);
  const thisMonthOrders = allOrders.filter(r =>
    parseInt(r['YEAR']) === year && parseInt(r['MONTH']) === month
  );
  return { thisMonthOrders, promotions: promotions || [], promoActivities: promoActivities || [], dateRanges: getDateRanges() };
}

// ── 根据角色返回数据 ──
async function fetchDataForRole(roleId) {
  if (roleId === 'xuanxuan') {
    const [salesData, opsData] = await Promise.all([fetchSalesData(), fetchOpsData()]);
    return { ...salesData, ...opsData };
  }
  const loaders = {
    xiaoxiao:   fetchSalesData,
    qianqian:   fetchFinanceData,
    chongchong: fetchMarketingData,
    shunshun:   fetchOpsData,
    diandian:   fetchSalesData,
    longlong:   fetchSalesData,
  };
  return await (loaders[roleId] || fetchSalesData)();
}

// ── 格式化数据给 AI 读 ──
function formatDataAsContext(data) {
  const { today, month, year } = getDateRanges();
  let ctx = `\n\n【实时数据 — ${today}】\n`;

  // 本月销售（来自 Google Sheets）
  if (data.thisMonthOrders && data.thisMonthOrders.length > 0) {
    const orders = data.thisMonthOrders;
    const totalSales = orders.reduce((s, r) => s + (parseFloat(r['TOTAL (RM)']) || 0), 0);
    ctx += `\n📊 本月销售（${year}年${month}月）：\n`;
    ctx += `  总销售额：RM ${totalSales.toFixed(2)}\n`;
    ctx += `  订单数：${orders.length} 笔\n`;

    // 按销售员汇总
    const bySP = {};
    orders.forEach(r => {
      const sp = r['SALES PERSON'] || 'Unknown';
      bySP[sp] = (bySP[sp] || 0) + (parseFloat(r['TOTAL (RM)']) || 0);
    });
    ctx += `\n各销售员本月业绩：\n`;
    const targets = { VEGE: 200000, CAROL: 100000, CHRIS: 100000, CHIN: 50000, RAYMOND: 50000 };
    Object.entries(bySP).sort((a, b) => b[1] - a[1]).forEach(([name, amt]) => {
      const target = targets[name.toUpperCase()] || 0;
      const pct = target > 0 ? ((amt / target) * 100).toFixed(1) : '-';
      ctx += `  - ${name}: RM ${amt.toFixed(2)}${target ? ` / 目标 RM ${target.toLocaleString()} (${pct}%)` : ''}\n`;
    });

    // 重点 SKU 本月 vs 上月
    ctx += `\n重点 SKU 本月销量：\n`;
    CORE_SKUS.forEach(sku => {
      const thisQty = orders.reduce((s, r) => s + (parseFloat(r[sku]) || 0), 0);
      const lastQty = (data.lastMonthOrders || []).reduce((s, r) => s + (parseFloat(r[sku]) || 0), 0);
      const trend = thisQty > lastQty ? '↑' : thisQty < lastQty ? '↓' : '→';
      const diff = lastQty > 0 ? (((thisQty - lastQty) / lastQty) * 100).toFixed(1) : '-';
      ctx += `  - ${sku}: ${thisQty} 件 ${trend}（上月 ${lastQty} 件${lastQty > 0 ? `，${diff}%` : ''}）\n`;
    });

    // 按客户汇总 top 5
    const byCompany = {};
    orders.forEach(r => {
      const co = r['COMPANY'] || 'Unknown';
      byCompany[co] = (byCompany[co] || 0) + (parseFloat(r['TOTAL (RM)']) || 0);
    });
    const top5 = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 5);
    ctx += `\nTop 5 客户本月：\n`;
    top5.forEach(([name, amt]) => {
      ctx += `  - ${name}: RM ${amt.toFixed(2)}\n`;
    });

    // MT 客户有没有下单
    const mtClients = ['LOTUS', '7 ELEVEN', 'AEON', 'MYNEWS', 'JAYA GROCER', 'VILLAGE GROCER'];
    const orderedMT = Object.keys(byCompany).map(k => k.toUpperCase());
    const missingMT = mtClients.filter(mt => !orderedMT.some(o => o.includes(mt)));
    if (missingMT.length > 0) {
      ctx += `\n⚠️ 本月还未下单的 MT 客户：${missingMT.join(', ')}\n`;
    }
  } else {
    ctx += `\n本月销售数据：暂无\n`;
  }

  // 昨日拜访（来自 Supabase）
  if (data.visitYesterday && data.visitYesterday.length > 0) {
    const byPerson = {};
    data.visitYesterday.forEach(v => {
      const name = v.rep_name || 'Unknown';
      byPerson[name] = (byPerson[name] || 0) + 1;
    });
    ctx += `\n👣 昨日拜访记录：\n`;
    Object.entries(byPerson).forEach(([n, c]) => ctx += `  - ${n}: ${c} 家\n`);
  } else {
    ctx += `\n👣 昨日拜访：暂无记录\n`;
  }

  // 本周拜访
  if (data.visitRecent && data.visitRecent.length > 0) {
    const byPerson = {};
    data.visitRecent.forEach(v => {
      const name = v.rep_name || 'Unknown';
      byPerson[name] = (byPerson[name] || 0) + 1;
    });
    ctx += `\n本周拜访汇总：\n`;
    Object.entries(byPerson).forEach(([n, c]) => ctx += `  - ${n}: ${c} 次\n`);
  }

  // 日报提交情况
  if (data.reports) {
    const submitted = data.reports.map(r => (r.name || '').toUpperCase());
    const allSales = ['VEGE', 'CAROL', 'CHRIS', 'CHIN', 'RAYMOND'];
    const missing = allSales.filter(n => !submitted.includes(n));
    ctx += `\n📋 昨日日报：\n`;
    ctx += `  已提交：${submitted.length > 0 ? submitted.join(', ') : '无'}\n`;
    ctx += `  未提交：${missing.length > 0 ? missing.join(', ') : '全部已提交 ✅'}\n`;
  }

  // 任务
  if (data.tasks && data.tasks.length > 0) {
    const overdue = data.tasks.filter(t => t.due_date && new Date(t.due_date) < new Date(today));
    const pending = data.tasks.filter(t => !t.status || t.status !== 'completed');
    ctx += `\n📌 任务状态：${pending.length} 个进行中`;
    if (overdue.length > 0) {
      ctx += `，${overdue.length} 个已逾期⚠️\n`;
      overdue.slice(0, 5).forEach(t => {
        ctx += `  - [逾期] ${t.description || t.title}（${t.assigned_to || '-'}）截止 ${t.due_date}\n`;
      });
    } else {
      ctx += `，无逾期 ✅\n`;
    }
  }

  // 促销
  if (data.promotions && data.promotions.length > 0) {
    const active = data.promotions.filter(p => p.status === 'active' || p.is_active);
    if (active.length > 0) {
      ctx += `\n🎯 进行中促销：${active.length} 个\n`;
      active.slice(0, 3).forEach(p => ctx += `  - ${p.name || p.promo_name}: ${p.start_date} ~ ${p.end_date}\n`);
    }
  }

  return ctx;
}
