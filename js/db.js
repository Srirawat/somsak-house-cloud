// db.js — Supabase adapter (API เดิมเหมือนเวอร์ชัน IndexedDB ทุกหน้าใช้ต่อได้โดยไม่แก้)
// ตารางข้อมูลเก็บเป็น (id text primary key, data jsonb) ยกเว้น users → ตาราง profiles
import { supabase } from './supabase.js';

export const STORES = ['users', 'products', 'stock_moves', 'sales', 'expenses', 'rental_records', 'settings'];
const KEY_FIELD = { settings: 'key' };

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export async function openDB() { return true; } // ไม่ต้องเปิดฐานฝั่งเครื่องแล้ว

function fail(error, op) {
  throw new Error(`ฐานข้อมูล (${op}): ${error.message}`);
}

// ---- mapping ตาราง profiles ↔ รูปแบบ user เดิม ----
function profileToUser(p) {
  return {
    id: p.id, username: p.username, role: p.role, active: p.active,
    perms: p.perms, room: p.room,
    createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
  };
}
function userToProfile(u) {
  return { id: u.id, username: u.username, role: u.role, active: u.active, perms: u.perms ?? null, room: u.room ?? null };
}

export async function dbPut(store, value) {
  if (store === 'users') {
    const { error } = await supabase.from('profiles').upsert(userToProfile(value));
    if (error) fail(error, 'บันทึกผู้ใช้');
    return;
  }
  const key = String(value[KEY_FIELD[store] || 'id']);
  const { error } = await supabase.from(store).upsert({ id: key, data: value });
  if (error) fail(error, 'บันทึก ' + store);
}

export async function dbGet(store, key) {
  if (store === 'users') {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', key).maybeSingle();
    if (error) fail(error, 'อ่านผู้ใช้');
    return data ? profileToUser(data) : undefined;
  }
  const { data, error } = await supabase.from(store).select('data').eq('id', String(key)).maybeSingle();
  if (error) fail(error, 'อ่าน ' + store);
  return data ? data.data : undefined;
}

export async function dbAll(store) {
  if (store === 'users') {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) fail(error, 'อ่านผู้ใช้ทั้งหมด');
    return (data || []).map(profileToUser);
  }
  const { data, error } = await supabase.from(store).select('data');
  if (error) fail(error, 'อ่าน ' + store);
  return (data || []).map(r => r.data);
}

export async function dbAllBy(store, indexName, val) {
  if (store === 'users') {
    const { data, error } = await supabase.from('profiles').select('*').eq(indexName, val);
    if (error) fail(error, 'ค้นหาผู้ใช้');
    return (data || []).map(profileToUser);
  }
  const { data, error } = await supabase.from(store).select('data').eq(`data->>${indexName}`, String(val));
  if (error) fail(error, 'ค้นหา ' + store);
  return (data || []).map(r => r.data);
}

export async function dbDel(store, key) {
  const table = store === 'users' ? 'profiles' : store;
  const { error } = await supabase.from(table).delete().eq('id', String(key));
  if (error) fail(error, 'ลบ ' + store);
}

export async function dbClear(store) {
  if (store === 'users') return; // ห้ามล้างตารางผู้ใช้ (ผูกกับบัญชี Supabase Auth)
  const { error } = await supabase.from(store).delete().neq('id', '__none__');
  if (error) fail(error, 'ล้าง ' + store);
}
