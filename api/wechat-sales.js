// /api/wechat-sales.js
// 微信小店实时销售数据（channels/ec API）
// GET /api/wechat-sales?days=7 → 按日汇总的订单/营收/产品销量
// 金额单位：微信 API 返回「分」，此处统一转换为「元」

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET;

// 已付款以上的有效状态（排除未付款10/已取消250）
const VALID_STATUS = new Set([20, 21, 30, 100]); // 待发货/部分发货/待收货/完成

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const token = await getAccessToken();
    const orders = await fetchOrders(token, days);

    // 按日（GMT+8）汇总
    const daily = {};
    const products = {};
    let totalRevenue = 0, totalOrders = 0;

    orders.forEach(o => {
      if (!VALID_STATUS.has(o.status)) return;
      const payTime = o.order_detail?.pay_info?.pay_time || o.create_time;
      const d = new Date((payTime + 8 * 3600) * 1000);
      const day = d.toISOString().split('T')[0];
      const rev = (o.order_detail?.price_info?.order_price || 0) / 100;

      if (!daily[day]) daily[day] = { revenue: 0, orders: 0 };
      daily[day].revenue += rev;
      daily[day].orders += 1;
      totalRevenue += rev;
      totalOrders += 1;

      (o.order_detail?.product_infos || []).forEach(p => {
        const key = p.title || p.product_id;
        products[key] = (products[key] || 0) + (p.sku_cnt || 0);
      });
    });

    return res.status(200).json({
      source: '微信小店 API（实时）',
      days,
      totalRevenue: +totalRevenue.toFixed(2),
      totalOrders,
      daily,
      products,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('wechat-sales error:', err);
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

  // 1. 拉订单 ID 列表（分页）
  const ids = [];
  let nextKey = undefined;
  for (let i = 0; i < 20; i++) { // 最多20页防死循环
    const body = { page_size: 100, create_time_range: { start_time: startTime, end_time: now } };
    if (nextKey) body.next_key = nextKey;
    const r = await fetch(`https://api.weixin.qq.com/channels/ec/order/list/get?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (json.errcode !== 0) throw new Error(`订单列表失败: ${json.errmsg}`);
    ids.push(...(json.order_id_list || []));
    if (!json.has_more) break;
    nextKey = json.next_key;
  }

  // 2. 拉订单详情（并发，分批防限流）
  const orders = [];
  const BATCH = 10;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async id => {
      const r = await fetch(`https://api.weixin.qq.com/channels/ec/order/get?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: id }),
      });
      const json = await r.json();
      return json.errcode === 0 ? json.order : null;
    }));
    orders.push(...results.filter(Boolean));
  }
  return orders;
}
