-- =====================================================================
-- Somsak House — อัปเดตฐานข้อมูล รอบที่ 2
-- (ล็อกอินด้วยชื่อผู้ใช้ + รูป QR + แก้ไข/ลบบิลโดย admin/tester)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ทำข้อมูลเดิมเสียหาย
-- =====================================================================

-- 1) ล็อกอินด้วยชื่อผู้ใช้ — แปลงชื่อผู้ใช้เป็นอีเมลของบัญชี (ใช้ก่อนล็อกอิน)
create or replace function public.email_for_username(uname text)
returns text language sql stable security definer set search_path = public as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(uname)) and p.active
  limit 1
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- 2) แก้ไข/ลบบิลได้เฉพาะ admin/tester (ของเดิมอนุญาต update/delete เฉพาะ admin+ อยู่แล้ว
--    ตรงนี้เขียนทับให้ชัดเจนอีกครั้ง เผื่อ schema เดิมยังไม่ครบ)
drop policy if exists sales_write on public.sales;
create policy sales_write on public.sales for update using (my_role() in ('tester','admin'));
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete using (my_role() in ('tester','admin'));

-- 3) รูป QR เก็บใน settings (แก้ไขได้เฉพาะ admin/tester ตามนโยบายเดิมของ settings)
insert into public.settings (id, data)
values ('qrImage', '{"key":"qrImage","image":null}')
on conflict (id) do nothing;

-- =====================================================================
-- ตรวจผล: ควรได้อีเมลของบัญชีคืนมา (แก้ชื่อผู้ใช้เป็นของคุณ)
-- select public.email_for_username('Tester');
-- =====================================================================
