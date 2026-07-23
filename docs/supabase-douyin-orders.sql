-- 抖店订单表（手动导入，方案3）
-- 请在 Supabase Dashboard → SQL Editor 里执行一次
-- 注意：确认在正确的项目 wjhgezvrxlhpexocfsea

create table if not exists douyin_orders (
  order_id    text primary key,          -- 主订单编号
  pay_time    timestamptz,               -- 支付/下单时间
  status      text,                       -- 订单状态（文字，如「已完成」「已发货」「已关闭」）
  revenue     numeric(10,2) default 0,   -- 订单实付金额（元）
  products    jsonb default '[]',        -- 商品明细 [{title, spec, qty, price}]
  province    text,                      -- 收货省份
  source_name text default '未知',        -- 流量来源/达人（抖店导出如有则填）
  imported_at timestamptz default now()  -- 导入时间
);

create index if not exists idx_douyin_orders_pay_time on douyin_orders (pay_time);

alter table douyin_orders enable row level security;

drop policy if exists "douyin_orders_select" on douyin_orders;
create policy "douyin_orders_select" on douyin_orders for select using (true);

drop policy if exists "douyin_orders_insert" on douyin_orders;
create policy "douyin_orders_insert" on douyin_orders for insert with check (true);

drop policy if exists "douyin_orders_update" on douyin_orders;
create policy "douyin_orders_update" on douyin_orders for update using (true);
