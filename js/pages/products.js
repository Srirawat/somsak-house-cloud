// pages/products.js — รายการสินค้า + สแกนเพิ่มสินค้าแบบต่อเนื่อง + รับเข้าสต๊อก
import { store, call, onChange, findByBarcode } from '../api.js';
import { fmtMoney, fmtInt, toast, esc, modal, busy } from '../ui.js';
import { scanBarcode } from '../barcode.js';
import { openProductForm, openStockForm } from '../product-form.js';

export default function render(root) {
  root.innerHTML = `
  <div class="page-head"><h2>📦 สินค้า</h2><span class="muted" id="count"></span></div>
  <button class="primary big-scan" id="btnScan">📷 สแกนเพิ่มสินค้า</button>
  <div class="card">
    <div class="row">
      <div style="flex:3 1 200px"><div class="search"><input id="q" placeholder="ค้นหาชื่อ / บาร์โค้ด"></div></div>
      <div><select id="cat"><option value="">ทุกหมวด</option></select></div>
      <div class="shrink"><button id="btnAdd">+ เพิ่มเอง</button></div>
    </div>
    <div id="lowWarn"></div>
  </div>
  <div class="card"><div class="list" id="list"></div></div>`;

  const $ = id => root.querySelector('#' + id);

  function refreshCats() {
    const cats = [...new Set(store.products.map(p => p.category).filter(Boolean))].sort();
    const cur = $('cat').value;
    $('cat').innerHTML = '<option value="">ทุกหมวด</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
    $('cat').value = cats.includes(cur) ? cur : '';
  }

  function renderList() {
    const f = $('q').value.trim().toLowerCase();
    const cat = $('cat').value;
    const list = store.products
      .filter(p => !f || p.name.toLowerCase().includes(f) || (p.barcode || '').toLowerCase().includes(f))
      .filter(p => !cat || p.category === cat)
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));

    $('count').textContent = `${fmtInt(store.products.length)} รายการ`;
    $('list').innerHTML = list.length ? list.map(p => {
      const low = p.stock <= (p.minStock ?? 0);
      return `<div class="item clickable ${low ? 'low' : ''}" data-id="${p.id}">
        ${p.image ? `<img class="thumb" src="${esc(p.image)}" loading="lazy" alt="">` : '<div class="thumb ph">📦</div>'}
        <div class="main">
          <div class="title">${esc(p.name)} ${low ? '<span class="badge warn">ใกล้หมด</span>' : ''}</div>
          <div class="sub">${esc([p.barcode, p.category, p.detail].filter(Boolean).join(' · ') || '—')}</div>
        </div>
        <div class="right">
          <div class="amt">${fmtMoney(p.price)} ฿</div>
          <div class="muted">เหลือ ${fmtInt(p.stock)}</div>
        </div>
        <div class="acts"><button class="sm stock" data-id="${p.id}" title="รับเข้า/ปรับสต๊อก">📥</button></div>
      </div>`;
    }).join('') : `<div class="empty">${store.products.length ? 'ไม่พบสินค้า' : 'ยังไม่มีสินค้า — กด "📷 สแกนเพิ่มสินค้า" ด้านบน'}</div>`;

    const lows = store.products.filter(p => p.stock <= (p.minStock ?? 0));
    $('lowWarn').innerHTML = lows.length
      ? `<div class="warn-box">⚠️ ใกล้หมด ${lows.length} รายการ: ${lows.slice(0, 8).map(p => esc(p.name)).join(', ')}${lows.length > 8 ? ' …' : ''}</div>` : '';

    $('list').querySelectorAll('.item').forEach(el => el.onclick = e => {
      const p = store.products.find(x => x.id === el.dataset.id);
      if (e.target.closest('.stock')) openStockForm(p);
      else openDetail(p);
    });
  }

  function openDetail(p) {
    const m = modal(`
      <div style="display:flex;gap:14px;align-items:flex-start">
        ${p.image ? `<img class="thumb" src="${esc(p.image)}" style="width:96px;height:96px">` : '<div class="thumb ph" style="width:96px;height:96px">📦</div>'}
        <div style="flex:1;min-width:0">
          <h3 style="margin:0 0 4px">${esc(p.name)}</h3>
          <div class="big">${fmtMoney(p.price)} ฿</div>
          <div class="muted">คงเหลือ ${fmtInt(p.stock)} · ต้นทุน ${fmtMoney(p.cost)} ฿</div>
        </div>
      </div>
      <table style="margin-top:12px">
        <tr><th>บาร์โค้ด</th><td style="word-break:break-all">${esc(p.barcode || '—')}</td></tr>
        <tr><th>หมวด</th><td>${esc(p.category || '—')}</td></tr>
        <tr><th>รายละเอียด</th><td style="white-space:pre-wrap">${esc(p.detail || '—')}</td></tr>
        <tr><th>แจ้งเตือนเมื่อเหลือ</th><td>${fmtInt(p.minStock)}</td></tr>
      </table>
      <div class="actions">
        <button class="danger" id="del">ลบ</button>
        <button id="stk">📥 รับเข้า/ปรับสต๊อก</button>
        <button class="primary" id="edit">✏️ แก้ไข</button>
      </div>`);
    m.el.querySelector('#edit').onclick = () => { m.close(); openProductForm(p); };
    m.el.querySelector('#stk').onclick = () => { m.close(); openStockForm(p); };
    m.el.querySelector('#del').onclick = async () => {
      if (!confirm(`ลบสินค้า "${p.name}" ?\n(บิลขายเก่ายังอยู่ครบ)`)) return;
      const r = await busy(() => call('deleteProduct', { id: p.id }), 'กำลังลบ…');
      if (r) { m.close(); toast('ลบสินค้าแล้ว'); }
    };
  }

  // สแกนต่อเนื่อง: สแกน → (มีแล้ว = รับเข้าสต๊อก | ใหม่ = กรอกชื่อ/ราคา/รายละเอียด) → สแกนชิ้นต่อไป
  async function scanLoop() {
    for (;;) {
      const code = await scanBarcode('📷 สแกนสินค้าที่จะเพิ่ม');
      if (!code) return;
      const exist = findByBarcode(code);
      let saved;
      if (exist) {
        toast(`มีสินค้านี้แล้ว: ${exist.name}`, 'info');
        saved = await openStockForm(exist);
      } else {
        saved = await openProductForm(null, { barcode: code });
      }
      if (!saved || !(await askNext())) return;
    }
  }

  function askNext() {
    return new Promise(resolve => {
      const m = modal(`<h3>บันทึกแล้ว ✅</h3><p>สแกนสินค้าชิ้นต่อไปเลยไหม?</p>
        <div class="actions"><button id="no">พอแล้ว</button><button class="primary" id="yes">📷 สแกนต่อ</button></div>`);
      m.el.querySelector('#no').onclick = () => { m.close(); resolve(false); };
      m.el.querySelector('#yes').onclick = () => { m.close(); resolve(true); };
    });
  }

  $('btnScan').onclick = scanLoop;
  $('btnAdd').onclick = () => openProductForm();
  $('q').addEventListener('input', renderList);
  $('cat').addEventListener('change', renderList);

  const off = onChange(() => { refreshCats(); renderList(); });
  refreshCats(); renderList();
  return off;
}
