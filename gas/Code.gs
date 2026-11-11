/**
 * Somsak POS — Google Apps Script backend
 * ----------------------------------------------------------------------------
 * วิธีใช้ (ดูรายละเอียดใน SETUP.md):
 *   1. สร้าง Google Sheet ใหม่ → Extensions → Apps Script → วางไฟล์นี้ทั้งหมด
 *   2. เลือกฟังก์ชัน setup แล้วกด Run (ครั้งแรกจะขออนุญาตเข้าถึง Sheet/Drive)
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone
 *   4. คัดลอก Web app URL ไปใส่ใน js/config.js (GAS_URL)
 *
 * API:
 *   GET  ?action=list                 → { ok, products, sales, expenses, settings }
 *   POST body = JSON { action, data } → { ok, ...result }
 *   (frontend ส่งเป็น Content-Type: text/plain เพื่อไม่ให้เกิด CORS preflight)
 */

const TZ = 'Asia/Bangkok';
// ID ของ Google Sheet (ส่วนกลางของ URL .../spreadsheets/d/<ID>/edit)
// เว้นว่างได้ถ้าสร้างสคริปต์จากเมนู Extensions → Apps Script ของ Sheet นั้นโดยตรง
const SHEET_ID = '';
const IMAGE_FOLDER_NAME = 'Somsak POS Images';
const MAX_SALES_RETURNED = 1000;

const SCHEMA = {
  Products:   ['id', 'barcode', 'name', 'detail', 'category', 'price', 'cost', 'stock', 'minStock', 'image', 'updatedAt'],
  Sales:      ['id', 'billNo', 'ts', 'datetime', 'total', 'payMethod', 'received', 'change', 'items', 'editedAt'],
  Expenses:   ['id', 'date', 'ts', 'title', 'amount', 'note', 'image', 'createdAt'],
  StockMoves: ['id', 'ts', 'datetime', 'productId', 'productName', 'type', 'qty', 'note'],
  Settings:   ['key', 'value'],
};

// ฟิลด์ที่เป็นตัวเลข (ทุกคอลัมน์ตั้งเป็น Plain text เพื่อไม่ให้ Sheets แปลงบาร์โค้ด/วันที่เอง)
const NUM_FIELDS = {
  price: 1, cost: 1, stock: 1, minStock: 1, updatedAt: 1, ts: 1, total: 1, received: 1,
  change: 1, editedAt: 1, amount: 1, createdAt: 1, qty: 1,
};
const NULLABLE_NUM = { received: 1 };
const JSON_FIELDS = { items: 1 };

/* ============================== entry points ============================== */

function doGet(e) {
  return respond_(function () {
    const action = (e && e.parameter && e.parameter.action) || 'list';
    if (action === 'ping') return { pong: true, time: Date.now() };
    if (action === 'list') return listAll_();
    throw new Error('ไม่รู้จัก action: ' + action);
  });
}

function doPost(e) {
  return respond_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = ACTIONS[body.action];
    if (!fn) throw new Error('ไม่รู้จัก action: ' + body.action);
    // ล็อกกันสองเครื่องเขียนพร้อมกัน (เช่น ตัดสต๊อก/ออกเลขบิลชนกัน)
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      return fn(body.data || {});
    } finally {
      lock.releaseLock();
    }
  });
}

function respond_(fn) {
  let out;
  try {
    out = Object.assign({ ok: true }, fn());
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/** รันครั้งแรกจาก editor: สร้างชีตทั้งหมด + โฟลเดอร์รูป */
function setup() {
  Object.keys(SCHEMA).forEach(sheet_);
  const ss = ss_();
  ['Sheet1', 'แผ่นงาน1', 'ชีต1'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  const folder = folder_();
  Logger.log('พร้อมใช้งาน ✅  โฟลเดอร์รูป: ' + folder.getUrl());
  Logger.log('ขั้นต่อไป: Deploy → New deployment → Web app (Execute as: Me, Access: Anyone)');
}

/* ================================ actions ================================= */

const ACTIONS = {
  upsertProduct: upsertProduct_,
  deleteProduct: deleteProduct_,
  adjustStock: adjustStock_,
  checkout: checkout_,
  updateSale: updateSale_,
  deleteSale: deleteSale_,
  addExpense: addExpense_,
  deleteExpense: deleteExpense_,
  uploadImage: uploadImage_,
  setSetting: setSetting_,
};

function listAll_() {
  const sales = readAll_('Sales').sort(function (a, b) { return b.ts - a.ts; });
  const expenses = readAll_('Expenses').sort(function (a, b) { return b.ts - a.ts; });
  const settings = {};
  readAll_('Settings').forEach(function (r) { settings[r.key] = r.value; });
  return {
    products: readAll_('Products'),
    sales: sales.slice(0, MAX_SALES_RETURNED),
    expenses: expenses,
    settings: settings,
  };
}

function upsertProduct_(p) {
  const name = String(p.name || '').trim();
  if (!name) throw new Error('กรุณากรอกชื่อสินค้า');
  const barcode = String(p.barcode || '').trim();
  const id = p.id || Utilities.getUuid();
  if (barcode) {
    const dup = readAll_('Products').filter(function (x) { return x.barcode === barcode && x.id !== id; })[0];
    if (dup) throw new Error('บาร์โค้ด ' + barcode + ' ซ้ำกับสินค้า "' + dup.name + '"');
  }
  const old = getById_('Products', id);
  const rec = {
    id: id,
    barcode: barcode,
    name: name,
    detail: String(p.detail || '').trim(),
    category: String(p.category || '').trim(),
    price: Math.max(0, Number(p.price) || 0),
    cost: Math.max(0, Number(p.cost) || 0),
    stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
    minStock: Math.max(0, Math.floor(Number(p.minStock) || 0)),
    image: String(p.image || ''),
    updatedAt: Date.now(),
  };
  writeRow_('Products', rec);
  const oldStock = old ? old.stock : 0;
  if (rec.stock !== oldStock) {
    logMove_(rec, old ? 'adjust' : 'in', rec.stock - oldStock, old ? 'แก้ไขจากหน้าสินค้า' : 'ตั้งต้นสินค้าใหม่');
  }
  if (old && old.image && old.image !== rec.image) trashImage_(old.image);
  return { product: rec };
}

function deleteProduct_(d) {
  const old = getById_('Products', d.id);
  if (!old) throw new Error('ไม่พบสินค้า');
  deleteRow_('Products', d.id);
  if (old.image) trashImage_(old.image);
  return { deleted: { type: 'products', id: d.id } };
}

function adjustStock_(d) {
  const p = getById_('Products', d.productId);
  if (!p) throw new Error('ไม่พบสินค้า');
  const qty = Math.floor(Number(d.qty) || 0);
  if (!qty) throw new Error('จำนวนต้องไม่เป็น 0');
  const before = p.stock;
  p.stock = Math.max(0, p.stock + qty);
  p.updatedAt = Date.now();
  writeRow_('Products', p);
  logMove_(p, qty > 0 ? 'in' : 'adjust', p.stock - before, d.note || (qty > 0 ? 'รับสินค้าเข้า' : 'ปรับลดสต๊อก'));
  return { product: p };
}

function checkout_(d) {
  const items = cleanItems_(d.items);
  if (!items.length) throw new Error('ตะกร้าว่าง');

  // รวมจำนวนต่อสินค้า แล้วเช็กสต๊อกทั้งหมดก่อน ค่อยตัดจริง (all-or-nothing)
  const need = {};
  items.forEach(function (i) { if (i.productId) need[i.productId] = (need[i.productId] || 0) + i.qty; });
  const prods = {};
  Object.keys(need).forEach(function (pid) {
    const p = getById_('Products', pid);
    if (!p) throw new Error('ไม่พบสินค้าในระบบ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่');
    if (p.stock < need[pid]) throw new Error('สต๊อก "' + p.name + '" ไม่พอ (เหลือ ' + p.stock + ')');
    prods[pid] = p;
  });

  const total = round2_(items.reduce(function (s, i) { return s + i.price * i.qty; }, 0));
  const payMethod = d.payMethod === 'qr' ? 'qr' : 'cash';
  let received = null, change = 0;
  if (payMethod === 'cash') {
    received = Number(d.received);
    if (!isFinite(received) || received + 0.005 < total) throw new Error('รับเงินมาไม่พอ');
    change = round2_(received - total);
  }

  const billNo = nextBillNo_();
  const ts = Date.now();
  const updated = [];
  Object.keys(need).forEach(function (pid) {
    const p = prods[pid];
    p.stock -= need[pid];
    p.updatedAt = ts;
    writeRow_('Products', p);
    logMove_(p, 'sale', -need[pid], 'ขายบิล ' + billNo);
    updated.push(p);
  });

  const sale = {
    id: Utilities.getUuid(), billNo: billNo, ts: ts, datetime: fmtTime_(ts),
    total: total, payMethod: payMethod, received: received, change: change,
    items: items, editedAt: 0,
  };
  writeRow_('Sales', sale);
  return { sale: sale, products: updated };
}

function updateSale_(d) {
  const old = getById_('Sales', d.id);
  if (!old) throw new Error('ไม่พบบิล');
  const items = cleanItems_(d.items);
  if (!items.length) throw new Error('บิลต้องมีอย่างน้อย 1 รายการ');

  // ผลต่าง: (จำนวนเดิม - จำนวนใหม่) → ค่าบวก = คืนของเข้าสต๊อก
  const diff = {};
  old.items.forEach(function (i) { if (i.productId) diff[i.productId] = (diff[i.productId] || 0) + Number(i.qty || 0); });
  items.forEach(function (i) { if (i.productId) diff[i.productId] = (diff[i.productId] || 0) - i.qty; });
  const products = applyStockDiff_(diff, 'แก้ไขบิล ' + old.billNo);

  const total = d.total != null ? Math.max(0, Number(d.total) || 0) : round2_(items.reduce(function (s, i) { return s + i.price * i.qty; }, 0));
  const payMethod = d.payMethod === 'qr' ? 'qr' : 'cash';
  const received = payMethod === 'cash' && d.received != null && d.received !== '' ? Number(d.received) : null;
  const ts = Number(d.ts) || old.ts;
  const sale = Object.assign({}, old, {
    billNo: String(d.billNo || old.billNo).trim(),
    ts: ts, datetime: fmtTime_(ts), total: round2_(total), items: items,
    payMethod: payMethod, received: received,
    change: received != null ? round2_(received - total) : 0,
    editedAt: Date.now(),
  });
  writeRow_('Sales', sale);
  return { sale: sale, products: products };
}

function deleteSale_(d) {
  const old = getById_('Sales', d.id);
  if (!old) throw new Error('ไม่พบบิล');
  const diff = {};
  old.items.forEach(function (i) { if (i.productId) diff[i.productId] = (diff[i.productId] || 0) + Number(i.qty || 0); });
  const products = applyStockDiff_(diff, 'ยกเลิกบิล ' + old.billNo);
  deleteRow_('Sales', d.id);
  return { deleted: { type: 'sales', id: d.id }, products: products };
}

function addExpense_(x) {
  const title = String(x.title || '').trim();
  const amount = Number(x.amount);
  const date = String(x.date || '').trim();
  if (!title || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('กรอกข้อมูลให้ครบถ้วน');
  const rec = {
    id: x.id || Utilities.getUuid(), date: date,
    ts: new Date(date + 'T12:00:00+07:00').getTime(),
    title: title, amount: round2_(amount), note: String(x.note || '').trim(),
    image: String(x.image || ''), createdAt: Date.now(),
  };
  writeRow_('Expenses', rec);
  return { expense: rec };
}

function deleteExpense_(d) {
  const old = getById_('Expenses', d.id);
  if (!old) throw new Error('ไม่พบรายการ');
  deleteRow_('Expenses', d.id);
  if (old.image) trashImage_(old.image);
  return { deleted: { type: 'expenses', id: d.id } };
}

function uploadImage_(d) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(d.dataUrl || ''));
  if (!m) throw new Error('ไฟล์รูปไม่ถูกต้อง');
  if (!/^image\//.test(m[1])) throw new Error('รองรับเฉพาะไฟล์รูป');
  const name = String(d.name || 'img').replace(/[^\w.-]/g, '_') + '_' + Date.now() + '.jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
  const file = folder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800', fileId: file.getId() };
}

function setSetting_(d) {
  const key = String(d.key || '').trim();
  if (!key) throw new Error('ไม่มี key');
  const old = getById_('Settings', key);
  const value = d.value == null ? '' : String(d.value);
  writeRow_('Settings', { key: key, value: value });
  if (old && old.value && old.value !== value && /drive\.google\.com/.test(old.value)) trashImage_(old.value);
  return { setting: { key: key, value: value } };
}

/* ================================ helpers ================================= */

function cleanItems_(items) {
  return (items || []).map(function (i) {
    return {
      productId: i.productId ? String(i.productId) : null,
      name: String(i.name || '').trim(),
      price: Math.max(0, Number(i.price) || 0),
      qty: Math.max(0, Math.floor(Number(i.qty) || 0)),
    };
  }).filter(function (i) { return i.qty > 0 && i.name; });
}

function applyStockDiff_(diff, note) {
  const out = [];
  Object.keys(diff).forEach(function (pid) {
    const delta = diff[pid];
    if (!delta) return;
    const p = getById_('Products', pid);
    if (!p) return; // สินค้าถูกลบไปแล้ว ข้าม
    const before = p.stock;
    p.stock = Math.max(0, p.stock + delta);
    p.updatedAt = Date.now();
    writeRow_('Products', p);
    logMove_(p, 'adjust', p.stock - before, note);
    out.push(p);
  });
  return out;
}

function logMove_(p, type, qty, note) {
  const ts = Date.now();
  writeRow_('StockMoves', {
    id: Utilities.getUuid(), ts: ts, datetime: fmtTime_(ts),
    productId: p.id, productName: p.name, type: type, qty: qty, note: note || '',
  });
}

// เลขบิลรายวัน: yyMMdd-0001 (รันภายใต้ lock จึงไม่ซ้ำ)
function nextBillNo_() {
  const props = PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  const seq = props.getProperty('billDay') === day ? Number(props.getProperty('billSeq') || 0) + 1 : 1;
  props.setProperties({ billDay: day, billSeq: String(seq) });
  return day + '-' + ('000' + seq).slice(-4);
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('folderId');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* ถูกลบไป สร้างใหม่ */ }
  }
  const f = DriveApp.createFolder(IMAGE_FOLDER_NAME);
  props.setProperty('folderId', f.getId());
  return f;
}

function trashImage_(url) {
  const m = /[?&]id=([\w-]+)/.exec(String(url));
  if (!m) return;
  try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* ไม่ใช่ไฟล์ของเรา/ลบไปแล้ว */ }
}

function fmtTime_(ts) { return Utilities.formatDate(new Date(ts), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function round2_(n) { return Math.round(n * 100) / 100; }

/* --------------------------- sheet row <-> object -------------------------- */

function ss_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const head = SCHEMA[name];
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e6f4f1');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const head = SCHEMA[name];
  return sh.getRange(2, 1, last - 1, head.length).getValues()
    .filter(function (r) { return r[0] !== ''; })
    .map(function (r) { return toObj_(head, r); });
}

function findRow_(name, id) {
  const sh = sheet_(name);
  if (sh.getLastRow() < 2 || !id) return 0;
  const hit = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function getById_(name, id) {
  const row = findRow_(name, id);
  if (!row) return null;
  const head = SCHEMA[name];
  return toObj_(head, sheet_(name).getRange(row, 1, 1, head.length).getValues()[0]);
}

function writeRow_(name, obj) {
  const sh = sheet_(name);
  const head = SCHEMA[name];
  let row = findRow_(name, obj[head[0]]);
  if (!row) row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, head.length).setNumberFormat('@').setValues([toRow_(head, obj)]);
}

function deleteRow_(name, id) {
  const row = findRow_(name, id);
  if (row) sheet_(name).deleteRow(row);
}

function toObj_(head, r) {
  const o = {};
  head.forEach(function (h, i) {
    let v = r[i];
    if (v instanceof Date) v = Utilities.formatDate(v, TZ, h === 'date' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
    if (NUM_FIELDS[h]) {
      o[h] = v === '' || v == null ? (NULLABLE_NUM[h] ? null : 0) : Number(v) || 0;
    } else if (JSON_FIELDS[h]) {
      try { o[h] = v ? JSON.parse(v) : []; } catch (e) { o[h] = []; }
    } else {
      o[h] = v == null ? '' : String(v);
    }
  });
  return o;
}

function toRow_(head, o) {
  return head.map(function (h) {
    const v = o[h];
    if (v == null) return '';
    if (JSON_FIELDS[h]) return JSON.stringify(v);
    if (NUM_FIELDS[h]) return String(Number(v) || 0);
    const s = String(v);
    return s.charAt(0) === '=' ? "'" + s : s; // กันไม่ให้ข้อความกลายเป็นสูตร (formula injection)
  });
}
