// /api/daily-brief.js
// Vercel Cron Job — 每天早上 8:30 AM (马来西亚时间 = UTC+8)
// Vercel Cron 用 UTC，所以 8:30 AM MYT = 00:30 UTC

const SUPABASE_URL = 'https://wjhgezvrxlhpexocfsea.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqaGdlenZyeGxocGV4b2Nmc2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU4NzgsImV4cCI6MjA5NDA4MTg3OH0.jENcrgEDYDlSRUCqve-T6rxYRJfz-dnZQHnXpPLJ_RE';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  // 安全验证：只接受 Vercel Cron 或带正确 secret 的请求
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 周六周日不发报告
  const now = new Date();
  const mytime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
  const dayOfWeek = mytime.getUTCDay(); // 0=Sunday, 6=Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return res.status(200).json({ message: '周末不发报告' });
  }

  try {
    // 1. 拉取 Supabase 数据
    const data = await fetchAllData();

    // 2. 生成萱萱简报
    const brief = await generateBrief(data);

    // 3. 发送到 Telegram
    await sendToTelegram(brief);

    return res.status(200).json({ message: '简报已发送 ✅' });
  } catch (error) {
    console.error('Daily brief error:', error);
    await sendToTelegram(`⚠️ 今日简报生成失败：${error.message}`).catch(() => {});
    return res.status(500).json({ error: error.message });
  }
}

// ── 拉取数据 ──
async function fetchAllData() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now - 86400000).toISOString().split('T')[0];
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const weekAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0];

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  async function query(table, params = '') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`, { headers });
      if (!r.ok) return [];
      return await r.json();
    } catch { return []; }
  }

  const [orders, targets, visits, reports, tasks, products] = await Promise.all([
    query('sales_orders', `created_at=gte.${monthStart}&order=created_at.desc&limit=200`),
    query('sales_targets', `limit=20`),
    query('visit_records', `visit_date=gte.${yesterday}&visit_date=lte.${today}&limit=100`),
    query('daily_reports', `date=gte.${yesterday}&limit=20`),
    query('tasks', `limit=50`),
    query('products', `limit=50`),
  ]);

  return { orders, targets, visits, reports, tasks, products, today, yesterday, monthStart };
}

// ── 生成简报 ──
async function generateBrief(data) {
  const { orders, targets, visits, reports, tasks, today } = data;

  // 汇总销售数据
  const totalSales = orders.reduce((s, o) => s + (parseFloat(o.total_amount) || parseFloat(o.amount) || 0), 0);

  const bySalesperson = {};
  orders.forEach(o => {
    const name = o.rep_name || o.salesperson_name || o.name || 'Unknown';
    bySalesperson[name] = (bySalesperson[name] || 0) + (parseFloat(o.total_amount) || parseFloat(o.amount) || 0);
  });

  const byVisit = {};
  visits.forEach(v => {
    const name = v.rep_name || 'Unknown';
    byVisit[name] = (byVisit[name] || 0) + 1;
  });

  const submittedReports = reports.map(r => r.name || r.rep_name || '-');
  const allSales = ['VEGE', 'CAROL', 'CHRIS', 'CHIN', 'RAYMOND'];
  const notSubmitted = allSales.filter(n => !submittedReports.some(s => s.toUpperCase() === n));

  const overdueTask = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date(today));

  const dataContext = `
今天日期：${today}
本月销售总额：RM ${totalSales.toFixed(2)}
月目标：RM 500,000
YTD：RM 1,915,395（截至6月）年度目标 RM 6,000,000

各销售员本月业绩：
${Object.entries(bySalesperson).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`- ${n}: RM ${v.toFixed(2)}`).join('\n') || '暂无数据'}

个人月目标：Vege RM200K / Carol RM100K / Chris RM100K / Chin RM50K / Raymond RM50K

昨日拜访记录：
${Object.entries(byVisit).map(([n,c])=>`- ${n}: ${c} 家`).join('\n') || '暂无拜访记录'}

已提交日报：${submittedReports.join(', ') || '无'}
未提交日报：${notSubmitted.join(', ') || '全部已提交 ✅'}

逾期任务（${overdueTask.length} 个）：
${overdueTask.slice(0,5).map(t=>`- ${t.description || t.title}（${t.assigned_to || '-'}）`).join('\n') || '无逾期任务 ✅'}

7-Eleven 特别注意：YTD 结构性亏损 RM 63,868，每卖一杯 Shakemee 亏一杯。
`;

  const systemPrompt = `你是萱萱，MamaVege 的 CEO助理。每天早上产出简洁有力的 HQ 日报。
回答语言：中英夹杂。格式用 Telegram Markdown（*粗体* _斜体_）。
不要太长，重点突出，HQ 1分钟内能读完。`;

  const userPrompt = `根据以下数据，产出今天的 HQ 日报：\n${dataContext}

日报格式（固定）：
1. 📊 昨日业绩 & 本月进度
2. 👣 地面执行（拜访情况）
3. ⚠️ 需要关注的事（财务警报/逾期任务/未提交报告）
4. ✅ 今天 HQ 必做 3 件事`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.error?.message || 'Claude API error');
  }

  const result = await r.json();
  return result.content.map(b => b.text).join('\n');
}

// ── 发送 Telegram ──
async function sendToTelegram(text) {
  // Telegram 每条消息最多 4096 字，超过就分段
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }

  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: 'Markdown',
      }),
    });
  }
}
