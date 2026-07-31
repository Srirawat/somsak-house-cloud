// auth.js — Supabase Auth (อีเมล+รหัสผ่าน) + โปรไฟล์/RBAC + เลขบิล (ผ่าน RPC)
import { supabase } from './supabase.js';

export const ROOMS = Array.from({ length: 11 }, (_, i) => String(2001 + i));

export const MENUS = [
  { id: 'pos',            label: 'หน้าแรก POS' },
  { id: 'products',       label: 'รายละเอียดสินค้า' },
  { id: 'stock',          label: 'สต๊อกสินค้า' },
  { id: 'sales',          label: 'สรุปรายได้' },
  { id: 'expenses',       label: 'จดรายการจ่าย' },
  { id: 'copay',          label: 'คำนวณคนละครึ่ง' },
  { id: 'rental-calc',    label: 'คำนวณบ้านเช่า' },
  { id: 'rental-records', label: 'บันทึกบ้านเช่า' },
  { id: 'users',          label: 'จัดการผู้ใช้ & สิทธิ์' },
];

export const MEMBER_DEFAULT_PERMS = {
  'pos': true, 'products': false, 'stock': false, 'sales': false,
  'expenses': false, 'copay': true, 'rental-calc': true, 'rental-records': true,
  'users': false,
};

const TH_ERRORS = [
  [/invalid login credentials/i, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
  [/email not confirmed/i, 'ยังไม่ได้ยืนยันอีเมล — ตรวจกล่องจดหมายแล้วกดลิงก์ยืนยันก่อน'],
  [/user already registered/i, 'อีเมลนี้ถูกใช้สมัครแล้ว'],
  [/password should be at least/i, 'รหัสผ่านสั้นเกินไป (Supabase กำหนดอย่างน้อย 6 ตัวอักษร)'],
  [/rate limit/i, 'ส่งคำขอถี่เกินไป กรุณารอสักครู่'],
  [/failed to fetch|networkerror/i, 'เชื่อมต่อ Supabase ไม่ได้ — ตรวจอินเทอร์เน็ต/ค่า config.js'],
];
function thError(msg) {
  for (const [re, th] of TH_ERRORS) if (re.test(msg)) return th;
  return msg;
}

// โครงสร้างตาราง + ค่าตั้งต้นทำไว้ใน schema.sql แล้ว
export async function seed() {}

async function fetchProfile(uid) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw new Error(thError(error.message));
  return data;
}

function toUser(p, email) {
  return {
    id: p.id, username: p.username, role: p.role, active: p.active,
    perms: p.perms, room: p.room,
    createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
    email,
  };
}

export async function register(email, username, password) {
  email = String(email || '').trim();
  username = String(username || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  if (username.length < 3) throw new Error('ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร');
  if (String(password || '').length < 6) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { username } },
  });
  if (error) throw new Error(thError(error.message));
  return data;
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(email || '').trim(), password });
  if (error) throw new Error(thError(error.message));
  const p = await fetchProfile(data.user.id);
  if (!p) { await supabase.auth.signOut(); throw new Error('ไม่พบโปรไฟล์ผู้ใช้ — ติดต่อผู้ดูแลระบบ'); }
  if (!p.active) { await supabase.auth.signOut(); throw new Error('บัญชีนี้ถูกระงับ'); }
  return toUser(p, data.user.email);
}

export async function logout() { await supabase.auth.signOut(); }

export async function currentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const p = await fetchProfile(session.user.id).catch(() => null);
  if (!p || !p.active) return null;
  return toUser(p, session.user.email);
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
    redirectTo: location.origin + location.pathname,
  });
  if (error) throw new Error(thError(error.message));
}

export async function updatePassword(newPassword) {
  if (String(newPassword || '').length < 6) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(thError(error.message));
}

export function onPasswordRecovery(handler) {
  supabase.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') handler();
  });
}

// ---- RBAC (ตรรกะเดิม + บังคับซ้ำด้วย RLS ฝั่งเซิร์ฟเวอร์) ----
export function can(user, menuId) {
  if (!user || !user.active) return false;
  if (user.role === 'tester') return true;
  if (user.role === 'admin') return true;
  if (user.role === 'member') {
    if (menuId === 'users') return false;
    const base = MEMBER_DEFAULT_PERMS[menuId] ?? false;
    const override = user.perms?.[menuId];
    return override === undefined || override === null ? base : !!override;
  }
  return false;
}

export function canManage(actor, target) {
  if (!actor) return false;
  if (actor.role === 'tester') return true;
  if (actor.role === 'admin') return target.role === 'member';
  return false;
}

// เลขบิล — นับกลางที่ฐานข้อมูล ปลอดภัยเมื่อขายพร้อมกันหลายเครื่อง
export async function nextBillNo() {
  const { data, error } = await supabase.rpc('next_bill_no');
  if (error) throw new Error(thError(error.message));
  return data;
}
