-- =============================================================
-- 源·精油会员网站  数据库结构（Supabase / Postgres）
-- 在 Supabase 控制台 → SQL Editor 里整段贴上运行一次即可。
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- 目录：产品、配方（公开可读）----------
create table if not exists products (
  id text primary key,
  data jsonb not null,
  sort int default 0,
  hidden boolean default false,
  updated_at timestamptz default now()
);
create table if not exists recipes (
  id text primary key,
  data jsonb not null,
  sort int default 0,
  hidden boolean default false,
  updated_at timestamptz default now()
);
-- 配方原始名称（含疾病字眼），只有管理员看得到
create table if not exists recipe_originals (
  id text primary key,
  title_orig text,
  usage_orig text
);
create table if not exists site_meta (
  key text primary key,
  data jsonb not null
);

-- ---------- 会员 ----------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text default '',
  email text default '',
  phone text default '',
  doterra_id text default '',
  sponsor_id uuid references members(id) on delete set null,
  joined date default current_date,
  member_type text default 'wholesale',        -- retail / wholesale / builder
  accounts text[] default '{}',
  admin_notes text default '',                   -- 只有管理员看得到
  share_health_with_upline boolean default false,-- 上线能否看到配油与需求记录
  created_at timestamptz default now()
);
create index if not exists members_sponsor_idx on members(sponsor_id);
create index if not exists members_email_idx on members(lower(email));

-- 积分 / 欠款 / 业绩（手动或报表导入）
create table if not exists member_status (
  member_id uuid primary key references members(id) on delete cascade,
  points numeric default 0,          -- LRP 积分
  balance_owed numeric default 0,    -- 欠款
  currency text default 'CAD',
  pv numeric default 0,              -- 本月个人 PV
  lrp_pv numeric default 0,          -- 本月 LRP 订单 PV
  ov numeric default 0,              -- 本月组织业绩 OV
  lrp_months int default 0,          -- 连续 LRP 月数
  legs int default 0,                -- 达标的直属线数量
  member_level text default '',      -- 会员等级 code
  rank text default '',              -- 事业等级 code
  period text default '',            -- 数据所属月份，例如 2026-11
  source text default 'manual',
  updated_at timestamptz default now()
);

-- 等级规则（可在后台调整）
create table if not exists levels (
  id uuid primary key default gen_random_uuid(),
  kind text not null,      -- member / rank / bonus / reward
  code text not null,
  name_zh text not null,
  name_en text default '',
  sort int default 0,
  req_pv numeric,
  req_lrp_pv numeric,
  req_ov numeric,
  req_legs int,
  req_lrp_months int,
  req_points numeric,
  note_zh text default '',
  note_en text default '',
  unique(kind, code)
);

-- 订单
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  order_no text default '',
  date date not null default current_date,
  account text default '',
  currency text default 'CAD',
  total numeric,
  total_pv numeric,
  payment text default '',
  reason text default '',         -- 理由 / 备注
  items jsonb default '[]',       -- [{zh,en,product,qty,pv,price,tag,note}]
  created_at timestamptz default now()
);
create index if not exists orders_member_idx on orders(member_id, date desc);

-- 配油记录
create table if not exists blends (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  recipe_id text,
  title text not null,
  title_en text default '',
  date date default current_date,
  purpose text default '',
  items jsonb default '[]',       -- [{oil, product, drops}]
  carrier text default '',
  carrier_ml numeric,
  unit text default 'ml',
  usage text default '',
  usage_en text default '',
  feedback text default '',
  created_at timestamptz default now()
);
create index if not exists blends_member_idx on blends(member_id, date desc);

-- 需求 / 痛点 / 进度跟进
create table if not exists needs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  date date default current_date,
  kind text default 'need',       -- need(需求/痛点) / progress(进度)
  title text default '',
  body text default '',
  pain_tags text[] default '{}',
  status text default 'open',     -- open / improving / resolved
  author text default 'admin',    -- admin / member
  parent_id uuid references needs(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists needs_member_idx on needs(member_id, date desc);

-- 一键配油申请
create table if not exists blend_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete set null,
  user_id uuid default auth.uid(),
  name text default '',
  contact text default '',
  recipe_id text,
  recipe_title text default '',
  items jsonb default '[]',
  bottle text default '',
  notes text default '',
  status text default 'new',      -- new / preparing / ready / done / cancelled
  created_at timestamptz default now()
);

-- 登入账号 ↔ 会员
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  role text default 'member',     -- member / admin
  created_at timestamptz default now()
);

-- ---------- 权限辅助函数 ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select member_id from profiles where id = auth.uid();
$$;

-- 目标会员是否在“我”的结构里（包括我自己）
create or replace function in_my_tree(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select id from members where id = my_member_id()
    union all
    select m.id from members m join tree t on m.sponsor_id = t.id
  )
  select exists(select 1 from tree where id = target);
$$;

-- 健康类记录：本人可看；上线只在对方同意分享时可看
create or replace function can_see_health(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = my_member_id()
      or (in_my_tree(target) and coalesce((select share_health_with_upline from members where id = target), false));
$$;

-- 新登入账号自动按电邮或电话关联会员
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  select id into mid from members
   where (new.email is not null and new.email <> '' and lower(email) = lower(new.email))
      or (new.phone is not null and new.phone <> '' and regexp_replace(phone,'\D','','g') = regexp_replace(new.phone,'\D','','g'))
   limit 1;
  insert into profiles(id, member_id) values (new.id, mid) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 已登入但未关联时，可再尝试关联一次（会员资料后补的情况）
create or replace function link_my_member() returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid; em text; ph text;
begin
  select email, phone into em, ph from auth.users where id = auth.uid();
  select id into mid from members
   where (em is not null and em <> '' and lower(email) = lower(em))
      or (ph is not null and ph <> '' and regexp_replace(phone,'\D','','g') = regexp_replace(ph,'\D','','g'))
   limit 1;
  insert into profiles(id, member_id) values (auth.uid(), mid)
    on conflict (id) do update set member_id = coalesce(profiles.member_id, excluded.member_id);
  return (select member_id from profiles where id = auth.uid());
end $$;

-- 会员自己切换“是否让上线看到健康记录”
create or replace function set_share_health(v boolean) returns void
language sql security definer set search_path = public as $$
  update members set share_health_with_upline = v where id = my_member_id();
$$;

-- ---------- 行级权限 ----------
alter table products enable row level security;
alter table recipes enable row level security;
alter table site_meta enable row level security;
alter table recipe_originals enable row level security;
drop policy if exists ro_admin on recipe_originals; create policy ro_admin on recipe_originals for all using (is_admin()) with check (is_admin());
alter table members enable row level security;
alter table member_status enable row level security;
alter table levels enable row level security;
alter table orders enable row level security;
alter table blends enable row level security;
alter table needs enable row level security;
alter table blend_requests enable row level security;
alter table profiles enable row level security;

-- 目录：所有人可读，管理员可写
drop policy if exists p_read on products;      create policy p_read on products for select using (true);
drop policy if exists p_write on products;     create policy p_write on products for all using (is_admin()) with check (is_admin());
drop policy if exists r_read on recipes;       create policy r_read on recipes for select using (true);
drop policy if exists r_write on recipes;      create policy r_write on recipes for all using (is_admin()) with check (is_admin());
drop policy if exists sm_read on site_meta;    create policy sm_read on site_meta for select using (true);
drop policy if exists sm_write on site_meta;   create policy sm_write on site_meta for all using (is_admin()) with check (is_admin());
drop policy if exists l_read on levels;        create policy l_read on levels for select using (true);
drop policy if exists l_write on levels;       create policy l_write on levels for all using (is_admin()) with check (is_admin());

-- 会员：自己和下线可读；管理员全权
drop policy if exists m_read on members;       create policy m_read on members for select using (is_admin() or in_my_tree(id));
drop policy if exists m_write on members;      create policy m_write on members for all using (is_admin()) with check (is_admin());
drop policy if exists ms_read on member_status;create policy ms_read on member_status for select using (is_admin() or in_my_tree(member_id));
drop policy if exists ms_write on member_status;create policy ms_write on member_status for all using (is_admin()) with check (is_admin());
drop policy if exists o_read on orders;        create policy o_read on orders for select using (is_admin() or in_my_tree(member_id));
drop policy if exists o_write on orders;       create policy o_write on orders for all using (is_admin()) with check (is_admin());

-- 配油、需求：本人 + 同意分享的下线 + 管理员
drop policy if exists b_read on blends;        create policy b_read on blends for select using (is_admin() or can_see_health(member_id));
drop policy if exists b_write on blends;       create policy b_write on blends for all using (is_admin()) with check (is_admin());
drop policy if exists n_read on needs;         create policy n_read on needs for select using (is_admin() or can_see_health(member_id));
drop policy if exists n_admin on needs;        create policy n_admin on needs for all using (is_admin()) with check (is_admin());
drop policy if exists n_self_insert on needs;  create policy n_self_insert on needs for insert
  with check (member_id = my_member_id() and author = 'member');

-- 配油申请：任何人可提交；本人和管理员可看
drop policy if exists br_insert on blend_requests; create policy br_insert on blend_requests for insert
  with check (status = 'new' and (member_id is null or member_id = my_member_id()));
drop policy if exists br_read on blend_requests;   create policy br_read on blend_requests for select
  using (is_admin() or (member_id is not null and member_id = my_member_id()));
drop policy if exists br_admin on blend_requests;  create policy br_admin on blend_requests for update using (is_admin()) with check (is_admin());
drop policy if exists br_del on blend_requests;    create policy br_del on blend_requests for delete using (is_admin());

-- 账号资料
drop policy if exists pr_read on profiles;     create policy pr_read on profiles for select using (id = auth.uid() or is_admin());
drop policy if exists pr_admin on profiles;    create policy pr_admin on profiles for all using (is_admin()) with check (is_admin());

grant execute on function link_my_member() to authenticated;
grant execute on function set_share_health(boolean) to authenticated;
