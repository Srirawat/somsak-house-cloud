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
  [/invalid login credentials/i, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'],
  [/duplicate key|profiles_username_key/i, 'ชื่อผู้ใช้นี้ถูกใช้แล้ว'],
  [/invalid.*email|email_address_invalid/i, 'ชื่อผู้ใช้นี้ใช้ไม่ได้ — ลองใช้ตัวอักษรภาษาอังกฤษหรือตัวเลข'],
  [/email not confirmed/i, 'ยังไม่ได้ยืนยันอีเมล — ตรวจกล่องจดหมายแล้วกดลิงก์ยืนยันก่อน'],
  [/user already registered/i, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้สมัครแล้ว'],
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

// ล็อกอินด้วย "ชื่อผู้ใช้" — เบื้องหลังยังใช้ Supabase Auth (อีเมล)
// บัญชีที่ไม่ได้กรอกอีเมลจริง จะได้อีเมลภายในระบบ username@somsak.local
export const INTERNAL_DOMAIN = 'somsak.local';

function internalEmail(username) {
  const slug = String(username).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'user';
  return `${slug}@${INTERNAL_DOMAIN}`;
}

// หาอีเมลของบัญชีจากชื่อผู้ใช้ (ผ่านฟังก์ชันในฐานข้อมูล — ไม่ต้องล็อกอินก่อน)
async function emailOfUsername(username) {
  const u = String(username || '').trim();
  if (u.includes('@')) return u; // กรอกเป็นอีเมลมาเลยก็ได้
  const { data, error } = await supabase.rpc('email_for_username', { uname: u });
  if (error || !data) return internalEmail(u); // เผื่อยังไม่ได้อัปเดต schema
  return data;
}

export async function register(username, password, email = '') {
  username = String(username || '').trim();
  email = String(email || '').trim();
  if (username.length < 3) throw new Error('ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร');
  if (/\s/.test(username)) throw new Error('ชื่อผู้ใช้ต้องไม่มีช่องว่าง');
  if (String(password || '').length < 6) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  const { data, error } = await supabase.auth.signUp({
    email: email || internalEmail(username),
    password,
    options: { data: { username } },
  });
  if (error) throw new Error(thError(error.message));
  return data;
}

export async function login(username, password) {
  const email = await emailOfUsername(username);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
