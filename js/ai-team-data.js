// ai-team-data.js
// Supabase 实时数据读取模块
// 每次 AI 总监回答前，自动拉取相关数据作为上下文

const SUPABASE_URL = 'https://wjhgezvrxlhpexocfsea.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqaGdlenZyeGxocGV4b2Nmc2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU4NzgsImV4cCI6MjA5NDA4MTg3OH0.jENcrgEDYDlSRUCqve-T6rxYRJfz-dnZQHnXpPLJ_RE';

// 通用 Supabase 查询函数
async function supabaseQuery(table, params = '') {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?${params}`,
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
      throw new Error(`Supabase error ${response.status}: ${errorText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${table}:`, error);
    return null;
  }
}

// 获取今天和本月的日期范围
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
// 各角色数据获取函数
// ─────────────────────────────────────────────

// 萱萱 / 笑笑 — 销售数据
export async function fetchSalesData() {
  const { monthStart, yesterday, today } = getDateRanges();

  const [orders, targets, visitYesterday, reports] = await Promise.all([
    // 本月所有订单
    supabaseQuery('sales_orders', `order=created_at.desc&created_at=gte.${monthStart}&limit=200`),
    // 销售目标
    supabaseQuery('sales_targets', `limit=50`),
    // 昨日拜访记录
    supabaseQuery('visit_records', `visit_date=gte.${yesterday}&visit_date=lte.${today}&limit=100`),
    // 未提交报告检查
    supabaseQuery('daily_reports', `report_date=gte.${yesterday}&limit=20`),
  ]);

  return {
    orders: orders || [],
    targets: targets || [],
    visitYesterday: visitYesterday || [],
    reports: reports || [],
    dateRanges: getDateRanges(),
  };
}

// 钱钱 — 财务数据
export async function fetchFinanceData() {
  const { monthStart, lastMonthStart, lastMonthEnd } = getDateRanges();

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

// 顺顺 — 运营数据
export async function fetchOpsData() {
  const { today, monthStart, weekAgo } = getDateRanges();

  // 计算90天后日期用于过期预警
  const in180Days = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];

  const [visitRecent, stockChecks, tasks, products] = await Promise.all([
    // 最近7天拜访记录
    supabaseQuery('visit_records', `visit_date=gte.${weekAgo}&order=visit_date.desc&limit=200`),
    // 库存检查
    supabaseQuery('outlet_stock_checks', `order=check_date.desc&limit=100`),
    // 未完成任务
    supabaseQuery('tasks', `status=neq.completed&order=due_date.asc&limit=50`),
    // 快到期产品（180天内）
    supabaseQuery('products', `expiry_date=lte.${in180Days}&expiry_date=gte.${today}&order=expiry_date.asc&limit=50`),
  ]);

  return {
    visitRecent: visitRecent || [],
    stockChecks: stockChecks || [],
    tasks: tasks || [],
    expiringProducts: products || [],
    dateRanges: getDateRanges(),
  };
}

// 冲冲 — 市场数据
export async function fetchMarketingData() {
  const { monthStart } = getDateRanges();

  const [promotions, promoActivities] = await Promise.all([
    supabaseQuery('promotions', `limit=30&order=start_date.desc`),
    supabaseQuery('promo_activities', `created_at=gte.${monthStart}&limit=100`),
  ]);

  return {
    promotions: promotions || [],
    promoActivities: promoActivities || [],
    dateRanges: getDateRanges(),
  };
}

// 根据角色 ID 返回对应数据
export async function fetchDataForRole(roleId) {
  const loaders = {
    xuanxuan: fetchSalesData,     // 萱萱需要销售+运营全面数据
    xiaoxiao: fetchSalesData,     // 笑笑
    qianqian: fetchFinanceData,   // 钱钱
    chongchong: fetchMarketingData, // 冲冲
    shunshun: fetchOpsData,       // 顺顺
    diandian: fetchSalesData,     // 电电（目前用销售数据）
    longlong: fetchSalesData,     // 龙龙（目前用销售数据）
  };

  // 萱萱需要最多数据（日报需要全局视角）
  if (roleId === 'xuanxuan') {
    const [salesData, opsData] = await Promise.all([
      fetchSalesData(),
      fetchOpsData(),
    ]);
    return { ...salesData, ...opsData };
  }

  const loader = loaders[roleId] || fetchSalesData;
  return await loader();
}

// 将数据格式化成 AI 可读的文字上下文
export function formatDataAsContext(data) {
  const { today, monthStart } = getDateRanges();
  let context = `\n\n【实时数据 - ${today}】\n`;

  if (data.orders && data.orders.length > 0) {
    // 统计本月总销售额
    const totalSales = data.orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    context += `\n本月销售订单：共 ${data.orders.length} 笔，总金额 RM ${totalSales.toFixed(2)}\n`;

    // 按销售员统计
    const bySalesperson = {};
    data.orders.forEach(o => {
      const name = o.salesperson_name || o.salesperson_id || 'Unknown';
      bySalesperson[name] = (bySalesperson[name] || 0) + (parseFloat(o.total_amount) || 0);
    });
    context += `\n各销售员本月业绩：\n`;
    Object.entries(bySalesperson)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, amount]) => {
        context += `  - ${name}: RM ${amount.toFixed(2)}\n`;
      });

    // 重点 SKU 追踪
    const skuSales = {};
    data.orders.forEach(o => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach(item => {
          const sku = item.sku_code || item.product_code;
          if (['KPM', 'CLM', 'SMTS', 'SMCL'].includes(sku)) {
            skuSales[sku] = (skuSales[sku] || 0) + (parseFloat(item.total) || 0);
          }
        });
      }
    });
    if (Object.keys(skuSales).length > 0) {
      context += `\n重点 SKU 本月销售：\n`;
      ['KPM', 'CLM', 'SMTS', 'SMCL'].forEach(sku => {
        context += `  - ${sku}: RM ${(skuSales[sku] || 0).toFixed(2)}\n`;
      });
    }
  } else {
    context += `\n本月销售订单：暂无数据\n`;
  }

  if (data.visitYesterday && data.visitYesterday.length > 0) {
    const byPerson = {};
    data.visitYesterday.forEach(v => {
      const name = v.salesperson_name || v.member_id || 'Unknown';
      byPerson[name] = (byPerson[name] || 0) + 1;
    });
    context += `\n昨日拜访记录：\n`;
    Object.entries(byPerson).forEach(([name, count]) => {
      context += `  - ${name}: ${count} 家\n`;
    });
  } else {
    context += `\n昨日拜访记录：暂无数据\n`;
  }

  if (data.expiringProducts && data.expiringProducts.length > 0) {
    context += `\n⚠️ 产品过期预警：\n`;
    const todayDate = new Date(today);
    data.expiringProducts.slice(0, 10).forEach(p => {
      const expiry = new Date(p.expiry_date);
      const daysLeft = Math.floor((expiry - todayDate) / 86400000);
      const emoji = daysLeft <= 30 ? '🔴' : daysLeft <= 90 ? '🟠' : '🟡';
      context += `  ${emoji} ${p.product_name || p.sku_code}: ${daysLeft}天后到期 (${p.expiry_date})\n`;
    });
  }

  if (data.tasks && data.tasks.length > 0) {
    const overdue = data.tasks.filter(t => {
      if (!t.due_date) return false;
      return new Date(t.due_date) < new Date(today);
    });
    if (overdue.length > 0) {
      context += `\n⚠️ 逾期任务 (${overdue.length} 个)：\n`;
      overdue.slice(0, 5).forEach(t => {
        context += `  - ${t.title || t.task_name}: 截止 ${t.due_date}，负责人 ${t.assignee || '-'}\n`;
      });
    }
  }

  if (data.promotions && data.promotions.length > 0) {
    const active = data.promotions.filter(p => p.status === 'active' || p.is_active);
    context += `\n当前促销活动：${active.length} 个进行中\n`;
    active.slice(0, 3).forEach(p => {
      context += `  - ${p.name || p.promo_name}: ${p.start_date} ~ ${p.end_date}\n`;
    });
  }

  return context;
}
