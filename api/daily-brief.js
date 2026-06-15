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
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = myt.toISOString().split('T')[0];
  const yesterday = new Date(myt - 86400000).toISOString().split('T')[0];
  const year = myt.getFullYear();
  const month = myt.getMonth() + 1;
  const weekAgo = new Date(myt - 7 * 86400000).toISOString().split('T')[0];

  const sbHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };

  async function query(table, params = '') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`, { headers: sbHeaders });
      if (!r.ok) return [];
      return await r.json();
    } catch { return []; }
  }

  // Google Sheets sales data
  async function fetchSheets() {
    try {
      const r = await fetch('https://script.google.com/macros/s/AKfycbwxt23ZB0od7EeBSNvjurKTbkDcM7HLgrWhuoqHc3meKWmhbB0XQzfOdB-X2Pj5O_MY/exec');
      const json = await r.json();
      return json.data || [];
    } catch { return []; }
  }

  // Google Calendar
  async function fetchCalendar() {
    try {
      const calId = encodeURIComponent('ohy4896@gmail.com');
      // myt.getUTC*() 取出的是马来西亚当地的年月日；MYT 午夜 = UTC-8小时
      const y = myt.getUTCFullYear(), mo = myt.getUTCMonth(), d = myt.getUTCDate();
      const timeMin = new Date(Date.UTC(y, mo, d) - 8 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(Date.UTC(y, mo, d + 4) - 8 * 60 * 60 * 1000).toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?key=${process.env.GOOGLE_CALENDAR_API_KEY}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10`;
      const r = await fetch(url);
      const data = await r.json();
      return (data.items || []).map(e => ({
        title: e.summary || '(无标题)',
        start: e.start?.dateTime || e.start?.date,
        allDay: !!e.start?.date && !e.start?.dateTime,
        location: e.location || '',
      }));
    } catch { return []; }
  }

  const [allOrders, visits, reports, tasks, calendarEvents, promotions] = await Promise.all([
    fetchSheets(),
    query('visit_records', `visit_date=gte.${yesterday}&visit_date=lte.${today}&limit=100`),
    query('daily_reports', `date=gte.${yesterday}&limit=20`),
    query('tasks', `limit=50`),
    fetchCalendar(),
    query('promotions', `date=gte.${today}&order=date.asc&limit=50`),
  ]);

  const thisMonthOrders = allOrders.filter(r => parseInt(r['YEAR']) === year && parseInt(r['MONTH']) === month);
  const totalSalesThisMonth = thisMonthOrders.reduce((s, r) => s + (parseFloat(r['TOTAL (RM)']) || 0), 0);

  return { allOrders, thisMonthOrders, totalSalesThisMonth, visits, reports, tasks, calendarEvents, promotions, today, yesterday, year, month };
}

// ── 生成简报 ──
async function generateBrief(data) {
  const { thisMonthOrders, totalSalesThisMonth, visits, reports, tasks, calendarEvents, promotions, today, year, month } = data;

  // 各销售员本月业绩
  const targets = { VEGE: 200000, CAROL: 100000, CHRIS: 100000, CHIN: 50000, RAYMOND: 50000 };
  const bySP = {};
  thisMonthOrders.forEach(o => {
    const name = (o['SALES PERSON'] || 'Unknown').toUpperCase();
    bySP[name] = (bySP[name] || 0) + (parseFloat(o['TOTAL (RM)']) || 0);
  });

  const spSummary = Object.entries(targets).map(([name, target]) => {
    const actual = bySP[name] || 0;
    const pct = ((actual / target) * 100).toFixed(1);
    return `- ${name}: RM ${actual.toFixed(2)} / 目标 RM ${target.toLocaleString()} (${pct}%)`;
  }).join('\n');

  // 拜访
  const byVisit = {};
  visits.forEach(v => {
    const name = (v.rep_name || 'Unknown').toUpperCase();
    byVisit[name] = (byVisit[name] || 0) + 1;
  });
  const visitSummary = ['VEGE','CAROL','CHRIS','CHIN','RAYMOND'].map(n =>
    `- ${n}: ${byVisit[n] || 0} 家${!byVisit[n] ? ' ⚠️ 零拜访' : ''}`
  ).join('\n');

  // 日报
  const submitted = reports.map(r => (r.name || '').toUpperCase());
  const notSubmitted = ['VEGE','CAROL','CHRIS','CHIN','RAYMOND'].filter(n => !submitted.includes(n));

  // 逾期任务
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date(today));

  // 日历
  const calSummary = calendarEvents && calendarEvents.length > 0
    ? calendarEvents.map(e => {
        const start = e.start ? new Date(e.start) : null;
        const dateStr = start ? start.toLocaleDateString('zh-MY', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'Asia/Kuala_Lumpur' }) : '';
        const timeStr = e.allDay ? '全天' : start ? start.toLocaleTimeString('zh-MY', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }) : '';
        return `- ${dateStr} ${timeStr}：${e.title}${e.location ? ' 📍' + e.location : ''}`;
      }).join('\n')
    : '暂无行程';

  // 促销日历（未来30天即将开始的促销）
  const upcomingPromos = (promotions || []).filter(p => {
    const d = new Date(p.date);
    const diffDays = (d - new Date(today)) / 86400000;
    return diffDays >= 0 && diffDays <= 30;
  });
  const promoSummary = upcomingPromos.length > 0
    ? upcomingPromos.map(p => `- ${p.date}：${p.store || ''} - ${p.activity_name}${p.products ? '（' + p.products + '）' : ''}`).join('\n')
    : '近30天无新促销活动开始';

  const dataContext = `
今天日期：${today}（${year}年${month}月）
本月销售总额：RM ${totalSalesThisMonth.toFixed(2)} / 月目标 RM 500,000（${((totalSalesThisMonth/500000)*100).toFixed(1)}%）
YTD 年度目标：RM 6,000,000

各销售员本月业绩 vs 目标：
${spSummary}

昨日拜访记录：
${visitSummary}

日报提交：
已提交：${submitted.join(', ') || '无'}
未提交：${notSubmitted.join(', ') || '全部已提交 ✅'}

逾期任务（${overdue.length} 个）：
${overdue.slice(0,5).map(t=>`- ${t.description}（${t.assigned_to}）截止 ${t.due_date}`).join('\n') || '无逾期任务 ✅'}

📅 未来3天行程：
${calSummary}

🎯 近期促销日历（未来30天）：
${promoSummary}

⚠️ 7-Eleven：YTD 结构性亏损，每卖一杯亏一杯，不要建议提高销量。

📌 持续提醒（柔佛业务员招聘）：Chin已离职，柔佛区目前无人接手，仍需HQ招聘新业务员。请在"今天 HQ 必做"或简报末尾提醒HQ此事，直到HQ告知已招聘到位为止。
`;

  const systemPrompt = `你是萱萱，MamaVege 的 CEO助理。每天早上产出简洁有力的 HQ 日报。
回答语言：中英夹杂。格式用 Telegram Markdown（*粗体* _斜体_）。
不要太长，重点突出，HQ 1分钟内能读完。`;

  const userPrompt = `根据以下数据，产出今天的 HQ 日报：\n${dataContext}

日报格式（固定）：
1. 📊 本月业绩进度
2. 👣 昨日地面执行（拜访情况）
3. 📅 今天及未来3天重要行程
4. 🎯 近期促销日历（未来30天即将开始的促销活动，按日期列出，没有就说"近期无新促销"）
5. ⚠️ 需要关注的事（逾期任务/未提交报告）
6. ✅ 今天 HQ 必做 3 件事`;

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
