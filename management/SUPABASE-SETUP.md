# 财务监督系统 · Supabase 后台设置清单

项目：`https://wjhgezvrxlhpexocfsea.supabase.co`
完成以下 3 步后，`management/finance-hub.html` / `finance-dashboard.html` 即可使用。

---

## 第 1 步：开启 Email 登录、关闭公开注册

Supabase Dashboard → **Authentication**：

1. **Sign In / Providers** → 确认 **Email** provider 已启用（默认开启）。
   - 建议把 *Confirm email* 关掉（内部工具，账号本来就是你手动建的）。
2. **Sign In / Providers → Auth settings** → 把 **Allow new users to sign up** 关掉（**关键**：防止外人自己注册账号）。
   - 关闭后：密码登录、已有账号的 Magic Link 都正常；新账号只能由你在后台建。
3. **URL Configuration**：
   - **Site URL** 填你的 Vercel 正式域名（例如 `https://promo-traker.vercel.app`）。
   - **Redirect URLs** 加上：
     - `https://<你的域名>/management/finance-hub.html`
     - `https://<你的域名>/management/finance-dashboard.html`
     - 本地测试可加 `http://localhost:*`
   - 这决定 Magic Link 点击后跳回哪里。

## 第 2 步：建你的账号

**Authentication → Users → Add user → Create new user**：

- Email：`ohy4896@gmail.com`
- Password：自己设一个强密码
- 勾选 **Auto Confirm User**

以后要给别人开权限：同样方式建账号，然后在 `app_permissions` 表加一行（见下方说明）。

## 第 3 步：SQL Editor 执行初始化脚本

**SQL Editor → New query**，整段贴入执行（可重复执行，幂等）：

```sql
-- ============================================================
-- MamaVege 权限系统 + 财务监督表 · 初始化脚本
-- ============================================================

-- 1) 通用权限表（全公司共用：finance / purchasing / hr / warehouse / production...）
create table if not exists public.app_permissions (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  module      text not null,          -- 模块名；'all' = 全模块通配
  role        text not null default 'viewer' check (role in ('admin','editor','viewer')),
  note        text,
  created_at  timestamptz not null default now(),
  unique (email, module)
);

-- 2) 月度财务表
create table if not exists public.finance_monthly (
  id               uuid primary key default gen_random_uuid(),
  month            date not null unique,   -- 每月1号，如 2026-07-01
  net_sales        numeric,                -- 净销售额 RM
  gross_margin_pct numeric,                -- 毛利率 %
  opex             numeric,                -- 营业费用 RM
  inventory        numeric,                -- 库存金额 RM
  cash_balance     numeric,                -- 现金余额 RM
  recon_sales_dash numeric,                -- 对账：Sales Dashboard 当月总额
  recon_ecom       numeric,                -- 对账：Ecom Dashboard 当月总额
  note             text,
  updated_by       text,
  updated_at       timestamptz not null default now()
);

-- 3) 目标线表（按生效月配置，红绿灯按各月适用目标评级）
create table if not exists public.finance_targets (
  id             uuid primary key default gen_random_uuid(),
  effective_from date not null unique,     -- 从该月起生效
  sales_min      numeric,                  -- 销售下限
  margin_min_pct numeric,                  -- 毛利率下限 %
  opex_max       numeric,                  -- 费用上限
  inventory_max  numeric,                  -- 库存上限
  cash_min       numeric default 0,        -- 现金下限
  note           text,
  created_at     timestamptz not null default now()
);

-- 4) 权限判断函数（SECURITY DEFINER，避免 RLS 自引用死循环）
create or replace function public.mv_has_module(p_module text, p_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_permissions
    where lower(email) = lower(coalesce(auth.jwt()->>'email',''))
      and module in (p_module, 'all')
      and role = any(p_roles)
  );
$$;
revoke all on function public.mv_has_module(text, text[]) from public;
grant execute on function public.mv_has_module(text, text[]) to authenticated;

-- 5) RLS：app_permissions
alter table public.app_permissions enable row level security;
drop policy if exists "perm_read_own"    on public.app_permissions;
drop policy if exists "perm_admin_all"   on public.app_permissions;
create policy "perm_read_own" on public.app_permissions
  for select to authenticated
  using ( lower(email) = lower(coalesce(auth.jwt()->>'email',''))
          or public.mv_has_module('permissions', array['admin']) );
create policy "perm_admin_all" on public.app_permissions
  for all to authenticated
  using ( public.mv_has_module('permissions', array['admin']) )
  with check ( public.mv_has_module('permissions', array['admin']) );

-- 6) RLS：finance_monthly（读=viewer+ / 写=editor+ / 删=admin）
alter table public.finance_monthly enable row level security;
drop policy if exists "fin_read"   on public.finance_monthly;
drop policy if exists "fin_insert" on public.finance_monthly;
drop policy if exists "fin_update" on public.finance_monthly;
drop policy if exists "fin_delete" on public.finance_monthly;
create policy "fin_read" on public.finance_monthly
  for select to authenticated
  using ( public.mv_has_module('finance', array['admin','editor','viewer']) );
create policy "fin_insert" on public.finance_monthly
  for insert to authenticated
  with check ( public.mv_has_module('finance', array['admin','editor']) );
create policy "fin_update" on public.finance_monthly
  for update to authenticated
  using ( public.mv_has_module('finance', array['admin','editor']) )
  with check ( public.mv_has_module('finance', array['admin','editor']) );
create policy "fin_delete" on public.finance_monthly
  for delete to authenticated
  using ( public.mv_has_module('finance', array['admin']) );

-- 7) RLS：finance_targets（同上）
alter table public.finance_targets enable row level security;
drop policy if exists "tgt_read"   on public.finance_targets;
drop policy if exists "tgt_insert" on public.finance_targets;
drop policy if exists "tgt_update" on public.finance_targets;
drop policy if exists "tgt_delete" on public.finance_targets;
create policy "tgt_read" on public.finance_targets
  for select to authenticated
  using ( public.mv_has_module('finance', array['admin','editor','viewer']) );
create policy "tgt_insert" on public.finance_targets
  for insert to authenticated
  with check ( public.mv_has_module('finance', array['admin','editor']) );
create policy "tgt_update" on public.finance_targets
  for update to authenticated
  using ( public.mv_has_module('finance', array['admin','editor']) )
  with check ( public.mv_has_module('finance', array['admin','editor']) );
create policy "tgt_delete" on public.finance_targets
  for delete to authenticated
  using ( public.mv_has_module('finance', array['admin']) );

-- 8) 第一批授权：Vege = 全模块 admin
insert into public.app_permissions (email, module, role, note)
values ('ohy4896@gmail.com', 'all', 'admin', 'CEO Vege · 全模块管理员')
on conflict (email, module) do update set role = excluded.role;

-- 9) 目标线：2026 H2
insert into public.finance_targets (effective_from, sales_min, margin_min_pct, opex_max, inventory_max, cash_min, note)
values ('2026-07-01', 550000, 38, 220000, 750000, 0, '2026 H2 目标：销售≥550k/月、毛利≥38%、费用≤220k/月、库存年底≤750k、现金为正')
on conflict (effective_from) do update set
  sales_min=excluded.sales_min, margin_min_pct=excluded.margin_min_pct,
  opex_max=excluded.opex_max, inventory_max=excluded.inventory_max,
  cash_min=excluded.cash_min, note=excluded.note;

-- 10) 2026 H1 实际数据（现金余额待补；库存只有6月底数）
insert into public.finance_monthly (month, net_sales, gross_margin_pct, opex, inventory, note) values
  ('2026-01-01', 403536, 48.5, 300803, null, null),
  ('2026-02-01', 393950,  3.2, 276084, null, '节日备货导致毛利率扭曲'),
  ('2026-03-01', 425882, 39.0, 220440, null, null),
  ('2026-04-01', 540718, 42.0, 227150, null, null),
  ('2026-05-01', 641493, 51.9, 204004, null, null),
  ('2026-06-01', 403035, 46.1, 342472, 1065209, '库存天数约132天')
on conflict (month) do nothing;
```

---

## 日常管理

**给同事开权限**（先在 Authentication → Users 建账号，再执行）：

```sql
-- 例：给财务同事开 finance 编辑权限
insert into public.app_permissions (email, module, role, note)
values ('someone@mamavege.com', 'finance', 'editor', '财务部');

-- 例：只读
-- role 三档：admin（管权限+可删数据）> editor（可录入/修改）> viewer（只读）
```

**未来扩展模块**：purchasing / hr / warehouse / production 的新表照抄第 6 节的 policy，把 `'finance'` 换成新模块名即可；权限表和登录模块（`js/auth/auth.js`）不用改。

## 安全说明

- 真正的防线在数据库 RLS：没登录（anon）或不在 `app_permissions` 白名单的账号，对三张表的任何读写都返回空/拒绝，前端页面拦截只是体验层。
- anon key 写在前端是正常做法（Supabase 设计如此），安全性完全由 RLS 决定。
- 现有销售端登录（`members` 表明文密码 + localStorage）与本系统无关且不安全，财务数据不要放进旧体系的表里。
