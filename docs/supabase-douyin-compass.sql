-- 抖店罗盘「成交分析」汇总表（手动导入）
-- 在 Supabase SQL Editor 执行一次（确认项目 wjhgezvrxlhpexocfsea）

create table if not exists douyin_compass (
  dim         text not null,             -- 维度：overview(每日总览) / product(商品) / talent(达人)
  ymd         date not null,             -- 日期
  name        text not null default '',  -- 商品名/达人名；总览用 ''
  gmv         numeric(12,2) default 0,   -- 用户支付金额
  orders      integer default 0,         -- 成交订单数
  units       integer default 0,         -- 成交件数
  commission  numeric(12,2) default 0,   -- 达人佣金（仅达人维度）
  extra       jsonb default '{}',        -- 客单价/复购/自营合作/抖音号等
  imported_at timestamptz default now(),
  primary key (dim, ymd, name)
);

create index if not exists idx_douyin_compass_ymd on douyin_compass (ymd);

alter table douyin_compass enable row level security;
drop policy if exists "dc_select" on douyin_compass;
create policy "dc_select" on douyin_compass for select using (true);
drop policy if exists "dc_insert" on douyin_compass;
create policy "dc_insert" on douyin_compass for insert with check (true);
drop policy if exists "dc_update" on douyin_compass;
create policy "dc_update" on douyin_compass for update using (true);
