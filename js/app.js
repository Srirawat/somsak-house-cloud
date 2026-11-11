// app.js — bootstrap + router (ไม่มี login: เปิดแล้วใช้ได้ทันที)
import { DEMO, loadCache, refresh, store } from './api.js';
import { SHOP_NAME } from './config.js';
import { toast, esc } from './ui.js';

import renderPos from './pages/pos.js';
import renderProducts from './pages/products.js';
import renderSales from './pages/sales.js';
import renderExpenses from './pages/expenses.js';

const MENUS = [
  { id: 'pos',      icon: '🛒', label: 'ขาย',      render: renderPos },
  { id: 'products', icon: '📦', label: 'สินค้า',    render: renderProducts },
  { id: 'sales',    icon: '📈', label: 'ยอดขาย',   render: renderSales },
  { id: 'expenses', icon: '🧾', label: 'ค่าใช้จ่าย', render: renderExpenses },
];

const app = document.getElementById('app');
let cleanup = null; // ฟังก์ชันที่หน้าเดิมคืนมา (ยกเลิก subscribe) — เรียกก่อนเปลี่ยนหน้า

function renderShell() {
  document.title = SHOP_NAME;
  app.innerHTML = `
  <header class="topbar">
    <div class="brand">🏪 ${esc(SHOP_NAME)}${DEMO ? ' <span class="demo-tag" title="ยังไม่ได้ตั้งค่า GAS_URL — ข้อมูลอยู่ในเครื่องนี้เท่านั้น">โหมดทดลอง</span>' : ''}</div>
    <button class="sync" id="btnSync" title="ดึงข้อมูลล่าสุดจาก Google Sheet">⟳ <span class="sync-text">ซิงก์</span></button>
  </header>
  <div class="layout">
    <nav class="nav">${MENUS.map(m =>
      `<a href="#/${m.id}" data-id="${m.id}"><span class="ico">${m.icon}</span><span class="lbl">${m.label}</span></a>`).join('')}
    </nav>
    <main id="main"></main>
  </div>`;
  document.getElementById('btnSync').onclick = () => sync(true);
}

async function sync(manual = false) {
  const btn = document.getElementById('btnSync');
  btn?.classList.add('spin');
  try {
    await refresh();
    if (manual) toast('ซิงก์ข้อมูลล่าสุดแล้ว');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn?.classList.remove('spin');
  }
}

async function route() {
  let id = location.hash.replace(/^#\/?/, '');
  const menu = MENUS.find(m => m.id === id);
  if (!menu) { location.hash = '#/pos'; return; }
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
  if (cleanup) { cleanup(); cleanup = null; }
  const main = document.getElementById('main');
  main.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    cleanup = (await menu.render(main)) || null;
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="card">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

async function main() {
  const hasCache = loadCache();
  renderShell();
  window.addEventListener('hashchange', route);
  if (hasCache) {
    route();          // แสดงจาก cache ทันที
    sync();           // แล้วดึงของใหม่เบื้องหลัง
  } else {
    document.getElementById('main').innerHTML = '<div class="boot">กำลังโหลดข้อมูลจาก Google Sheet…</div>';
    await sync();
    route();
  }
  // กลับมาที่แท็บนี้หลังหายไปนาน → ดึงข้อมูลใหม่ (เผื่ออีกเครื่องขายไปแล้ว)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - store.loadedAt > 60_000) sync();
  });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* ไม่มี SW ก็ใช้งานได้ */ });
}

main().catch(err => {
  console.error(err);
  app.innerHTML = `<div class="boot">เปิดระบบไม่สำเร็จ: ${esc(err.message)}</div>`;
});
