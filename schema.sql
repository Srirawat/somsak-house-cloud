-- =====================================================================
-- Somsak House (Cloud) — Supabase schema
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
-- รันซ้ำได้ (idempotent)
-- =====================================================================

-- ---------- 1) ตารางโปรไฟล์ผู้ใช้ (ผูกกับ Supabase Auth) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null default 'member' check (role in ('tester','admin','member')),
  active boolean not null default true,
  perms jsonb,
  room text,
  created_at timestamptz not null default now()
);

-- สร้างโปรไฟล์อัตโนมัติเมื่อมีคนสมัครสมาชิก (role = member)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2) ตารางข้อมูลของแอป (id + jsonb เข้ากับโค้ดเดิม) ----------
create table if not exists public.products       (id text primary key, data jsonb not null);
create table if not exists public.stock_moves    (id text primary key, data jsonb not null);
create table if not exists public.sales          (id text primary key, data jsonb not null);
create table if not exists public.expenses       (id text primary key, data jsonb not null);
create table if not exists public.rental_records (id text primary key, data jsonb not null);
create table if not exists public.settings       (id text primary key, data jsonb not null);

create index if not exists idx_moves_product on public.stock_moves ((data->>'productId'));
create index if not exists idx_rental_room   on public.rental_records ((data->>'room'));

-- ค่าตั้งต้น
insert into public.settings (id, data) values
  ('copayRatio',  '{"key":"copayRatio","self":0.4,"state":0.6}'),
  ('rentalRates', '{"key":"rentalRates","water":18,"electric":8,"rent":3000}'),
  ('billCounter', '{"key":"billCounter","value":0}')
on conflict (id) do nothing;

-- ---------- 3) ฟังก์ชันช่วย ----------
-- บทบาทของผู้ใช้ที่ล็อกอินอยู่ (null ถ้าไม่ได้ล็อกอิน/ถูกระงับ)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

-- ห้องเช่าที่ผู้ใช้ถูก assign
create or replace function public.my_room()
returns text language sql stable security definer set search_path = public as $$
  select room from public.profiles where id = auth.uid() and active
$$;

-- เลขบิลกลาง (กันชนกันเมื่อขายพร้อมกันหลายเครื่อง)
create or replace function public.next_bill_no()
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if my_role() is null then
    raise exception 'not allowed';
  end if;
  update public.settings
    set data = jsonb_set(data, '{value}', to_jsonb(coalesce((data->>'value')::int, 0) + 1))
    where id = 'billCounter'
    returning (data->>'value')::int into n;
  return 'INV-' || to_char(now() at time zone 'Asia/Bangkok', 'YYYYMMDD') || '-' || lpad(n::text, 4, '0');
end $$;

-- ---------- 4) Row Level Security ----------
alter table public.profiles       enable row level security;
alter table public.products       enable row level security;
alter table public.stock_moves    enable row level security;
alter table public.sales          enable row level security;
alter table public.expenses       enable row level security;
alter table public.rental_records enable row level security;
alter table public.settings       enable row level security;

-- profiles: เห็นของตัวเอง / tester+admin เห็นทุกคน
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or my_role() in ('tester','admin'));

-- profiles: tester แก้ได้ทุกคน / admin แก้ได้เฉพาะ member (ห้ามตั้งใครเป็น tester)
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (my_role() = 'tester' or (my_role() = 'admin' and role = 'member'))
  with check (role in ('member','admin') or my_role() = 'tester');

-- products: ทุกคนที่ล็อกอินอ่านได้ / เพิ่ม-ลบโดย admin+ / อัปเดตโดยทุกคนที่ล็อกอิน (POS ตัดสต๊อก)
drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (my_role() is not null);
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert with check (my_role() in ('tester','admin'));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update using (my_role() is not null);
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete using (my_role() in ('tester','admin'));

-- sales / stock_moves: อ่าน+เพิ่มโดยทุกคนที่ล็อกอิน (POS) / แก้-ลบโดย admin+
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select using (my_role() is not null);
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert with check (my_role() is not null);
drop policy if exists sales_write on public.sales;
create policy sales_write on public.sales for update using (my_role() in ('tester','admin'));
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete using (my_role() in ('tester','admin'));

drop policy if exists moves_select on public.stock_moves;
create policy moves_select on public.stock_moves for select using (my_role() is not null);
drop policy if exists moves_insert on public.stock_moves;
create policy moves_insert on public.stock_moves for insert with check (my_role() is not null);
drop policy if exists moves_write on public.stock_moves;
create policy moves_write on public.stock_moves for update using (my_role() in ('tester','admin'));
drop policy if exists moves_delete on public.stock_moves;
create policy moves_delete on public.stock_moves for delete using (my_role() in ('tester','admin'));

-- expenses: ทุกคนที่ล็อกอินอ่าน/เพิ่มได้ / แก้-ลบโดย admin+
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select using (my_role() is not null);
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert with check (my_role() is not null);
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update using (my_role() in ('tester','admin'));
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete using (my_role() in ('tester','admin'));

-- rental_records: admin+ เห็นทุกห้อง / member เห็นเฉพาะห้องที่ถูก assign (อ่านอย่างเดียว)
drop policy if exists rental_select on public.rental_records;
create policy rental_select on public.rental_records for select
  using (my_role() in ('tester','admin') or (data->>'room') = my_room());
drop policy if exists rental_insert on public.rental_records;
create policy rental_insert on public.rental_records for insert with check (my_role() in ('tester','admin'));
drop policy if exists rental_update on public.rental_records;
create policy rental_update on public.rental_records for update using (my_role() in ('tester','admin'));
drop policy if exists rental_delete on public.rental_records;
create policy rental_delete on public.rental_records for delete using (my_role() in ('tester','admin'));

-- settings: ทุกคนที่ล็อกอินอ่านได้ / แก้โดย admin+ (billCounter เพิ่มผ่าน next_bill_no ซึ่งเป็น security definer)
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using (my_role() is not null);
drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings for insert with check (my_role() in ('tester','admin'));
drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings for update using (my_role() in ('tester','admin'));
drop policy if exists settings_delete on public.settings;
create policy settings_delete on public.settings for delete using (my_role() in ('tester','admin'));

-- =====================================================================
-- 5) หลังสมัครบัญชีแรกของคุณผ่านหน้าเว็บแล้ว ให้รันบรรทัดนี้เพื่อตั้งเป็น tester
--    (แก้อีเมลเป็นของคุณ)
-- =====================================================================
-- update public.profiles set role = 'tester'
--   where id = (select id from auth.users where email = 'you@example.com');
