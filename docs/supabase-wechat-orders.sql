-- 微信小店订单同步表
-- 请在 Supabase Dashboard → SQL Editor 里执行一次

create table if not exists wechat_orders (
  order_id    text primary key,          -- 微信订单号
  pay_time    timestamptz,               -- 付款时间
  status      int,                       -- 订单状态 (20待发货/21部分发货/30待收货/100完成/250取消)
  revenue     numeric(10,2) default 0,   -- 实付金额（元）
  products    jsonb default '[]',        -- 商品明细 [{title, sku_cnt, price}]
  province    text,                      -- 收货省份
  synced_at   timestamptz default now()  -- 同步时间
);

create index if not exists idx_wechat_orders_pay_time on wechat_orders (pay_time);

-- RLS：内部项目，允许 anon 读写（与现有系统一致用 anon key）
alter table wechat_orders enable row level security;

drop policy if exists "wechat_orders_select" on wechat_orders;
create policy "wechat_orders_select" on wechat_orders for select using (true);

drop policy if exists "wechat_orders_insert" on wechat_orders;
create policy "wechat_orders_insert" on wechat_orders for insert with check (true);

drop policy if exists "wechat_orders_update" on wechat_orders;
create policy "wechat_orders_update" on wechat_orders for update using (true);

-- v2：成交来源字段（2026-07 新增）
alter table wechat_orders
  add column if not exists source_name text default '自然流量',  -- 带货账号昵称，无则为自然流量
  add column if not exists commission numeric(10,2) default 0,   -- 该订单佣金总额（元）
  add column if not exists source jsonb default '[]';            -- 来源明细 [{nickname, account_type, sale_channel, sku_id}]
