// pages/stock.js — คงเหลือ, รับเข้า (Stock In), ปรับสต็อก (Adjust), ประวัติความเคลื่อนไหว
import { dbAll, dbGet, dbPut, uuid } from '../db.js';
import { fmtInt, fmtDateTimeTH, toast, esc, modal } from '../ui.js';

const TYPE_LABEL = { in: 'รับเข้า', adjust: 'ปรับสต็อก', sale: 'ขาย' };

export default async function render(root, { user }) {
  let products = await dbAll('products');
  let moves = await dbAll('stock_moves');

  root.innerHTML = `
  <h2>สต๊อกสินค้า</h2>
  <div class="card">
    <table><thead><tr>
      <th>สินค้า</th><th class="num">คงเหลือ</th><th class="num">จุดสั่งซื้อ</th><th>สถานะ</th><th></th>
    </tr></thead><tbody id="body"></tbody></table>
  </div>
  <div class="card">
    <h3 style="margin-top:0">ประวัติความเคลื่อนไหว (ล่าสุด 100 รายการ)</h3>
    <table><thead><tr>
      <th>วันเวลา</th><th>สินค้า</th><th>ประเภท</th><th class="num">จำนวน</th><th>หมายเหตุ</th>
    </tr></thead><tbody id="hist"></tbody></table>
  </div>`;

  const body = root.querySelector('#body');
  const hist = root.querySelector('#hist');

  function renderList() {
    const list = [...products].sort((a, b) => a.name.localeCompare(b.name, 'th'));
    body.innerHTML = list.length ? list.map(p => {
      const low = (p.stock || 0) <= (p.minStock ?? 0);
      return `<tr class="${low ? 'low-stock' : ''}">
        <td>${esc(p.name)}</td>
        <td class="num"><b>${fmtInt(p.stock)}</b></td>
        <td class="num">${fmtInt(p.minStock ?? 0)}</td>
        <td>${low ? '<span class="badge warn">สต็อกต่ำ</span>' : '<span class="badge ok">ปกติ</span>'}</td>
        <td><button class="in" data-id="${p.id}">รับเข้า</button>
            <button class="adj" data-id="${p.id}">ปรับสต็อก</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="muted">ยังไม่มีสินค้า</td></tr>';

    body.querySelectorAll('.in').forEach(b => b.onclick = () => openMove(b.dataset.id, 'in'));
    body.querySelectorAll('.adj').forEach(b => b.onclick = () => openMove(b.dataset.id, 'adjust'));
  }

  function renderHist() {
    const byId = Object.fromEntries(products.map(p => [p.id, p.name]));
    const list = [...moves].sort((a, b) => b.ts - a.ts).slice(0, 100);
    hist.innerHTML = list.length ? list.map(mv => `
      <tr>
        <td>${fmtDateTimeTH(mv.ts)}</td>
        <td>${esc(byId[mv.productId] || '(ถูกลบแล้ว)')}</td>
        <td>${TYPE_LABEL[mv.type] || mv.type}</td>
        <td class="num" style="color:${mv.qty < 0 ? 'var(--danger)' : 'var(--ok)'}">${mv.qty > 0 ? '+' : ''}${fmtInt(mv.qty)}</td>
        <td>${esc(mv.note || '')}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="muted">ยังไม่มีประวัติ</td></tr>';
  }

  function openMove(productId, type) {
    const p = products.find(x => x.id === productId);
    const isIn = type === 'in';
    const m = modal(`
      <h3>${isIn ? 'รับเข้าสินค้า (Stock In)' : 'ปรับสต็อก (Adjust)'} — ${esc(p.name)}</h3>
      <p class="muted">คงเหลือปัจจุบัน: <b>${fmtInt(p.stock)}</b></p>
      <form id="f">
        <div><label>${isIn ? 'จำนวนรับเข้า (+)' : 'จำนวนคงเหลือใหม่ (นับจริง)'}</label>
          <input id="qty" type="number" step="1" min="0" required value="${isIn ? 1 : p.stock}"></div>
        <div><label>หมายเหตุ</label><input id="note" value="${isIn ? 'รับสินค้าเข้า' : 'นับสต็อกจริง'}"></div>
        <div class="actions"><button type="button" id="cancel">ยกเลิก</button>
        <button class="primary" type="submit">บันทึก</button></div>
      </form>`);
    m.el.querySelector('#cancel').onclick = m.close;
    m.el.querySelector('#f').addEventListener('submit', async e => {
      e.preventDefault();
      const v = Math.floor(+m.el.querySelector('#qty').value);
      if (!isFinite(v) || v < 0 || (isIn && v === 0)) return toast('จำนวนไม่ถูกต้อง', 'err');
      const fresh = await dbGet('products', p.id);
      const delta = isIn ? v : v - fresh.stock;
      fresh.stock = isIn ? fresh.stock + v : v;
      await dbPut('products', fresh);
      await dbPut('stock_moves', {
        id: uuid(), productId: p.id, ts: Date.now(), type,
        qty: delta, note: m.el.querySelector('#note').value.trim(), userId: user.id,
      });
      m.close();
      products = await dbAll('products');
      moves = await dbAll('stock_moves');
      renderList(); renderHist();
      toast('บันทึกแล้ว');
    });
  }

  renderList(); renderHist();
}
