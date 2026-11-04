-- 芳疗师、预约、服务记录（类似医生的病历：每次服务一份记录，任何芳疗师都看得到客人的历次记录）

-- 芳疗师名单：管理员在后台加名字和电邮；芳疗师用这个电邮登入后自动成为「芳疗师」角色
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  name_en text default '',
  email text unique,
  phone text default '',
  title text default '芳疗师',
  active boolean default true,
  created_at timestamptz default now()
);

create or replace function private.is_staff() returns boolean
  language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from profiles where id = auth.uid() and role in ('admin','therapist'));
$$;
create or replace function private.my_staff_id() returns uuid
  language sql stable security definer set search_path to 'public' as $$
  select id from staff where user_id = auth.uid();
$$;
revoke execute on function private.is_staff() from public, anon;
revoke execute on function private.my_staff_id() from public, anon;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.my_staff_id() to authenticated;

-- 预约：上门或到工作室
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete set null,
  user_id uuid default auth.uid(),
  name text default '',
  contact text default '',
  kind text default 'studio' check (kind in ('home','studio')),
  address text default '',
  date date,
  slot text default '',
  need text default '',
  therapist_id uuid references staff(id) on delete set null,
  status text default 'new',          -- new / confirmed / done / cancelled
  admin_note text default '',
  created_at timestamptz default now()
);

-- 服务记录：status=final 之后客人在会员页看得到；草稿只有团队看得到
create table if not exists service_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  therapist_id uuid references staff(id) on delete set null,
  date date default current_date,
  kind text default 'studio',
  concern text default '',            -- 客人说的状况
  observation text default '',        -- 芳疗师观察
  treatment text default '',          -- 这次做了什么
  oils jsonb default '[]',            -- [{product, oil, drops, note}]
  advice text default '',             -- 居家建议
  followup text default '',           -- 下次跟进
  report text default '',             -- 给客人看的服务报告
  status text default 'draft' check (status in ('draft','final')),
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  finalized_at timestamptz
);
create index if not exists sr_member on service_records(member_id, date desc);

-- 内部笔记：芳疗师边做边记（打字或语音转文字），客人看不到
create table if not exists service_notes (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references service_records(id) on delete cascade,
  body text not null,
  kind text default 'typed',          -- typed / voice
  author uuid default auth.uid(),
  author_name text default '',
  created_at timestamptz default now()
);

alter table staff enable row level security;
alter table bookings enable row level security;
alter table service_records enable row level security;
alter table service_notes enable row level security;

drop policy if exists st_read on staff;   create policy st_read on staff for select using (private.is_staff());
drop policy if exists st_admin on staff;  create policy st_admin on staff for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists bk_insert on bookings; create policy bk_insert on bookings for insert
  with check (status = 'new' and therapist_id is null and (member_id is null or member_id = private.my_member_id()));
drop policy if exists bk_read on bookings;   create policy bk_read on bookings for select
  using (private.is_staff() or (member_id is not null and member_id = private.my_member_id()));
drop policy if exists bk_staff on bookings;  create policy bk_staff on bookings for update
  using (private.is_admin() or therapist_id = private.my_staff_id()) with check (private.is_admin() or therapist_id = private.my_staff_id());
drop policy if exists bk_del on bookings;    create policy bk_del on bookings for delete using (private.is_admin());

drop policy if exists sr_read on service_records;   create policy sr_read on service_records for select
  using (private.is_staff() or (status = 'final' and private.can_see_health(member_id)));
drop policy if exists sr_insert on service_records; create policy sr_insert on service_records for insert with check (private.is_staff());
drop policy if exists sr_update on service_records; create policy sr_update on service_records for update using (private.is_staff()) with check (private.is_staff());
drop policy if exists sr_del on service_records;    create policy sr_del on service_records for delete using (private.is_admin());

drop policy if exists sn_all on service_notes; create policy sn_all on service_notes for all using (private.is_staff()) with check (private.is_staff());

-- 芳疗师需要看客人资料和以往配油、需求，也可以新建客人和记录需求进展
drop policy if exists m_read on members;  create policy m_read on members for select using (private.is_admin() or private.is_staff() or private.in_my_tree(id));
drop policy if exists m_staff_insert on members; create policy m_staff_insert on members for insert with check (private.is_staff());
drop policy if exists b_read on blends;   create policy b_read on blends for select using (private.is_staff() or private.can_see_health(member_id));
drop policy if exists b_staff on blends;  create policy b_staff on blends for insert with check (private.is_staff());
drop policy if exists n_read on needs;    create policy n_read on needs for select using (private.is_staff() or private.can_see_health(member_id));
drop policy if exists n_staff on needs;   create policy n_staff on needs for insert with check (private.is_staff());
drop policy if exists pr_read on profiles; create policy pr_read on profiles for select using (id = auth.uid() or private.is_admin());

-- 登入时：管理员电邮 → admin；芳疗师名单里的电邮 → therapist；其他人对应会员
create or replace function private.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare mid uuid; r text := 'member';
begin
  select id into mid from members
   where (new.email is not null and new.email <> '' and lower(email) = lower(new.email))
      or (new.phone is not null and new.phone <> '' and regexp_replace(phone,'\D','','g') = regexp_replace(new.phone,'\D','','g'))
   limit 1;
  if new.email is not null and exists (select 1 from staff s where lower(s.email) = lower(new.email) and s.active) then
    r := 'therapist';
    update staff set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  end if;
  if new.email is not null and exists (select 1 from private.admin_emails a where lower(a.email) = lower(new.email)) then r := 'admin'; end if;
  insert into profiles(id, member_id, role) values (new.id, mid, r)
    on conflict (id) do update set role = case when excluded.role in ('admin','therapist') then excluded.role else profiles.role end;
  return new;
end $function$;

-- 管理员在后台把已登入过的人加进芳疗师名单时，马上生效
create or replace function private.link_staff() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
declare uid uuid;
begin
  if new.email is null or new.email = '' then return new; end if;
  select id into uid from auth.users where lower(email) = lower(new.email) limit 1;
  if uid is not null then
    new.user_id := uid;
    update profiles set role = case when role = 'admin' then 'admin' when new.active then 'therapist' else 'member' end where id = uid;
  end if;
  return new;
end $$;
drop trigger if exists staff_link on staff;
create trigger staff_link before insert or update of email, active on staff for each row execute function private.link_staff();
alter table service_records add column if not exists therapist_name text default '';
