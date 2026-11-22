-- doTERRA 后台镜像：数据一律来自 doTERRA 后台（同步时整份覆盖），系统里不手改
create table if not exists dt_members (
  dt_id text primary key,
  name text not null,
  mtype text,                -- D 经营者(Wellness Advocate) / W 批发客户 / S 零售客户
  level int,                 -- 相对 Grace 的层级
  rank text, highest_rank text,
  lrp_pv numeric, lrp_date date, last_order date, enroll_date date,
  sponsor_dt text, enroller_dt text,
  phone text, cell text, email text, address text, city text, state text, postal text, country text,
  synced_at timestamptz default now()
);
create index if not exists dt_members_sponsor on dt_members(sponsor_dt);
create index if not exists dt_members_enroller on dt_members(enroller_dt);

create table if not exists dt_monthly (
  dt_id text not null, ym text not null,
  ov numeric, pv numeric, qual_pv numeric, lrp_pv numeric, pgv numeric, tgv numeric,
  primary key (dt_id, ym)
);

create table if not exists dt_orders (
  order_no text primary key, dt_id text not null,
  otype text, source text, odate date, pv_month text, volume numeric,
  currency text, subtotal numeric, total numeric, pay_method text,
  items jsonb default '[]'::jsonb
);

create table if not exists dt_commissions (
  dt_id text not null, kind text not null,   -- primary 每月 / secondary 每周 (Fast Start)
  period text not null,                      -- primary: 2026-10；secondary: 2026-W46
  earnings numeric, fees numeric, withheld numeric, paid numeric,
  breakdown jsonb,                           -- primary 的各项奖金
  primary key (dt_id, kind, period)
);

create table if not exists dt_reports (
  kind text primary key, title text, tables jsonb, synced_at timestamptz default now()
);

create table if not exists dt_sync (
  id bigserial primary key, dt_id text, what text, rows int, at timestamptz default now()
);

-- 谁能看：管理员 / 超级经营者看全部；经营者看自己 doTERRA 帐户以下的整条线；其他人只看自己的帐户
create or replace function private.my_dt_roots() returns setof text language sql stable security definer set search_path = public as $$
  select nullif(trim(doterra_id), '') from members where id = private.my_member_id()
  union select nullif(trim(member_no), '') from dt_accounts where member_id = private.my_member_id()
$$;
create or replace function private.my_dt_ids() returns setof text language sql stable security definer set search_path = public as $$
  with recursive t as (
    select dt_id from dt_members where dt_id in (select private.my_dt_roots())
    union
    select m.dt_id from dt_members m join t on m.sponsor_dt = t.dt_id
    where private.my_tier() in ('builder', 'super')
  ) select dt_id from t
$$;

alter table dt_members enable row level security;
alter table dt_monthly enable row level security;
alter table dt_orders enable row level security;
alter table dt_commissions enable row level security;
alter table dt_reports enable row level security;
alter table dt_sync enable row level security;

drop policy if exists r on dt_members;     create policy r on dt_members for select using (private.is_admin() or dt_id in (select private.my_dt_ids()));
drop policy if exists r on dt_monthly;     create policy r on dt_monthly for select using (private.is_admin() or dt_id in (select private.my_dt_ids()));
drop policy if exists r on dt_orders;      create policy r on dt_orders for select using (private.is_admin() or dt_id in (select private.my_dt_roots()));
drop policy if exists r on dt_commissions; create policy r on dt_commissions for select using (private.is_admin() or dt_id in (select private.my_dt_roots()));
drop policy if exists r on dt_reports;     create policy r on dt_reports for select using (private.is_admin());
drop policy if exists r on dt_sync;        create policy r on dt_sync for select using (private.is_admin() or private.my_tier() in ('builder', 'super'));
