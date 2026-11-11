# Somsak POS — คู่มือติดตั้ง (ฟรีทั้งหมด)

ระบบขายหน้าร้านที่ **เปิดแล้วใช้ได้ทันที ไม่ต้อง login** ใช้ได้ทั้งมือถือและคอม

| ส่วน | ใช้อะไร | ค่าใช้จ่าย |
|---|---|---|
| หน้าเว็บ | GitHub Pages (`index.html`, `css/`, `js/`) | ฟรี |
| ฐานข้อมูล | Google Sheet | ฟรี |
| API | Google Apps Script Web App (`gas/Code.gs`) | ฟรี |
| รูปสินค้า/รูปบิล/รูป QR | Google Drive (โฟลเดอร์ `Somsak POS Images`) | ฟรี (15 GB) |

```
มือถือ/คอม ──https──► GitHub Pages (หน้าเว็บ)
                        │ fetch
                        ▼
                Apps Script Web App ──► Google Sheet (Products, Sales, Expenses, StockMoves, Settings)
                                    └─► Google Drive (รูป)
```

> ยังไม่ตั้งค่าอะไรเลยก็เปิดลองได้: ถ้า `GAS_URL` ว่าง ระบบจะเข้า **โหมดทดลอง** เก็บข้อมูลในเครื่องนั้นเครื่องเดียว

---

## ① สร้าง Google Sheet + Apps Script (~5 นาที)

1. เปิด https://sheets.new → ตั้งชื่อไฟล์ เช่น `Somsak POS`
2. เมนู **Extensions (ส่วนขยาย) → Apps Script**
3. ลบโค้ดเดิมใน `Code.gs` ทิ้ง → คัดลอกทั้งหมดจากไฟล์ [`gas/Code.gs`](gas/Code.gs) ไปวาง → กด 💾 Save
4. ที่แถบบน เลือกฟังก์ชัน **`setup`** → กด **Run**
   - ครั้งแรกจะขึ้น "Authorization required" → **Review permissions** → เลือกบัญชี Google
   - ถ้าขึ้น "Google hasn't verified this app" → กด **Advanced → Go to … (unsafe)** → **Allow**
     (เป็นสคริปต์ของเราเอง จึงยังไม่ผ่านการ verify — ปกติ)
   - กลับไปดูที่ Sheet จะมีแท็บ `Products`, `Sales`, `Expenses`, `StockMoves`, `Settings` ✅

## ② Deploy เป็น Web App

1. ใน Apps Script กด **Deploy → New deployment**
2. กดรูปเฟือง ⚙️ → เลือก **Web app**
3. ตั้งค่า:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`  ← ต้องเป็น Anyone (ไม่ใช่ "Anyone with Google account") ไม่งั้นหน้าเว็บเรียกไม่ได้
4. กด **Deploy** → คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)
5. ทดสอบ: เปิด URL นั้นในเบราว์เซอร์ ต่อท้ายด้วย `?action=ping` ต้องเห็น `{"ok":true,"pong":true,...}`

## ③ ใส่ URL ในโค้ด

เปิด `js/config.js`:

```js
export const GAS_URL = 'https://script.google.com/macros/s/xxxxxxxx/exec';
export const SHOP_NAME = 'ร้านของฉัน';
```

## ④ Deploy หน้าเว็บด้วย GitHub Pages

```bash
git add -A
git commit -m "Configure Google Apps Script URL"
git push
```

1. ที่ GitHub repo → **Settings → Pages**
2. **Source:** Deploy from a branch → **Branch:** `main` / `/ (root)` → **Save**
3. รอ 1–2 นาที ได้ลิงก์ `https://<username>.github.io/<repo>/`
4. เปิดลิงก์บนมือถือ → เมนูเบราว์เซอร์ → **Add to Home screen / เพิ่มไปยังหน้าจอหลัก** → ใช้เหมือนแอป

> กล้องสแกนบาร์โค้ดใช้ได้เฉพาะ **https** — GitHub Pages เป็น https อยู่แล้ว

---

## วิธีใช้งานย่อ

- **เพิ่มสินค้า:** เมนู 📦 สินค้า → **📷 สแกนเพิ่มสินค้า** → สแกนบาร์โค้ด/QR → กรอกชื่อ ราคา รายละเอียด (ถ่ายรูปได้) → บันทึก → "สแกนต่อ" ได้เรื่อยๆ
  สแกนของที่มีอยู่แล้ว → เด้งไปหน้า **รับเข้าสต๊อก** แทน
- **ขาย:** เมนู 🛒 ขาย → แตะสินค้า หรือกด 📷 สแกน หรือใช้เครื่องยิงบาร์โค้ด USB (ยิงแล้ว Enter อัตโนมัติ)
  สแกนเจอของที่ยังไม่มีในระบบ → เพิ่มสินค้าใหม่แล้วใส่ตะกร้าได้ทันที
- **ชำระเงิน:** เงินสด (คำนวณเงินทอน) หรือ QR พร้อมเพย์ (ตั้งรูป QR ครั้งเดียว ใช้ได้ทุกเครื่อง)
- **ยอดขาย:** สรุปรายวัน/เดือน/ปี, ขาย − ค่าใช้จ่ายเดือนนี้, แก้ไข/ยกเลิกบิล (คืนสต๊อกให้อัตโนมัติ)
- **ข้อมูลทั้งหมดดู/แก้ได้ใน Google Sheet** ตรงๆ (แก้ใน Sheet แล้วกด ⟳ ซิงก์ ในหน้าเว็บ)

---

## ⚠️ เรื่องความปลอดภัย (อ่านก่อนใช้จริง)

- ระบบนี้ **ไม่มี login** = ใครได้ลิงก์หน้าเว็บ (หรือ GAS URL) ก็ **เพิ่ม/แก้/ลบข้อมูลได้**
  และ repo ที่เป็น Public จะเห็น `GAS_URL` ใน `js/config.js`
- เหมาะกับร้านเล็กที่ใช้ภายใน อย่าแชร์ลิงก์ให้คนนอก
- ข้อมูลพลาด/ถูกลบ → Google Sheet มี **File → Version history** กู้คืนได้
- อย่าเก็บข้อมูลลับ (เลขบัตร, รหัสผ่าน ฯลฯ) ในระบบนี้

## แก้ `Code.gs` แล้วต้องทำอะไร?

Apps Script **ไม่อัปเดต URL เดิมให้อัตโนมัติ** ต้อง: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
(URL เดิมใช้ต่อได้ ไม่ต้องแก้ config.js)

## ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| มีป้าย "โหมดทดลอง" | ยังไม่ได้ใส่ `GAS_URL` ใน `js/config.js` หรือยังไม่ได้ push ขึ้น GitHub |
| "Apps Script ตอบกลับไม่ถูกต้อง" | Who has access ต้องเป็น **Anyone** / ใช้ URL ที่ลงท้าย `/exec` ไม่ใช่ `/dev` |
| "ไม่รู้จัก action" หลังแก้ Code.gs | ยังไม่ได้ Deploy **New version** |
| รูปสินค้าไม่ขึ้น | บัญชี Google Workspace (องค์กร/มหาลัย) บางที่ห้ามแชร์ไฟล์แบบ Anyone with link → ใช้ Gmail ส่วนตัว |
| กล้องไม่เปิด | ต้องเปิดผ่าน https และกดอนุญาตกล้อง หรือใช้ปุ่ม "ถ่ายภาพแทน"/กรอกเลขเอง |
| แก้หน้าเว็บแล้วไม่เปลี่ยน | GitHub Pages มี cache รอ 1–2 นาที แล้วรีเฟรช; ถ้ายังไม่เปลี่ยนให้เพิ่มเลข `VERSION` ใน `sw.js` |
| บาร์โค้ดใน Sheet กลายเป็นตัวเลขแปลกๆ | `setup()` ตั้งคอลัมน์เป็น Plain text ให้แล้ว — ถ้าสร้างชีตเองให้ Format → Number → Plain text |
