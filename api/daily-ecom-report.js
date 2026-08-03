// /api/daily-ecom-report.js
// Vercel Cron Job — 每天早上 8:00 AM (马来西亚时间 = UTC+8)
// Vercel Cron 用 UTC，所以 8:00 AM MYT = 00:00 UTC

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
  const authHeader = req.headers.authorization;
  const querySecret = req.query?.secret;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && querySecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { today, yesterday } = await fetchTwoDays();
    const brief = await generateBrief(today, yesterday);
    await sendToTelegram(brief);
    return res.status(200).json({ message: '电电日报已发送 ✅' });
  } catch (error) {
    console.error('Daily ecom report error:', error);
    await sendToTelegram(`⚠️ 电电日报生成失败：${error.message}`).catch(() => {});
    return res.status(500).json({ error: error.message });
  }
};

async function fetchTwoDays() {
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayMid = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate()));
  const yesterdayMid = new Date(todayMid.getTime() - 86400000);

  const sheetNames = new Set([sheetNameOf(todayMid), sheetNameOf(yesterdayMid)]);

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

  const matchDay = (rec, day) => rec._day.getTime() === day.getTime();

  return {
    today: summarize(parsed.filter(r => matchDay(r, todayMid)), todayMid),
    yesterday: summarize(parsed.filter(r => matchDay(r, yesterdayMid)), yesterdayMid),
  };
}

function summarize(records, day) {
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
    date: fmtDate(day),
    hasData: records.length > 0,
    totals,
    totalSales,
    totalAds,
    roas: totalAds > 0 ? totalSales / totalAds : 0,
  };
}

async function generateBrief(today, yesterday) {
  const pct = (a, b) => b > 0 ? (((a - b) / b) * 100).toFixed(1) + '%' : 'N/A';

  const dataContext = `
昨天（${yesterday.date}）电商数据${yesterday.hasData ? '' : '（无数据）'}：
- Shopee：销售 RM ${yesterday.totals.shopee.sales.toFixed(2)}，广告 RM ${yesterday.totals.shopee.ads.toFixed(2)}
- Lazada：销售 RM ${yesterday.totals.lazada.sales.toFixed(2)}，广告 RM ${yesterday.totals.lazada.ads.toFixed(2)}
- TikTok：销售 RM ${yesterday.totals.tiktok.sales.toFixed(2)}，广告 RM ${yesterday.totals.tiktok.ads.toFixed(2)}
- Website：销售 RM ${yesterday.totals.website.sales.toFixed(2)}
- Other：销售 RM ${yesterday.totals.other.sales.toFixed(2)}
- 总销售额：RM ${yesterday.totalSales.toFixed(2)}
- 总广告花费：RM ${yesterday.totalAds.toFixed(2)}
- ROAS：${yesterday.roas.toFixed(2)}x

前天（${today.date}）对比${today.hasData ? '' : '（无数据）'}：
- 总销售额：RM ${today.totalSales.toFixed(2)}（环比 ${pct(yesterday.totalSales, today.totalSales)}）
- Shopee 环比：${pct(yesterday.totals.shopee.sales, today.totals.shopee.sales)}
- Lazada 环比：${pct(yesterday.totals.lazada.sales, today.totals.lazada.sales)}
- TikTok 环比：${pct(yesterday.totals.tiktok.sales, today.totals.tiktok.sales)}
- ROAS 环比：${pct(yesterday.roas, today.roas)}
`;

  const systemPrompt = `你是电电，MamaVege 的电商总监。每天早上为 vege（老板）产出简洁的电商日报。
回答语言：中英夹杂，口吻自信、数据驱动。格式用 Telegram Markdown（*粗体* _斜体_）。
回复开头用 "vege，" 开始。简短有力，30秒内能读完。如果数据是0或缺失，如实指出。`;

  const userPrompt = `根据以下数据，产出今天的电商日报：\n${dataContext}

日报格式（固定）：
1. 📊 昨日渠道总览（各渠道销售额）
2. 📈 环比前天（涨跌情况，ROAS 变化）
3. ✅ 今日需关注 1 件事`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
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

async function sendToTelegram(text) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }
  const recipients = [TELEGRAM_CHAT_ID, TELEGRAM_CHAT_ID_2].filter(Boolean);
  for (const chunk of chunks) {
    for (const chatId of recipients) {
      const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
      });
      const tgJson = await tgRes.json();
      console.log(`Telegram chat_id=${chatId} ok=${tgJson.ok} desc=${tgJson.description}`);
    }
  }
}
