// api.js — คุยกับ Google Apps Script (Google Sheet) + cache ในเครื่อง
// ทุกหน้าอ่านข้อมูลจาก `store` (เร็ว) แล้วเขียนผ่าน `call(action, data)`
import { GAS_URL } from './config.js';
import { handle as demoHandle } from './demo.js';

export const DEMO = !GAS_URL;
const CACHE_KEY = 'somsakpos.cache.v1';

export const store = { products: [], sales: [], expenses: [], settings: {}, loadedAt: 0 };

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ---------- cache ---------- */
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch { /* storage เต็ม/ถูกบล็อก */ }
}
export function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (c && Array.isArray(c.products)) { Object.assign(store, c); return true; }
  } catch { /* ignore */ }
  return false;
}

/* ---------- subscribers: หน้าไหนเปิดอยู่จะ re-render เมื่อข้อมูลเปลี่ยน ---------- */
const subs = new Set();
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit() { subs.forEach(fn => { try { fn(store); } catch (e) { console.error(e); } }); }

/* ---------- network ---------- */
async function request(body) {
  if (DEMO) return demoHandle(body ? body.action : 'list', body?.data);
  let res;
  try {
    res = body
      // text/plain = "simple request" → เบราว์เซอร์ไม่ส่ง OPTIONS preflight (Apps Script ตอบ preflight ไม่ได้)
      ? await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      : await fetch(GAS_URL + '?action=list');
  } catch {
    throw new Error('เชื่อมต่อ Google Sheet ไม่ได้ — ตรวจอินเทอร์เน็ต');
  }
  if (!res.ok) throw new Error(`เชื่อมต่อ Google Sheet ไม่ได้ (HTTP ${res.status})`);
  let json;
  try { json = await res.json(); }
  catch { throw new Error('Apps Script ตอบกลับไม่ถูกต้อง — ตรวจว่า Deploy เป็น Web app และ Who has access = Anyone'); }
  if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
  return json;
}

export async function refresh() {
  const d = await request(null);
  store.products = d.products || [];
  store.sales = d.sales || [];
  store.expenses = d.expenses || [];
  store.settings = d.settings || {};
  store.loadedAt = Date.now();
  saveCache(); emit();
  return store;
}

function upsert(list, rec) {
  const i = list.findIndex(x => x.id === rec.id);
  if (i >= 0) list[i] = rec; else list.unshift(rec);
}

function apply(r) {
  if (r.product) upsert(store.products, r.product);
  (r.products || []).forEach(p => upsert(store.products, p));
  if (r.sale) { upsert(store.sales, r.sale); store.sales.sort((a, b) => b.ts - a.ts); }
  if (r.expense) { upsert(store.expenses, r.expense); store.expenses.sort((a, b) => b.ts - a.ts); }
  if (r.deleted) store[r.deleted.type] = store[r.deleted.type].filter(x => x.id !== r.deleted.id);
  if (r.setting) store.settings[r.setting.key] = r.setting.value;
}

/** เขียนข้อมูล → อัปเดต store ให้อัตโนมัติ */
export async function call(action, data = {}) {
  const r = await request({ action, data });
  apply(r); saveCache(); emit();
  return r;
}

/** อัปโหลดรูป (dataURL ที่บีบอัดแล้ว) → ได้ URL รูปใน Google Drive */
export async function uploadImage(dataUrl, name = 'img') {
  const r = await request({ action: 'uploadImage', data: { dataUrl, name } });
  return r.url;
}

export const findByBarcode = code =>
  store.products.find(p => p.barcode && p.barcode.toLowerCase() === String(code).trim().toLowerCase());
