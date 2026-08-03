// /api/monthly-ecom-report.js
// Vercel Cron Job — 每月1号早上 7:00 AM (马来西亚时间 = UTC+8)
// Vercel Cron 用 UTC，所以每月1号 7:00 AM MYT = 前一天 23:00 UTC -> "0 23 L * *"
// 实际排程：每月最后一天 23:00 UTC = 每月1号 7:00 AM MYT

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

  // 只在"明天是1号"时发月报（即今天是月末）
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const tomorrow = new Date(myt.getTime() + 24 * 60 * 60 * 1000);
  if (tomorrow.getUTCDate() !== 1) {
    return res.status(200).json({ message: '今天不是月末，跳过月报' });
  }

  try {
    const { thisMonth, lastMonth } = await fetchTwoMonths();
    const brief = await generateBrief(thisMonth, lastMonth);
    await sendToTelegram(brief);
    return res.status(200).json({ message: '电电月报已发送 ✅' });
  } catch (error) {
    console.error('Monthly ecom report error:', error);
    await sendToTelegram(`⚠️ 电电月报生成失败：${error.message}`).catch(() => {});
    return res.status(500).json({ error: error.message });
  }
};

async function fetchTwoMonths() {
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  // 上个月（昨天所在的月份，因为今天是1号）
  const lastMonthDate = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth() - 1, 1));
  // 上上个月
  const prevMonthDate = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth() - 2, 1));

  async function fetchMonth(date) {
    const sheetName = sheetNameOf(date);
    try {
      const r = await fetch(`${ECOM_API}?sheet=${encodeURIComponent(sheetName)}`);
      const json = await r.json();
      if (json.error) return { sheetName, records: [] };
      return { sheetName, records: json.data || [] };
    } catch { return { sheetName, records: [] }; }
  }

  const [thisMonthData, lastMonthData] = await Promise.all([
    fetchMonth(lastMonthDate),
    fetchMonth(prevMonthDate),
  ]);

  return {
    thisMonth: summarize(thisMonthData.records, lastMonthDate, thisMonthData.sheetName),
    lastMonth: summarize(lastMonthData.records, prevMonthDate, lastMonthData.sheetName),
  };
}

function summarize(records, monthDate, sheetName) {
  const totals = {
    shopee: { sales: 0, ads: 0 },
    lazada: { sales: 0, ads: 0 },
    tiktok: { sales: 0, ads: 0 },
    website: { sales: 0 },
    other: { sales: 0 },
  };

  // 只统计有实际数据的天(过滤全零天)
  const activeDays = records.filter(r => {
    const s = (r.shopee?.sales||0) + (r.lazada?.total?.sales||0) + (r.tiktok?.total?.sales||0) + (r.website?.sales||0) + (r.other?.sales||0);
    return s > 0;
  });

  activeDays.forEach(r => {
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
  const monthLabel = monthDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', timeZone: 'UTC' });

  return { sheetName, monthLabel, activeDays: activeDays.length, totals, totalSales, totalAds, roas: totalAds > 0 ? totalSales / totalAds : 0 };
}

async function generateBrief(thisMonth, lastMonth) {
  const pct = (a, b) => b > 0 ? (((a - b) / b) * 100).toFixed(1) + '%' : 'N/A';
  const rm = n => `RM ${n.toFixed(2)}`;

  const totalTarget = 0; // 可后续加月目标

  const dataContext = `
上个月（${thisMonth.monthLabel}，共${thisMonth.activeDays}天有数据）电商渠道月度数据：
- Shopee：销售 ${rm(thisMonth.totals.shopee.sales)}，广告花费 ${rm(thisMonth.totals.shopee.ads)}，ROAS ${thisMonth.totals.shopee.ads > 0 ? (thisMonth.totals.shopee.sales/thisMonth.totals.shopee.ads).toFixed(2) : 'N/A'}x
- Lazada：销售 ${rm(thisMonth.totals.lazada.sales)}，广告花费 ${rm(thisMonth.totals.lazada.ads)}，ROAS ${thisMonth.totals.lazada.ads > 0 ? (thisMonth.totals.lazada.sales/thisMonth.totals.lazada.ads).toFixed(2) : 'N/A'}x
- TikTok：销售 ${rm(thisMonth.totals.tiktok.sales)}，广告花费 ${rm(thisMonth.totals.tiktok.ads)}，ROAS ${thisMonth.totals.tiktok.ads > 0 ? (thisMonth.totals.tiktok.sales/thisMonth.totals.tiktok.ads).toFixed(2) : 'N/A'}x
- Website：销售 ${rm(thisMonth.totals.website.sales)}
- Other：销售 ${rm(thisMonth.totals.other.sales)}
- 总销售额：${rm(thisMonth.totalSales)}
- 总广告花费：${rm(thisMonth.totalAds)}
- 整体 ROAS：${thisMonth.roas.toFixed(2)}x

对比上上月（${lastMonth.monthLabel}）：
- 总销售额：${rm(lastMonth.totalSales)}（环比 ${pct(thisMonth.totalSales, lastMonth.totalSales)}）
- 总广告花费：${rm(lastMonth.totalAds)}（环比 ${pct(thisMonth.totalAds, lastMonth.totalAds)}）
- 整体 ROAS：${lastMonth.roas.toFixed(2)}x
- Shopee 环比：${pct(thisMonth.totals.shopee.sales, lastMonth.totals.shopee.sales)}
- Lazada 环比：${pct(thisMonth.totals.lazada.sales, lastMonth.totals.lazada.sales)}
- TikTok 环比：${pct(thisMonth.totals.tiktok.sales, lastMonth.totals.tiktok.sales)}
- Website 环比：${pct(thisMonth.totals.website.sales, lastMonth.totals.website.sales)}
`;

  const systemPrompt = `你是电电，MamaVege 的电商总监。每月1号早上为 vege（老板）产出简洁有力的电商月报。
回答语言：中英夹杂，口吻自信、数据驱动。格式用 Telegram Markdown（*粗体* _斜体_）。
回复开头用 "vege，" 开始。重点突出，2分钟内能读完。如果某渠道数据偏低或缺失，如实指出。`;

  const userPrompt = `根据以下数据，产出上个月的电商月报：\n${dataContext}

月报格式（固定）：
1. 📊 上月各渠道总览（销售额、占比、广告花费、ROAS）
2. 📈 环比上上月变化（整体趋势、各渠道涨跌）
3. 🏆 本月表现最好的渠道 & 原因分析
4. ⚠️ 需要关注或改善的渠道
5. ✅ 下个月电商 Top 3 行动建议`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
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
