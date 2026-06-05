// ai-team-data.js
// Supabase 实时数据读取模块（已按实际列名修正）

const SUPABASE_URL = 'https://wjhgezvrxlhpexocfsea.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqaGdlenZyeGxocGV4b2Nmc2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU4NzgsImV4cCI6MjA5NDA4MTg3OH0.jENcrgEDYDlSRUCqve-T6rxYRJfz-dnZQHnXpPLJ_RE';

// 通用查询
async function supabaseQuery(table, params = '') {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Supabase ${table} error ${response.status}:`, errorText);
      return [];  // 返回空数组而不是 throw，避免整体崩溃
    }
    return await response.json();
  } catch (error) {
    console.warn(`Error fetching ${table}:`, error.message);
    return [];
  }
}

// 日期范围
function getDateRanges() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const yesterday = new Date(now - 86400000).toISOString().split('T')[0];
  const weekAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
  return { today, yesterday, monthStart, weekAgo, lastMonthStart, lastMonthEnd };
}

// ─────────────────────────────────────────────
// 销售数据（萱萱 / 笑笑）
// ─────────────────────────────────────────────
export async function fetchSalesData() {
  const { monthStart, yesterday, today } = getDateRanges();

  const [orders, targets, visitYesterday, reports] = await Promise.all([
    // 本月销售订单
    supabaseQuery('sales_orders', `order=created_at.desc&created_at=gte.${monthStart}&limit=200`),
    // 销售目标
    supabaseQuery('sales_targets', `limit=50`),
    // 昨日拜访（visit_records 实际列名：rep_name, visit_date）
    supabaseQuery('visit_records', `visit_date=gte.${yesterday}&visit_date=lte.${today}&limit=100`),
    // 每日报告（daily_reports 实际列名：name, date）
    supabaseQuery('daily_reports', `date=gte.${yesterday}&limit=20`),
  ]);

  return {
    orders: orders || [],
    targets: targets || [],
    visitYesterday: visitYesterday || [],
    reports: reports || [],
    dateRanges: getDateRanges(),
  };
}

// ─────────────────────────────────────────────
// 财务数据（钱钱）
// ─────────────────────────────────────────────
export async function fetchFinanceData() {
  const { monthStart } = getDateRanges();

  const [orders, profitConfig] = await Promise.all([
    supabaseQuery('sales_orders', `created_at=gte.${monthStart}&limit=500`),
    supabaseQuery('profit_config', `limit=50`),
  ]);

  return {
    orders: orders || [],
    profitConfig: profitConfig || [],
    dateRanges: getDateRanges(),
  };
}

// ─────────────────────────────────────────────
// 运营数据（顺顺）
// ─────────────────────────────────────────────
export async function fetchOpsData() {
  const { weekAgo } = getDateRanges();

  const [visitRecent, stockChecks, tasks, products] = await Promise.all([
    // 最近7天拜访（实际列名：rep_name, visit_date, customer_name）
    supabaseQuery('visit_records', `visit_date=gte.${weekAgo}&order=visit_date.desc&limit=200`),
    // 库存检查
    supabaseQuery('outlet_stock_checks', `order=created_at.desc&limit=100`),
    // 任务（实际列名：task_id, description, assigned_to）
    supabaseQuery('tasks', `limit=50`),
    // 产品列表（实际列名：id, code, created_at — 无 expiry_date）
    supabaseQuery('products', `limit=50`),
  ]);

  return {
    visitRecent: visitRecent || [],
    stockChecks: stockChecks || [],
    tasks: tasks || [],
    products: products || [],
    dateRanges: getDateRanges(),
  };
}

// ─────────────────────────────────────────────
// 市场数据（冲冲）
// ─────────────────────────────────────────────
export async function fetchMarketingData() {
  const { monthStart } = getDateRanges();

  const [promotions, promoActivities] = await Promise.all([
    supabaseQuery('promotions', `limit=30&order=created_at.desc`),
    supabaseQuery('promo_activities', `created_at=gte.${monthStart}&limit=100`),
  ]);

  return {
    promotions: promotions || [],
    promoActivities: promoActivities || [],
    dateRanges: getDateRanges(),
  };
}

// ─────────────────────────────────────────────
// 根据角色返回数据
// ─────────────────────────────────────────────
export async function fetchDataForRole(roleId) {
  if (roleId === 'xuanxuan') {
    const [salesData, opsData] = await Promise.all([
      fetchSalesData(),
      fetchOpsData(),
    ]);
    return { ...salesData, ...opsData };
  }

  const loaders = {
    xiaoxiao:  fetchSalesData,
    qianqian:  fetchFinanceData,
    chongchong: fetchMarketingData,
    shunshun:  fetchOpsData,
    diandian:  fetchSalesData,
    longlong:  fetchSalesData,
  };

  const loader = loaders[roleId] || fetchSalesData;
  return await loader();
}

// ─────────────────────────────────────────────
// 格式化数据给 AI 读
// ─────────────────────────────────────────────
export function formatDataAsContext(data) {
  const { today, monthStart } = getDateRanges();
  let context = `\n\n【实时数据 — ${today}】\n`;

  // 销售订单
  if (data.orders && data.orders.length > 0) {
    const totalSales = data.orders.reduce((sum, o) => {
      return sum + (parseFloat(o.total_amount) || parseFloat(o.amount) || 0);
    }, 0);
    context += `\n本月销售订单：${data.orders.length} 笔，总金额 RM ${totalSales.toFixed(2)}\n`;

    // 按销售员汇总
    const bySalesperson = {};
    data.orders.forEach(o => {
      const name = o.rep_name || o.salesperson_name || o.salesperson || o.name || 'Unknown';
      bySalesperson[name] = (bySalesperson[name] || 0) +
        (parseFloat(o.total_amount) || parseFloat(o.amount) || 0);
    });
    if (Object.keys(bySalesperson).length > 0) {
      context += `\n各销售员本月业绩：\n`;
      Object.entries(bySalesperson)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, amt]) => {
          context += `  - ${name}: RM ${amt.toFixed(2)}\n`;
        });
    }
  } else {
    context += `\n本月销售订单：暂无数据\n`;
  }

  // 销售目标
  if (data.targets && data.targets.length > 0) {
    context += `\n销售目标：\n`;
    data.targets.slice(0, 10).forEach(t => {
      const name = t.rep_name || t.name || t.salesperson || '-';
      const target = t.target_amount || t.monthly_target || t.target || '-';
      context += `  - ${name}: RM ${target}\n`;
    });
  }

  // 昨日拜访记录（实际列名：rep_name, visit_date, customer_name）
  if (data.visitYesterday && data.visitYesterday.length > 0) {
    const byPerson = {};
    data.visitYesterday.forEach(v => {
      const name = v.rep_name || v.salesperson || 'Unknown';
      byPerson[name] = (byPerson[name] || 0) + 1;
    });
    context += `\n昨日拜访记录：\n`;
    Object.entries(byPerson).forEach(([name, count]) => {
      context += `  - ${name}: ${count} 家\n`;
    });
  } else {
    context += `\n昨日拜访记录：暂无\n`;
  }

  // 本周拜访
  if (data.visitRecent && data.visitRecent.length > 0) {
    const byPerson = {};
    data.visitRecent.forEach(v => {
      const name = v.rep_name || v.salesperson || 'Unknown';
      byPerson[name] = (byPerson[name] || 0) + 1;
    });
    context += `\n本周拜访记录：\n`;
    Object.entries(byPerson).forEach(([name, count]) => {
      context += `  - ${name}: ${count} 次\n`;
    });
  }

  // 每日报告（实际列名：name, date）
  if (data.reports && data.reports.length > 0) {
    const submitters = data.reports.map(r => r.name || r.rep_name || '-');
    context += `\n已提交日报：${submitters.join(', ')}\n`;
  } else {
    context += `\n已提交日报：昨日暂无记录\n`;
  }

  // 任务（实际列名：task_id, description, assigned_to）
  if (data.tasks && data.tasks.length > 0) {
    context += `\n待办任务（${data.tasks.length} 个）：\n`;
    data.tasks.slice(0, 8).forEach(t => {
      const desc = t.description || t.title || t.task_name || '-';
      const assignee = t.assigned_to || t.assignee || '-';
      const due = t.due_date ? `，截止 ${t.due_date}` : '';
      const status = t.status || t.completed ? `[${t.status || '进行中'}]` : '[进行中]';
      context += `  - ${status} ${desc}（${assignee}）${due}\n`;
    });
  }

  // 产品列表（实际列名：id, code）
  if (data.products && data.products.length > 0) {
    const codes = data.products.map(p => p.code || p.sku_code || p.name).filter(Boolean);
    context += `\n产品列表：${codes.join(', ')}\n`;
    context += `注意：products 表目前没有 expiry_date 列，无法做过期预警。\n`;
  }

  // 促销
  if (data.promotions && data.promotions.length > 0) {
    context += `\n促销活动（${data.promotions.length} 个）：\n`;
    data.promotions.slice(0, 5).forEach(p => {
      const name = p.name || p.promo_name || p.title || '-';
      const status = p.status || p.is_active ? '进行中' : '-';
      context += `  - ${name}（${status}）\n`;
    });
  }

  return context;
}
