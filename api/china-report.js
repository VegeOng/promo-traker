// /api/china-report.js
// Vercel Cron — 每天 UTC 23:00 (MYT 次日 07:00) 跑一次
// 周一(MYT) → 发中国市场周报
// 每月1日(MYT) → 发中国市场月报
// 其他日子 → 静默退出

const CHINA_SHEETS_API = 'https://script.google.com/macros/s/AKfycbzxnGZQSq13c36n0NeVuGPUbxW_duPizD34lvLnxTx2rKDlxziuLtZe82dV4vifyyG5tw/exec';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PRODUCTS = ['香椿干盘面', '青柠干盘面', '冬阴功汤', '香椿杯面', '青柠杯面'];

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // MYT = UTC+8，cron 在 UTC 23:00 跑，MYT 时间是次日 07:00
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 3600 * 1000);
  const mytDay = myt.getUTCDay();    // 0=Sunday, 1=Monday
  const mytDate = myt.getUTCDate();  // 1-31
  const mytMonth = myt.getUTCMonth() + 1;
  const mytYear = myt.getUTCFullYear();

  const isMonday = mytDay === 1;
  const isFirstOfMonth = mytDate === 1;

  if (!isMonday && !isFirstOfMonth) {
    return res.status(200).json({ message: '今天不是发报日，静默退出' });
  }

  try {
    const rows = await fetchChinaData();
    const tasks = [];
    if (isMonday) tasks.push(sendWeeklyReport(rows, myt));
    if (isFirstOfMonth) tasks.push(sendMonthlyReport(rows, mytYear, mytMonth));
    await Promise.all(tasks);
    return res.status(200).json({ message: '龙龙报告已发送 ✅' });
  } catch (err) {
    console.error('China report error:', err);
    await sendTelegram(`⚠️ 龙龙周报生成失败：${err.message}`).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
};

// ── 拉取数据 ──
async function fetchChinaData() {
  const r = await fetch(CHINA_SHEETS_API);
  const json = await r.json();
  return (json.data || []).map(row => {
    const raw = row['日期'];
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d)) return null;
    const shifted = new Date(d.getTime() + 8 * 3600 * 1000);
    const date = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
    const name = (row['客户/达人'] || '').toString().trim();
    const rev = parseFloat(row['总金额']) || 0;
    const channel = (name.includes('微信小店') || name.includes('抖店')) ? '电商平台' : '博主/经销/线下';
    const products = {};
    PRODUCTS.forEach(p => { products[p] = parseFloat(row[p]) || 0; });
    return { date, name, rev, channel, products };
  }).filter(r => r && r.date && !(r.date.getUTCMonth() === 11 && r.date.getUTCFullYear() >= new Date().getUTCFullYear()));
}

// ── 汇总工具 ──
function summarize(rows, start, end) {
  const startTs = start.getTime(), endTs = end.getTime();
  let rev = 0;
  const chan = {}, cust = {}, prod = {};
  PRODUCTS.forEach(p => prod[p] = 0);
  rows.forEach(r => {
    const ts = r.date.getTime();
    if (ts < startTs || ts > endTs) return;
    rev += r.rev;
    chan[r.channel] = (chan[r.channel] || 0) + r.rev;
    cust[r.name] = (cust[r.name] || 0) + r.rev;
    PRODUCTS.forEach(p => prod[p] += r.products[p]);
  });
  const topCust = Object.entries(cust).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { rev, chan, prod, topCust };
}

function fmt(n) { return n.toFixed(2); }
function pctStr(a, b) {
  if (!b) return 'N/A';
  const p = ((a - b) / b * 100).toFixed(1);
  return p >= 0 ? `+${p}% 🚀` : `${p}% ⬇️`;
}

// ── 周报 ──
async function sendWeeklyReport(rows, myt) {
  // 上周 Mon-Sun
  const mytDateOnly = Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate());
  const weekEnd = new Date(mytDateOnly - 86400000);     // 上周日
  const weekStart = new Date(mytDateOnly - 7 * 86400000); // 上周一

  const prevWeekEnd = new Date(weekStart.getTime() - 86400000);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);

  const cur = summarize(rows, weekStart, weekEnd);
  const prev = summarize(rows, prevWeekStart, prevWeekEnd);

  // 数据新鲜度检查 (最新数据须到上周四)
  const latestDate = rows.reduce((max, r) => r.date > max ? r.date : max, new Date(0));
  const expectedThu = new Date(mytDateOnly - 4 * 86400000); // 上周四 (Mon-4=Thu)
  const freshnessWarn = latestDate < expectedThu
    ? `⚠️ *数据更新提醒*：Sheet 最新数据只到 ${latestDate.toISOString().split('T')[0]}，未达上周四（${expectedThu.toISOString().split('T')[0]}），请提醒负责团队补录。\n\n`
    : '';

  const wStart = weekStart.toISOString().split('T')[0];
  const wEnd = weekEnd.toISOString().split('T')[0];

  const topLines = cur.topCust.map((([n, v], i) => `${i + 1}. ${n} ¥${fmt(v)}`)).join('\n');
  const prodLines = PRODUCTS.map(p => `- ${p}：${cur.prod[p]} 份`).join('\n');
  const chanEcom = cur.chan['电商平台'] || 0;
  const chanOther = cur.chan['博主/经销/线下'] || 0;
  const totalPct = cur.rev > 0 ? ((chanEcom / cur.rev) * 100).toFixed(0) : 0;

  // 微信小店实时数据（API 直连，用于核对 Sheet 手填数字）
  const wxSection = await buildWechatSection(weekStart, weekEnd);

  const msg = `🇨🇳 *中国市场周报*\n📅 ${wStart} ~ ${wEnd}\n\n${freshnessWarn}📊 *本周业绩*：¥${fmt(cur.rev)}\n环比上周 ${pctStr(cur.rev, prev.rev)}（上周 ¥${fmt(prev.rev)}）\n\n📈 *渠道分布*\n- 电商平台（抖店+微信小店）：¥${fmt(chanEcom)}（${totalPct}%）\n- 博主/经销/线下：¥${fmt(chanOther)}（${100 - parseInt(totalPct)}%）\n\n📦 *产品销量*\n${prodLines}\n\n🏆 *TOP 贡献*\n${topLines}\n${wxSection}\n—— 龙龙 🇨🇳 中国运营总监`;
  await sendTelegram(msg);
}

// ── 微信小店实时数据段落 ──
async function buildWechatSection(weekStart, weekEnd) {
  try {
    const appid = process.env.WECHAT_APPID, secret = process.env.WECHAT_APPSECRET;
    if (!appid || !secret) return '';
    const tr = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`);
    const tj = await tr.json();
    if (!tj.access_token) return `\n📱 *微信小店(实时API)*：获取失败（${tj.errmsg || 'token error'}）\n`;
    const token = tj.access_token;

    const startTime = Math.floor(weekStart.getTime() / 1000) - 8 * 3600; // MYT/北京时间周一 00:00
    const endTime = Math.floor(weekEnd.getTime() / 1000) - 8 * 3600 + 86400; // 周日 24:00

    const ids = [];
    let nextKey;
    for (let i = 0; i < 20; i++) {
      const body = { page_size: 100, create_time_range: { start_time: startTime, end_time: endTime } };
      if (nextKey) body.next_key = nextKey;
      const r = await fetch(`https://api.weixin.qq.com/channels/ec/order/list/get?access_token=${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.errcode !== 0) return `\n📱 *微信小店(实时API)*：订单拉取失败（${j.errmsg}）\n`;
      ids.push(...(j.order_id_list || []));
      if (!j.has_more) break;
      nextKey = j.next_key;
    }

    const VALID = new Set([20, 21, 30, 100]);
    let rev = 0, cnt = 0;
    for (let i = 0; i < ids.length; i += 10) {
      const batch = await Promise.all(ids.slice(i, i + 10).map(async id => {
        const r = await fetch(`https://api.weixin.qq.com/channels/ec/order/get?access_token=${token}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: id }),
        });
        const j = await r.json();
        return j.errcode === 0 ? j.order : null;
      }));
      batch.filter(Boolean).forEach(o => {
        if (!VALID.has(o.status)) return;
        rev += (o.order_detail?.price_info?.order_price || 0) / 100;
        cnt += 1;
      });
    }
    return `\n📱 *微信小店(实时API核对)*\n本周实付 ¥${rev.toFixed(2)}，共 ${cnt} 单（自动从微信官方接口拉取，可与 Sheet 手填数核对）\n`;
  } catch (e) {
    return `\n📱 *微信小店(实时API)*：拉取异常（${e.message}）\n`;
  }
}

// ── 月报 ──
async function sendMonthlyReport(rows, curYear, curMonth) {
  // 上个月
  const lastMonth = curMonth === 1 ? 12 : curMonth - 1;
  const lastYear = curMonth === 1 ? curYear - 1 : curYear;
  const monthStart = new Date(Date.UTC(lastYear, lastMonth - 1, 1));
  const monthEnd = new Date(Date.UTC(lastYear, lastMonth, 0)); // last day

  const prevMonthStart = new Date(Date.UTC(lastYear, lastMonth - 2, 1));
  const prevMonthEnd = new Date(Date.UTC(lastYear, lastMonth - 1, 0));

  const cur = summarize(rows, monthStart, monthEnd);
  const prev = summarize(rows, prevMonthStart, prevMonthEnd);

  const chanEcom = cur.chan['电商平台'] || 0;
  const chanOther = cur.chan['博主/经销/线下'] || 0;
  const ecomPct = cur.rev > 0 ? ((chanEcom / cur.rev) * 100).toFixed(0) : 0;
  const topLines = cur.topCust.map(([n, v], i) => `${i + 1}. ${n} ¥${fmt(v)}`).join('\n');
  const prodLines = PRODUCTS.map(p => `- ${p}：${cur.prod[p]} 份`).join('\n');

  const msg = `🗓️ *${lastYear}年${lastMonth}月月报*\n\n📊 *月度总业绩*：¥${fmt(cur.rev)}\n环比上月 ${pctStr(cur.rev, prev.rev)}（上月 ¥${fmt(prev.rev)}）\n\n📈 *渠道贡献*\n- 电商平台：¥${fmt(chanEcom)}（${ecomPct}%）\n- 博主/经销/线下：¥${fmt(chanOther)}（${100 - parseInt(ecomPct)}%）\n\n📦 *月度产品销量*\n${prodLines}\n\n🏆 *TOP 达人/渠道*\n${topLines}\n\n💡 *龙龙下月建议*：\n请根据以上数据制定${curMonth}月策略（素食/清真定位，中国市场独立分析）\n\n—— 龙龙 🇨🇳 中国运营总监`;
  await sendTelegram(msg);
}

// ── 发送 Telegram ──
async function sendTelegram(text) {
  const chunks = [];
  let s = text;
  while (s.length > 0) { chunks.push(s.slice(0, 4000)); s = s.slice(4000); }
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: chunk, parse_mode: 'Markdown' }),
    });
  }
}
