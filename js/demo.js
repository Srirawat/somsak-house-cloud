// demo.js — "โหมดทดลอง" จำลอง Apps Script ด้วย localStorage (ใช้เมื่อ GAS_URL ว่าง)
// ตรรกะเหมือน gas/Code.gs เพื่อให้ทดสอบหน้าเว็บได้โดยยังไม่ต้องมี Google Sheet
const KEY = 'somsakpos.demo.v1';

const SAMPLE = [
  { name: 'น้ำดื่ม 600ml', barcode: '8850999320014', category: 'เครื่องดื่ม', price: 10, stock: 48 },
  { name: 'มาม่า ต้มยำกุ้ง', barcode: '8850987101021', category: 'อาหารแห้ง', price: 7, stock: 60 },
  { name: 'ไข่ไก่ (ฟอง)', barcode: '2000000000017', category: 'ของสด', price: 5, stock: 30 },
  { name: 'กาแฟกระป๋อง', barcode: '8851952350018', category: 'เครื่องดื่ม', price: 15, stock: 2, minStock: 5 },
];

function rid() { return globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2); }

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return s;
  } catch { /* ignore */ }
  const now = Date.now();
  return {
    products: SAMPLE.map(p => ({ id: rid(), detail: '', cost: 0, minStock: 3, image: '', updatedAt: now, ...p })),
    sales: [], expenses: [], settings: {}, moves: [], billDay: '', billSeq: 0,
  };
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

const round2 = n => Math.round(n * 100) / 100;
const clean = items => (items || []).map(i => ({
  productId: i.productId || null, name: String(i.name || '').trim(),
  price: Math.max(0, +i.price || 0), qty: Math.max(0, Math.floor(+i.qty || 0)),
})).filter(i => i.qty > 0 && i.name);

function applyDiff(s, diff, note) {
  const out = [];
  for (const [pid, d] of Object.entries(diff)) {
    const p = s.products.find(x => x.id === pid);
    if (!p || !d) continue;
    p.stock = Math.max(0, p.stock + d);
    s.moves.push({ ts: Date.now(), productId: pid, qty: d, note });
    out.push({ ...p });
  }
  return out;
}

const ACTIONS = {
  list: s => ({ products: s.products, sales: s.sales, expenses: s.expenses, settings: s.settings }),

  upsertProduct(s, p) {
    if (!String(p.name || '').trim()) throw new Error('กรุณากรอกชื่อสินค้า');
    const id = p.id || rid();
    const barcode = String(p.barcode || '').trim();
    const dup = barcode && s.products.find(x => x.barcode === barcode && x.id !== id);
    if (dup) throw new Error(`บาร์โค้ด ${barcode} ซ้ำกับสินค้า "${dup.name}"`);
    const rec = {
      id, barcode, name: p.name.trim(), detail: String(p.detail || '').trim(),
      category: String(p.category || '').trim(), price: Math.max(0, +p.price || 0), cost: Math.max(0, +p.cost || 0),
      stock: Math.max(0, Math.floor(+p.stock || 0)), minStock: Math.max(0, Math.floor(+p.minStock || 0)),
      image: p.image || '', updatedAt: Date.now(),
    };
    const i = s.products.findIndex(x => x.id === id);
    if (i >= 0) s.products[i] = rec; else s.products.push(rec);
    return { product: rec };
  },

  deleteProduct(s, { id }) {
    s.products = s.products.filter(x => x.id !== id);
    return { deleted: { type: 'products', id } };
  },

  adjustStock(s, { productId, qty, note }) {
    const p = s.products.find(x => x.id === productId);
    if (!p) throw new Error('ไม่พบสินค้า');
    p.stock = Math.max(0, p.stock + Math.floor(+qty || 0));
    s.moves.push({ ts: Date.now(), productId, qty, note });
    return { product: { ...p } };
  },

  checkout(s, d) {
    const items = clean(d.items);
    if (!items.length) throw new Error('ตะกร้าว่าง');
    const need = {};
    items.forEach(i => { if (i.productId) need[i.productId] = (need[i.productId] || 0) + i.qty; });
    for (const [pid, q] of Object.entries(need)) {
      const p = s.products.find(x => x.id === pid);
      if (!p) throw new Error('ไม่พบสินค้าในระบบ');
      if (p.stock < q) throw new Error(`สต๊อก "${p.name}" ไม่พอ (เหลือ ${p.stock})`);
    }
    const total = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
    const payMethod = d.payMethod === 'qr' ? 'qr' : 'cash';
    let received = null, change = 0;
    if (payMethod === 'cash') {
      received = +d.received;
      if (!(received + 0.005 >= total)) throw new Error('รับเงินมาไม่พอ');
      change = round2(received - total);
    }
    const now = new Date();
    const day = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    s.billSeq = s.billDay === day ? s.billSeq + 1 : 1;
    s.billDay = day;
    const billNo = `${day}-${String(s.billSeq).padStart(4, '0')}`;
    const products = applyDiff(s, Object.fromEntries(Object.entries(need).map(([k, v]) => [k, -v])), 'ขายบิล ' + billNo);
    const sale = { id: rid(), billNo, ts: now.getTime(), total, payMethod, received, change, items, editedAt: 0 };
    s.sales.unshift(sale);
    return { sale, products };
  },

  updateSale(s, d) {
    const old = s.sales.find(x => x.id === d.id);
    if (!old) throw new Error('ไม่พบบิล');
    const items = clean(d.items);
    if (!items.length) throw new Error('บิลต้องมีอย่างน้อย 1 รายการ');
    const diff = {};
    old.items.forEach(i => { if (i.productId) diff[i.productId] = (diff[i.productId] || 0) + i.qty; });
    items.forEach(i => { if (i.productId) diff[i.productId] = (diff[i.productId] || 0) - i.qty; });
    const products = applyDiff(s, diff, 'แก้ไขบิล ' + old.billNo);
    const total = round2(d.total != null ? Math.max(0, +d.total || 0) : items.reduce((a, i) => a + i.price * i.qty, 0));
    const payMethod = d.payMethod === 'qr' ? 'qr' : 'cash';
    const received = payMethod === 'cash' && d.received != null && d.received !== '' ? +d.received : null;
    Object.assign(old, {
      billNo: String(d.billNo || old.billNo).trim(), ts: +d.ts || old.ts, total, items, payMethod, received,
      change: received != null ? round2(received - total) : 0, editedAt: Date.now(),
    });
    return { sale: { ...old }, products };
  },

  deleteSale(s, { id }) {
    const old = s.sales.find(x => x.id === id);
    if (!old) throw new Error('ไม่พบบิล');
    const diff = {};
    old.items.forEach(i => { if (i.productId) diff[i.productId] = (diff[i.productId] || 0) + i.qty; });
    const products = applyDiff(s, diff, 'ยกเลิกบิล ' + old.billNo);
    s.sales = s.sales.filter(x => x.id !== id);
    return { deleted: { type: 'sales', id }, products };
  },

  addExpense(s, x) {
    if (!String(x.title || '').trim() || !(+x.amount > 0) || !x.date) throw new Error('กรอกข้อมูลให้ครบถ้วน');
    const rec = {
      id: rid(), date: x.date, ts: new Date(x.date + 'T12:00:00').getTime(), title: x.title.trim(),
      amount: round2(+x.amount), note: String(x.note || '').trim(), image: x.image || '', createdAt: Date.now(),
    };
    s.expenses.unshift(rec);
    return { expense: rec };
  },

  deleteExpense(s, { id }) {
    s.expenses = s.expenses.filter(x => x.id !== id);
    return { deleted: { type: 'expenses', id } };
  },

  uploadImage: (s, { dataUrl }) => ({ url: dataUrl }), // โหมดทดลอง: เก็บรูปเป็น dataURL ในเครื่อง

  setSetting(s, { key, value }) {
    s.settings[key] = value ?? '';
    return { setting: { key, value: s.settings[key] } };
  },
};

export async function handle(action, data) {
  await new Promise(r => setTimeout(r, 150)); // จำลองความหน่วงเครือข่ายเล็กน้อย
  const fn = ACTIONS[action];
  if (!fn) throw new Error('ไม่รู้จัก action: ' + action);
  const s = load();
  const out = fn(s, data || {});
  // structuredClone กันไม่ให้ object ใน store ชี้ที่เดียวกับ state ของ demo
  const res = structuredClone({ ok: true, ...out });
  try { save(s); } catch { throw new Error('พื้นที่เก็บข้อมูลในเครื่องเต็ม (รูปใหญ่เกินไป?)'); }
  return res;
}
