// /api/weekly-ecom-report.js
// Vercel Cron Job — 每周一早上 7:00 AM (马来西亚时间 = UTC+8)
// Vercel Cron 用 UTC，所以周一 7:00 AM MYT = 周日 23:00 UTC -> "0 23 * * 0"

const ECOM_API = 'https://script.google.com/macros/s/AKfycbyqZ8w-aNLDSjFvySTXL_zVYQty0U7-HS-6Nw2EWz5ulqexPNoc1-q_V3WL0h1EEDXz/exec';
const TELEGRAM_TOKEN = process.env.DIANDIAN_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.DIANDIAN_TELEGRAM_CHAT_ID;
const TELEGRAM_CHAT_ID_2 = process.env.TELEGRAM_CHAT_ID_2;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SHEET_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function sheetNameOf(date) {
  const y = date.getFullYear() % 100;
  return SHEET_MONTH_NAMES[date.getMonth()] + ' ' + (y < 10 ? '0' + y : y);
}

module.exports = async function handler(req, res) {
  // 安全验证：只接受 Vercel Cron 或带正确 secret 的请求
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { thisWeek, lastWeek } = await fetchTwoWeeks();
    const brief = await generateBrief(thisWeek, lastWeek);
    await sendToTelegram(brief);
    return res.status(200).json({ message: '电电周报已发送 ✅' });
  } catch (error) {
    console.error('Weekly ecom report error:', error);
    await sendToTelegram(`⚠️ 电电周报生成失败：${error.message}`).catch(() => {});
    return res.status(500).json({ error: error.message });
  }
};

// ── 拉取最近两周的电商数据 ──
async function fetchTwoWeeks() {
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
  const todayMid = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate()));

  // 本周报告覆盖：上周一 ~ 上周日（共7天），即昨天往前数7天
  const weekEnd = new Date(todayMid.getTime() - 1 * 86400000);   // 昨天（周日）
  const weekStart = new Date(todayMid.getTime() - 7 * 86400000); // 上周一
  const prevWeekEnd = new Date(weekStart.getTime() - 1 * 86400000);   // 上上周日
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000); // 上上周一

  // 需要的所有 sheet（可能跨月）
  const sheetNames = new Set([
    sheetNameOf(prevWeekStart), sheetNameOf(prevWeekEnd),
    sheetNameOf(weekStart), sheetNameOf(weekEnd),
  ]);

  const allRecords = [];
  for (const sheetName of sheetNames) {
    try {
      const r = await fetch(`${ECOM_API}?sheet=${encodeURIComponent(sheetName)}`);
      const json = await r.json();
      if (json.error) continue;
      (json.data || []).forEach(rec => allRecords.push(rec));
    } catch { /* ignore missing sheets */ }
  }

  const parsed = allRecords.map(r => {
    const d = new Date(r.date);
    const adj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const dayUTC = new Date(Date.UTC(adj.getUTCFullYear(), adj.getUTCMonth(), adj.getUTCDate()));
    return { ...r, _day: dayUTC };
  });

  const inRange = (day, start, end) => day >= start && day <= end;
  const thisWeek = parsed.filter(r => inRange(r._day, weekStart, weekEnd));
  const lastWeek = parsed.filter(r => inRange(r._day, prevWeekStart, prevWeekEnd));

  return {
    thisWeek: summarize(thisWeek, weekStart, weekEnd),
    lastWeek: summarize(lastWeek, prevWeekStart, prevWeekEnd),
  };
}

function summarize(records, start, end) {
  const totals = {
    shopee: { sales: 0, ads: 0 },
    lazada: { sales: 0, ads: 0 },
    tiktok: { sales: 0, ads: 0 },
    website: { sales: 0 },
    other: { sales: 0 },
  };
  records.forEach(r => {
    totals.shopee.sales += r.shopee?.sales || 0;
    totals.shopee.ads += r.shopee?.adsSpent || 0;
    totals.lazada.sales += r.lazada?.total?.sales || 0;
    totals.lazada.ads += r.lazada?.total?.adsSpent || 0;
    totals.tiktok.sales += r.tiktok?.total?.sales || 0;
    totals.tiktok.ads += r.tiktok?.total?.adsSpent || 0;
    totals.website.sales += r.website?.sales || 0;
    totals.other.sales += r.other?.sales || 0;
  });

  const totalSales = totals.shopee.sales + totals.lazada.sales + totals.tiktok.sales + totals.website.sales + totals.other.sales;
  const totalAds = totals.shopee.ads + totals.lazada.ads + totals.tiktok.ads;

  const fmtDate = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;

  return {
    range: `${fmtDate(start)} ~ ${fmtDate(end)}`,
    days: records.length,
    totals,
    totalSales,
    totalAds,
    roas: totalAds > 0 ? totalSales / totalAds : 0,
  };
}

// ── 生成周报（电电 persona）──
async function generateBrief(thisWeek, lastWeek) {
  const pct = (a, b) => b > 0 ? (((a - b) / b) * 100).toFixed(1) : 'N/A';

  const dataContext = `
本周（${thisWeek.range}，共${thisWeek.days}天有数据）电商渠道数据：
- Shopee：销售 RM ${thisWeek.totals.shopee.sales.toFixed(2)}，广告花费 RM ${thisWeek.totals.shopee.ads.toFixed(2)}
- Lazada：销售 RM ${thisWeek.totals.lazada.sales.toFixed(2)}，广告花费 RM ${thisWeek.totals.lazada.ads.toFixed(2)}
- TikTok：销售 RM ${thisWeek.totals.tiktok.sales.toFixed(2)}，广告花费 RM ${thisWeek.totals.tiktok.ads.toFixed(2)}
- Website：销售 RM ${thisWeek.totals.website.sales.toFixed(2)}
- Other：销售 RM ${thisWeek.totals.other.sales.toFixed(2)}
- 总销售额：RM ${thisWeek.totalSales.toFixed(2)}
- 总广告花费：RM ${thisWeek.totalAds.toFixed(2)}
- 整体 ROAS：${thisWeek.roas.toFixed(2)}x

上周（${lastWeek.range}，共${lastWeek.days}天有数据）对比：
- 总销售额：RM ${lastWeek.totalSales.toFixed(2)}（环比 ${pct(thisWeek.totalSales, lastWeek.totalSales)}%）
- 总广告花费：RM ${lastWeek.totalAds.toFixed(2)}（环比 ${pct(thisWeek.totalAds, lastWeek.totalAds)}%）
- 整体 ROAS：${lastWeek.roas.toFixed(2)}x
- Shopee 销售环比：${pct(thisWeek.totals.shopee.sales, lastWeek.totals.shopee.sales)}%
- Lazada 销售环比：${pct(thisWeek.totals.lazada.sales, lastWeek.totals.lazada.sales)}%
- TikTok 销售环比：${pct(thisWeek.totals.tiktok.sales, lastWeek.totals.tiktok.sales)}%
- Website 销售环比：${pct(thisWeek.totals.website.sales, lastWeek.totals.website.sales)}%
`;

  const systemPrompt = `你是电电，MamaVege 的电商总监。每周一早上为 vege（老板）产出简洁有力的电商周报。
回答语言：中英夹杂，口吻自信、数据驱动。格式用 Telegram Markdown（*粗体* _斜体_）。
回复开头用 "vege，" 开始。不要太长，重点突出，1分钟内能读完。如果某天数据是0或缺失，如实指出，不要瞎编原因。`;

  const userPrompt = `根据以下数据，产出本周的电商周报：\n${dataContext}

周报格式（固定）：
1. 📊 本周渠道总览（各渠道销售额、占比）
2. 📈 环比上周变化（哪些渠道在涨/跌，整体 ROAS 变化）
3. 🔍 值得关注的亮点或异常
4. ✅ 下周建议关注的 1-3 件事`;

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
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }

  const recipients = [
    { chatId: TELEGRAM_CHAT_ID, name: 'vege' },
    { chatId: TELEGRAM_CHAT_ID_2, name: 'steve' },
  ].filter(r => r.chatId);

  for (const { chatId, name } of recipients) {
    for (const chunk of chunks) {
      const personalizedChunk = chunk.replace(/^vege，/, `${name}，`);
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: personalizedChunk, parse_mode: 'Markdown' }),
      });
    }
  }
}
