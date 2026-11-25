// /api/wan-outlet-report.js
// Vercel Cron Job — 每天早上 8:00 AM (马来西亚时间 = UTC+8)
// Vercel Cron 用 UTC，所以 8:00 AM MYT = 00:00 UTC
// 顺顺(运营总监)汇报 WAN 前一天(MYT)巡店打卡的门店、检查到的商品、本月进度 vs 访店 KPI

const SUPABASE_URL = 'https://wjhgezvrxlhpexocfsea.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqaGdlenZyeGxocGV4b2Nmc2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU4NzgsImV4cCI6MjA5NDA4MTg3OH0.jENcrgEDYDlSRUCqve-T6rxYRJfz-dnZQHnXpPLJ_RE';
const TELEGRAM_TOKEN = process.env.SHUNSHUN_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.SHUNSHUN_TELEGRAM_CHAT_ID;
const AGENT_NAME = 'WAN';

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const querySecret = req.query?.secret;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && querySecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const data = await fetchData();
    const report = buildReport(data);
    await sendToTelegram(report);
    return res.status(200).json({ message: `${AGENT_NAME} 巡店日报（顺顺）已发送 ✅` });
  } catch (error) {
    console.error('WAN outlet report error:', error);
    await sendToTelegram(`vege，顺顺这边 WAN 巡店日报生成失败：${error.message}`).catch(() => {});
    return res.status(500).json({ error: error.message });
  }
};

async function fetchData() {
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayMid = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate()));
  const yesterdayMid = new Date(todayMid.getTime() - 86400000);
  const monthStart = new Date(Date.UTC(yesterdayMid.getUTCFullYear(), yesterdayMid.getUTCMonth(), 1));
  const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const dateLabel = fmt(yesterdayMid);
  const monthStartLabel = fmt(monthStart);

  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  async function query(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
    const json = r.ok ? await r.json() : [];
    return Array.isArray(json) ? json : [];
  }

  const [checks, monthChecks, members] = await Promise.all([
    query(`outlet_stock_checks?agent_name=eq.${encodeURIComponent(AGENT_NAME)}&check_date=eq.${dateLabel}&select=outlet_name,product_name,lot_number,expiry_date,quantity,need_return,return_quantity&order=outlet_name.asc`),
    query(`outlet_stock_checks?agent_name=eq.${encodeURIComponent(AGENT_NAME)}&check_date=gte.${monthStartLabel}&check_date=lte.${dateLabel}&select=outlet_id`),
    query(`members?name=eq.${encodeURIComponent(AGENT_NAME)}&select=outlet_visit_kpi`),
  ]);

  const mtdVisited = new Set(monthChecks.map(c => c.outlet_id)).size;
  const kpi = members[0]?.outlet_visit_kpi || 0;

  return { checks, dateLabel, mtdVisited, kpi };
}

function buildReport({ checks, dateLabel, mtdVisited, kpi }) {
  const today = new Date();
  function daysLeft(d) {
    if (!d) return null;
    const dt = new Date(d);
    return Math.ceil((dt - today) / 86400000);
  }

  const kpiLine = kpi > 0
    ? `本月累计访店 *${mtdVisited}* / 目标 *${kpi}*（${Math.round(mtdVisited / kpi * 100)}%）`
    : `本月累计访店 *${mtdVisited}* 间（未设定目标）`;

  if (checks.length === 0) {
    return `vege，顺顺跟你汇报一下：WAN 昨天（${dateLabel}）*没有打卡任何门店*，麻烦跟进一下原因。\n\n${kpiLine}`;
  }

  const byOutlet = {};
  checks.forEach(c => {
    if (!byOutlet[c.outlet_name]) byOutlet[c.outlet_name] = [];
    byOutlet[c.outlet_name].push(c);
  });

  const outletNames = Object.keys(byOutlet);
  const totalItems = checks.reduce((s, c) => s + (c.quantity || 0), 0);
  const nearExpiry = checks.filter(c => c.expiry_date && daysLeft(c.expiry_date) <= 90);
  const needReturn = checks.filter(c => c.need_return);

  let msg = `vege，顺顺跟你汇报 WAN 昨天（${dateLabel}）的巡店情况：\n\n`;
  msg += `打卡了 *${outletNames.length}* 间门店，共检查 *${totalItems}* 件商品：\n`;
  outletNames.forEach(name => {
    const items = byOutlet[name];
    const qty = items.reduce((s, c) => s + (c.quantity || 0), 0);
    msg += `- ${name}（${items.length} 项 / ${qty} 件）\n`;
  });

  msg += `\n📊 ${kpiLine}\n`;

  if (nearExpiry.length > 0) {
    msg += `\n🔴 *过期预警（≤90天，共 ${nearExpiry.length} 项）：*\n`;
    nearExpiry.slice(0, 10).forEach(c => {
      const d = daysLeft(c.expiry_date);
      msg += `- ${c.outlet_name} — ${c.product_name || '—'}（${c.expiry_date}，${d <= 0 ? '已过期 ' + Math.abs(d) + ' 天' : d + ' 天后到期'}）\n`;
    });
    if (nearExpiry.length > 10) msg += `…还有 ${nearExpiry.length - 10} 项\n`;
  }

  if (needReturn.length > 0) {
    msg += `\n↩️ *需要退货（共 ${needReturn.length} 项）：*\n`;
    needReturn.slice(0, 10).forEach(c => {
      msg += `- ${c.outlet_name} — ${c.product_name || '—'}（${c.return_quantity || 0} 件）\n`;
    });
    if (needReturn.length > 10) msg += `…还有 ${needReturn.length - 10} 项\n`;
  }

  return msg;
}

async function sendToTelegram(text) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }
  if (!TELEGRAM_CHAT_ID) return;
  for (const chunk of chunks) {
    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: chunk, parse_mode: 'Markdown' }),
    });
    const tgJson = await tgRes.json();
    console.log(`Telegram chat_id=${TELEGRAM_CHAT_ID} ok=${tgJson.ok} desc=${tgJson.description}`);
  }
}
