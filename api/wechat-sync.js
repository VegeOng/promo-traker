// /api/wechat-sync.js
// Vercel Cron — 每天 UTC 22:30 (MYT 06:30) 把微信小店订单同步到 Supabase wechat_orders 表
// 每次同步最近 3 天的订单（覆盖补录/状态变化），按 order_id upsert 不会重复

const SUPABASE_URL = 'https://wjhgezvrxlhpexocfsea.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqaGdlenZyeGxocGV4b2Nmc2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU4NzgsImV4cCI6MjA5NDA4MTg3OH0.jENcrgEDYDlSRUCqve-T6rxYRJfz-dnZQHnXpPLJ_RE';
const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET;

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = await getAccessToken();
    const orders = await fetchOrders(token, 3); // 最近3天
    if (orders.length === 0) return res.status(200).json({ message: '近3天无订单' });

    const records = orders.map(o => ({
      order_id: o.order_id,
      pay_time: o.order_detail?.pay_info?.pay_time
        ? new Date(o.order_detail.pay_info.pay_time * 1000).toISOString()
        : new Date(o.create_time * 1000).toISOString(),
      status: o.status,
      revenue: (o.order_detail?.price_info?.order_price || 0) / 100,
      products: (o.order_detail?.product_infos || []).map(p => ({
        title: p.title, sku_cnt: p.sku_cnt, price: (p.sale_price || 0) / 100,
        sku_code: p.sku_code || '',
        spec: (p.sku_attrs || []).map(a => `${a.attr_key}=${a.attr_value}`).join(' | '),
      })),
      province: o.order_detail?.delivery_info?.address_info?.province_name || null,
      synced_at: new Date().toISOString(),
    }));

    const r = await fetch(`${SUPABASE_URL}/rest/v1/wechat_orders?on_conflict=order_id`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(records),
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Supabase upsert failed: ${err}`);
    }

    return res.status(200).json({ message: `已同步 ${records.length} 笔订单 ✅` });
  } catch (err) {
    console.error('wechat-sync error:', err);
    return res.status(500).json({ error: err.message });
  }
};

async function getAccessToken() {
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_APPID}&secret=${WECHAT_APPSECRET}`);
  const json = await r.json();
  if (!json.access_token) throw new Error(`获取 access_token 失败: ${json.errmsg || JSON.stringify(json)}`);
  return json.access_token;
}

async function fetchOrders(token, days) {
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - days * 86400;

  const ids = [];
  let nextKey;
  for (let i = 0; i < 20; i++) {
    const body = { page_size: 100, create_time_range: { start_time: startTime, end_time: now } };
    if (nextKey) body.next_key = nextKey;
    const r = await fetch(`https://api.weixin.qq.com/channels/ec/order/list/get?access_token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await r.json();
    if (json.errcode !== 0) throw new Error(`订单列表失败: ${json.errmsg}`);
    ids.push(...(json.order_id_list || []));
    if (!json.has_more) break;
    nextKey = json.next_key;
  }

  const orders = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map(async id => {
      const r = await fetch(`https://api.weixin.qq.com/channels/ec/order/get?access_token=${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: id }),
      });
      const json = await r.json();
      return json.errcode === 0 ? json.order : null;
    }));
    orders.push(...batch.filter(Boolean));
  }
  return orders;
}
