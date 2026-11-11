// pages/sales.js — สรุปยอดขาย/กำไร + รายการบิล (ดู/แก้ไข/ลบ พร้อมปรับสต๊อกอัตโนมัติ)
import { store, call, onChange } from '../api.js';
import { fmtMoney, fmtInt, fmtDateTimeTH, toast, esc, modal, busy } from '../ui.js';

const PAY_LABEL = { cash: '💵 เงินสด', qr: '📱 QR' };

export default function render(root) {
  root.innerHTML = `
  <div class="page-head"><h2>📈 ยอดขาย</h2></div>
  <div class="stats" id="stats"></div>
  <div class="card">
    <div class="tabs" id="groupTabs">
      <button data-g="day" class="active">รายวัน</button>
      <button data-g="month">รายเดือน</button>
      <button data-g="year">รายปี</button>
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>ช่วงเวลา</th><th class="num">บิล</th><th class="num">เงินสด</th><th class="num">QR</th><th class="num">รวม</th>
    </tr></thead><tbody id="sumBody"></tbody></table></div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:6px">
      <div><h3 style="margin:0">บิลล่าสุด</h3><span class="muted">แตะบิลเพื่อดู/แก้ไข</span></div>
      <div><div class="search"><input id="q" placeholder="ค้นหาเลขบิล / สินค้า"></div></div>
    </div>
    <div class="list" id="list"></div>
  </div>`;

  const $ = id => root.querySelector('#' + id);
  let group = 'day';

  function renderStats() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const sum = (arr, f) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
    const today = store.sales.filter(s => s.ts >= dayStart);
    const month = store.sales.filter(s => s.ts >= monthStart);
    const monthExp = store.expenses.filter(e => e.ts >= monthStart);
    const profit = sum(month, s => s.total) - sum(monthExp, e => e.amount);
    $('stats').innerHTML = `
      <div class="stat"><div class="k">ขายวันนี้ (${fmtInt(today.length)} บิล)</div><div class="v">${fmtMoney(sum(today, s => s.total))}</div></div>
      <div class="stat"><div class="k">ขายเดือนนี้ (${fmtInt(month.length)} บิล)</div><div class="v">${fmtMoney(sum(month, s => s.total))}</div></div>
      <div class="stat"><div class="k">ค่าใช้จ่ายเดือนนี้</div><div class="v">${fmtMoney(sum(monthExp, e => e.amount))}</div></div>
      <div class="stat"><div class="k">ขาย − ค่าใช้จ่าย</div><div class="v ${profit >= 0 ? 'pos' : 'neg'}">${fmtMoney(profit)}</div></div>`;
  }

  function keyOf(ts) {
    const d = new Date(ts);
    if (group === 'day') return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    if (group === 'month') return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    return d.toLocaleDateString('th-TH', { year: 'numeric' });
  }

  function renderSummary() {
    const groups = new Map();
    for (const s of store.sales) {
      const k = keyOf(s.ts);
      const cur = groups.get(k) || { count: 0, total: 0, cash: 0, qr: 0, ts: s.ts };
      cur.count++; cur.total += s.total;
      if (s.payMethod === 'qr') cur.qr += s.total; else cur.cash += s.total;
      groups.set(k, cur);
    }
    const rows = [...groups.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, 60);
    $('sumBody').innerHTML = rows.length ? rows.map(([k, v]) => `
      <tr><td>${esc(k)}</td><td class="num">${fmtInt(v.count)}</td>
      <td class="num">${fmtMoney(v.cash)}</td><td class="num">${fmtMoney(v.qr)}</td>
      <td class="num"><b>${fmtMoney(v.total)}</b></td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">ยังไม่มีรายการขาย</td></tr>';
  }

  $('groupTabs').querySelectorAll('button').forEach(b => b.onclick = () => {
    $('groupTabs').querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    group = b.dataset.g;
    renderSummary();
  });

  function renderList() {
    const f = $('q').value.trim().toLowerCase();
    const list = store.sales.filter(s => !f || s.billNo.toLowerCase().includes(f)
      || s.items.some(i => i.name.toLowerCase().includes(f))).slice(0, 150);
    $('list').innerHTML = list.length ? list.map(s => `
      <div class="item clickable" data-id="${s.id}">
        <div class="main">
          <div class="title">${esc(s.billNo)} ${s.editedAt ? '<span class="badge muted">แก้ไขแล้ว</span>' : ''}</div>
          <div class="sub">${fmtDateTimeTH(s.ts)} · ${PAY_LABEL[s.payMethod] || ''} · ${esc(s.items.map(i => i.name + '×' + i.qty).join(', '))}</div>
        </div>
        <div class="right"><div class="amt">${fmtMoney(s.total)}</div></div>
      </div>`).join('') : '<div class="empty">ยังไม่มีรายการขาย</div>';
    $('list').querySelectorAll('.item').forEach(el => el.onclick = () => showBill(store.sales.find(x => x.id === el.dataset.id)));
  }

  function showBill(s) {
    const m = modal(`<h3 style="margin-top:0">บิล ${esc(s.billNo)}</h3>
      <p class="muted">${fmtDateTimeTH(s.ts)} · ${PAY_LABEL[s.payMethod] || '—'}</p>
      <div class="table-wrap"><table><thead><tr><th>สินค้า</th><th class="num">ราคา</th><th class="num">จำนวน</th><th class="num">รวม</th></tr></thead>
      <tbody>${s.items.map(i => `<tr><td>${esc(i.name)}</td><td class="num">${fmtMoney(i.price)}</td>
        <td class="num">${fmtInt(i.qty)}</td><td class="num">${fmtMoney(i.price * i.qty)}</td></tr>`).join('')}</tbody></table></div>
      <p class="big" style="text-align:right">${fmtMoney(s.total)} ฿</p>
      ${s.payMethod === 'cash' && s.received != null
        ? `<p class="muted" style="text-align:right">รับเงินมา ${fmtMoney(s.received)} ฿ · ทอน ${fmtMoney(s.change || 0)} ฿</p>` : ''}
      <div class="actions">
        <button class="danger" id="del">ยกเลิกบิล</button>
        <button id="edit">✏️ แก้ไข</button>
        <button class="primary" id="close">ปิด</button>
      </div>`);
    m.el.querySelector('#close').onclick = m.close;
    m.el.querySelector('#edit').onclick = () => { m.close(); openEdit(s); };
    m.el.querySelector('#del').onclick = async () => {
      if (!confirm(`ยกเลิกบิล ${s.billNo} (${fmtMoney(s.total)} ฿) ?\nระบบจะคืนสินค้าในบิลกลับเข้าสต๊อก`)) return;
      const r = await busy(() => call('deleteSale', { id: s.id }), 'กำลังยกเลิกบิล…');
      if (r) { m.close(); toast('ยกเลิกบิลแล้ว คืนของเข้าสต๊อกเรียบร้อย'); }
    };
  }

  // ---------- แก้ไขบิล ----------
  function openEdit(s) {
    let items = s.items.map(i => ({ ...i }));
    let totalTouched = false;
    const dtLocal = ts => new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const m = modal(`
      <h3 style="margin-top:0">แก้ไขบิล ${esc(s.billNo)}</h3>
      <form id="f">
        <div class="row">
          <div><label>วันเวลา</label><input id="fts" type="datetime-local" value="${dtLocal(s.ts)}" required></div>
          <div><label>วิธีชำระ</label><select id="fpay">
            <option value="cash" ${s.payMethod !== 'qr' ? 'selected' : ''}>💵 เงินสด</option>
            <option value="qr" ${s.payMethod === 'qr' ? 'selected' : ''}>📱 QR พร้อมเพย์</option>
          </select></div>
        </div>
        <div class="table-wrap"><table class="edit-items"><thead><tr>
          <th>สินค้า</th><th class="num">ราคา</th><th class="num">จำนวน</th><th></th>
        </tr></thead><tbody id="itemBody"></tbody></table></div>
        <div class="row">
          <div style="flex:3 1 200px"><select id="addSel"><option value="">+ เพิ่มสินค้าเข้าบิล…</option>
            ${store.products.map(p => `<option value="${p.id}">${esc(p.name)} (${fmtMoney(p.price)} ฿)</option>`).join('')}
          </select></div>
        </div>
        <div class="row">
          <div><label>ยอดรวม (บาท)</label><input id="ftotal" type="number" min="0" step="0.01" inputmode="decimal" value="${s.total}" style="font-size:18px;text-align:right"></div>
          <div id="cashRow"><label>รับเงินมา (บาท)</label><input id="frecv" type="number" min="0" step="0.01" inputmode="decimal" value="${s.received ?? ''}"></div>
        </div>
        <div class="muted" id="calcHint"></div>
        <div class="warn-box">⚠️ แก้จำนวนสินค้า → ระบบปรับสต๊อกให้อัตโนมัติ (ลดจำนวน = คืนของเข้าสต๊อก)</div>
        <div class="actions"><button type="button" id="cancel">ยกเลิก</button>
          <button class="primary" type="submit">บันทึกการแก้ไข</button></div>
      </form>`);

    const $m = id => m.el.querySelector('#' + id);
    const sumItems = () => items.reduce((a, i) => a + (+i.price || 0) * (+i.qty || 0), 0);

    function renderItems() {
      $m('itemBody').innerHTML = items.length ? items.map((i, idx) => `
        <tr>
          <td>${esc(i.name)}</td>
          <td class="num"><input class="it-price" data-i="${idx}" type="number" min="0" step="0.01" value="${i.price}" style="width:84px;text-align:right"></td>
          <td class="num"><input class="it-qty" data-i="${idx}" type="number" min="0" step="1" value="${i.qty}" style="width:64px;text-align:right"></td>
          <td><button type="button" class="ghost sm it-rm" data-i="${idx}">✕</button></td>
        </tr>`).join('') : '<tr><td colspan="4" class="muted">ไม่มีรายการ</td></tr>';
      m.el.querySelectorAll('.it-price').forEach(el => el.onchange = () => { items[+el.dataset.i].price = Math.max(0, +el.value || 0); syncTotal(); });
      m.el.querySelectorAll('.it-qty').forEach(el => el.onchange = () => { items[+el.dataset.i].qty = Math.max(0, Math.floor(+el.value || 0)); syncTotal(); });
      m.el.querySelectorAll('.it-rm').forEach(el => el.onclick = () => { items.splice(+el.dataset.i, 1); renderItems(); syncTotal(); });
      updateHint();
    }
    function updateHint() {
      const calc = sumItems(), cur = parseFloat($m('ftotal').value) || 0;
      $m('calcHint').innerHTML = Math.abs(calc - cur) < 0.005 ? `ผลรวมรายการ ${fmtMoney(calc)} ฿ ✅`
        : `<span style="color:var(--danger)">ผลรวมรายการ ${fmtMoney(calc)} ฿ (ไม่ตรงกับยอดรวม)</span>`;
    }
    function syncTotal() { if (!totalTouched) $m('ftotal').value = sumItems().toFixed(2); updateHint(); }
    $m('ftotal').addEventListener('input', () => { totalTouched = true; updateHint(); });
    const togglePay = () => { $m('cashRow').style.display = $m('fpay').value === 'cash' ? '' : 'none'; };
    $m('fpay').addEventListener('change', togglePay); togglePay();
    $m('addSel').onchange = () => {
      const p = store.products.find(x => x.id === $m('addSel').value);
      $m('addSel').value = '';
      if (!p) return;
      const ex = items.find(i => i.productId === p.id);
      if (ex) ex.qty++; else items.push({ productId: p.id, name: p.name, price: p.price, qty: 1 });
      renderItems(); syncTotal();
    };
    $m('cancel').onclick = m.close;

    $m('f').addEventListener('submit', async e => {
      e.preventDefault();
      const clean = items.filter(i => (+i.qty || 0) > 0);
      if (!clean.length) return toast('บิลต้องมีอย่างน้อย 1 รายการ (ถ้าจะยกเลิกทั้งบิลให้กด "ยกเลิกบิล")', 'err');
      const ts = new Date($m('fts').value).getTime();
      if (!isFinite(ts)) return toast('วันเวลาไม่ถูกต้อง', 'err');
      const payMethod = $m('fpay').value;
      const r = await busy(() => call('updateSale', {
        id: s.id, ts, items: clean, payMethod,
        total: Math.max(0, parseFloat($m('ftotal').value) || 0),
        received: payMethod === 'cash' ? $m('frecv').value : null,
      }));
      if (!r) return;
      m.close();
      toast('บันทึกการแก้ไขบิลแล้ว (ปรับสต๊อกเรียบร้อย)');
    });
    renderItems();
  }

  $('q').addEventListener('input', renderList);
  const renderAll = () => { renderStats(); renderSummary(); renderList(); };
  const off = onChange(renderAll);
  renderAll();
  return off;
}
