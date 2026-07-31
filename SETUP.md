# Somsak House (Cloud) — คู่มือติดตั้ง Supabase + GitHub Pages

เวอร์ชันนี้เก็บข้อมูลบน **Supabase** (ฐานข้อมูลกลางบนคลาวด์) — ทุกเครื่องที่เปิดเว็บจะเห็นข้อมูลชุดเดียวกัน ล็อกอินด้วย **อีเมล + รหัสผ่าน** (Supabase Auth)

ทำตาม 3 ขั้นตอนใหญ่: ① ตั้งค่า Supabase → ② ใส่ key ในโค้ด → ③ เอาขึ้น GitHub Pages

---

## ① ตั้งค่า Supabase (ครั้งเดียว ~10 นาที)

1. สมัคร/ล็อกอินที่ https://supabase.com (ฟรี)
2. กด **New project** → ตั้งชื่อ เช่น `somsak-house` → ตั้งรหัสผ่านฐานข้อมูล (จดไว้) → เลือก Region ใกล้ไทย (Singapore) → **Create**
3. รอโปรเจกต์สร้างเสร็จ แล้วไปที่เมนู **SQL Editor** → **New query** → เปิดไฟล์ `schema.sql` ในโฟลเดอร์นี้ คัดลอกทั้งหมดมาวาง → กด **Run**
   ต้องขึ้น "Success. No rows returned"
4. (แนะนำ ทำให้สมัครง่าย) ปิดการยืนยันอีเมล: เมนู **Authentication → Sign In / Providers → Email** → ปิด **Confirm email** → Save
   (ถ้าเปิดทิ้งไว้ ผู้สมัครต้องกดลิงก์ยืนยันในอีเมลก่อนถึงจะล็อกอินได้)
5. เก็บค่าเชื่อมต่อ: เมนู **Settings → API**
   - **Project URL** เช่น `https://abcd1234.supabase.co`
   - **anon public** key (ตัวยาวๆ)

## ② ใส่ค่าในโค้ด

เปิดไฟล์ `js/config.js` แล้วแทนที่สองค่านี้:

```js
export const SUPABASE_URL = 'https://abcd1234.supabase.co';      // Project URL ของคุณ
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';                 // anon public key ของคุณ
```

> anon key ออกแบบมาให้อยู่ในหน้าเว็บได้ ไม่ใช่ความลับ — ความปลอดภัยคุมด้วย RLS ที่ตั้งไว้ใน schema.sql แล้ว (**ห้าม**เอา `service_role` key มาใส่เด็ดขาด)

## ③ เอาขึ้น GitHub Pages

1. สมัคร/ล็อกอิน https://github.com → กด **New repository** → ตั้งชื่อ เช่น `somsak-house` → **Public** → Create
2. ในหน้า repo กด **uploading an existing file** → ลากไฟล์ทั้งโฟลเดอร์นี้ลงไป (index.html, css/, js/ — ไม่ต้องเอา schema.sql/SETUP.md ขึ้นก็ได้ แต่ขึ้นไปด้วยก็ไม่เสียหาย) → **Commit changes**
   ⚠️ ให้ `index.html` อยู่ระดับบนสุดของ repo ไม่ใช่อยู่ในโฟลเดอร์ย่อย
3. ไปที่ **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / โฟลเดอร์ `/ (root)` → **Save**
4. รอ 1–2 นาที จะได้ลิงก์ `https://<ชื่อผู้ใช้>.github.io/somsak-house/` — แชร์ลิงก์นี้ให้เครื่องไหนเปิดก็ได้ ข้อมูลเชื่อมกันหมด

## ④ สร้างบัญชีแรกและตั้งเป็น tester

1. เปิดเว็บ → กด **สมัครสมาชิก** → กรอกอีเมล/ชื่อผู้ใช้/รหัสผ่าน
2. กลับไปที่ Supabase → **SQL Editor** → รัน (แก้อีเมลเป็นของคุณ):
   ```sql
   update public.profiles set role = 'tester'
     where id = (select id from auth.users where email = 'you@example.com');
   ```
3. ล็อกอินใหม่ → จะเห็นครบทุกเมนูรวม "จัดการผู้ใช้ & สิทธิ์"
   คนอื่นสมัครเองได้ (ได้ role member) แล้ว tester/admin ค่อยปรับบทบาท/สิทธิ์/assign ห้องให้

---

## เรื่องที่เปลี่ยนไปจากเวอร์ชัน Local

- ล็อกอินด้วย **อีเมล** แทนชื่อผู้ใช้ (ชื่อผู้ใช้ยังมี ใช้แสดงในระบบ) — ไม่มีบัญชี `Tester` ตั้งต้นแล้ว ใช้วิธีข้อ ④ แทน
- รีเซ็ตรหัสผ่าน: กด "ลืมรหัสผ่าน?" หน้า login ระบบส่งลิงก์ทางอีเมล (แอดมินรีเซ็ตแทนไม่ได้)
- สิทธิ์ถูกบังคับซ้ำที่ฐานข้อมูล (RLS): member เห็นบิลเช่าเฉพาะห้องตัวเอง, การแก้ไขข้อมูลหลักทำได้เฉพาะ admin/tester ฯลฯ
- Export/Import ยังใช้ได้ (สำรองเพิ่มอีกชั้น) แต่ Supabase มีสำรองของตัวเองอยู่แล้ว
- รูปสินค้า/รูปบิลยังเก็บแบบฝังในฐานข้อมูล (บีบอัดแล้ว) — ถ้ารูปเยอะมากในอนาคตค่อยย้ายไป Supabase Storage

## ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| ขึ้น "ยังไม่ได้ตั้งค่า Supabase" | ยังไม่ได้แก้ `js/config.js` หรือแก้แล้วยังไม่ได้ commit ขึ้น GitHub |
| สมัครแล้วล็อกอินไม่ได้ | ยังไม่ปิด Confirm email (ข้อ ①.4) หรือยังไม่กดลิงก์ยืนยันในอีเมล |
| ล็อกอินได้แต่ขึ้น error อ่านข้อมูล | ยังไม่ได้รัน `schema.sql` หรือรันไม่ครบ ให้รันใหม่ทั้งไฟล์ |
| แก้โค้ดแล้วเว็บไม่เปลี่ยน | GitHub Pages มี cache รอ 1–2 นาที แล้วกด Ctrl+F5 |
