// pages/sales.js — รายการขายล่าสุด + สรุปรายวัน/เดือน/ปี, ดูรายละเอียดบิล
// admin/tester: แก้ไข/ลบบิลได้ทุกอย่าง พร้อมคืน-ตัดสต๊อกให้อัตโนมัติ
import { dbAll, dbGet, dbPut, dbDel, uuid } from '../db.js';
import { fmtMoney, fmtInt, fmtDateTimeTH, toast, esc, modal } from '../ui.js';

const PAY_LABEL = { cash: '💵 เงินสด', qr: '📱 QR' };

export default async function render(root, { user }) {
  let sales = (await dbAll('sales')).sort((a, b) => b.ts - a.ts);
  let products = await dbAll('products');
  const canEdit = user.role === 'tester' || user.role === 'admin';

  root.innerHTML = `
  <h2>สรุปรายได้</h2>
  <div class="card">
    <div class="tabs">
      <button data-g="day" class="active">รายวัน</button>
      <button data-g="month">รายเดือน</button>
      <button data-g="year">รายปี</button>
    </div>
    <table><thead><tr>
      <th>ช่วงเวลา</th><th class="num">จำนวนบิล</th>
      <th class="num">เงินสด</th><th class="num">QR</th><th class="num">ยอดขายรวม (บาท)</th>
    </tr></thead><tbody id="sumBody"></tbody></table>
  </div>
  <div class="card">
    <h3 style="margin-top:0">รายการขายล่าสุด
      <span class="muted" style="font-weight:400">— คลิกแถวเพื่อ${canEdit ? 'แก้ไขบิล' : 'ดูรายละเอียด'}</span></h3>
    <table><thead><tr>
      <th>เลขที่บิล</th><th>วันเวลา</th><th>ผู้ขาย</th><th>ชำระโดย</th>
      <th class="num">รายการ</th><th class="num">ยอดรวม</th>${canEdit ? '<th></th>' : ''}
    </tr></thead><tbody id="listBody"></tbody></table>
  </div>`;

  const sumBody = root.querySelector('#sumBody');
  const listBody = root.querySelector('#listBody');
  let group = 'day';

  function keyOf(ts, g) {
    const d = new Date(ts);
    if (g === 'day') return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    if (g === 'month') return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    return d.toLocaleDateString('th-TH', { year: 'numeric' });
  }

  function renderSummary() {
    const groups = new Map();
    for (const s of sales) {
      const k = keyOf(s.ts, group);
      const cur = groups.get(k) || { count: 0, total: 0, cash: 0, qr: 0, ts: s.ts };
      cur.count++; cur.total += s.total;
      if (s.payMethod === 'qr') cur.qr += s.total; else cur.cash += s.total;
      groups.set(k, cur);
    }
    const rows = [...groups.entries()].sort((a, b) => b[1].ts - a[1].ts);
    sumBody.innerHTML = rows.length ? rows.map(([k, v]) => `
      <tr><td>${esc(k)}</td><td class="num">${fmtInt(v.count)}</td>
      <td class="num">${fmtMoney(v.cash)}</td><td class="num">${fmtMoney(v.qr)}</td>
      <td class="num"><b>${fmtMoney(v.total)}</b></td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">ยังไม่มีรายการขาย</td></tr>';
  }

  root.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    root.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    group = b.dataset.g;
    renderSummary();
  });

  function renderList() {
    listBody.innerHTML = sales.length ? sales.slice(0, 100).map(s => `
      <tr class="clickable" data-id="${s.id}">
        <td><b>${esc(s.billNo)}</b>${s.editedAt ? ' <span class="badge muted">แก้ไขแล้ว</span>' : ''}</td>
        <td>${fmtDateTimeTH(s.ts)}</td>
        <td>${esc(s.username || '—')}</td>
        <td>${PAY_LABEL[s.payMethod] || '—'}</td>
        <td class="num">${fmtInt(s.items.length)}</td>
        <td class="num"><b>${fmtMoney(s.total)}</b></td>
        ${canEdit ? `<td><button class="edit" data-id="${s.id}">แก้ไข</button>
          <button class="danger del" data-id="${s.id}">ลบ</button></td>` : ''}
      </tr>`).join('')
      : `<tr><td colspan="${canEdit ? 7 : 6}" class="muted">ยังไม่มีรายการขาย</td></tr>`;

    listBody.querySelectorAll('tr.clickable').forEach(tr => tr.onclick = e => {
      if (e.target.closest('button')) return;
      const s = sales.find(x => x.id === tr.dataset.id);
      canEdit ? openEdit(s) : showBill(s);
    });
    if (canEdit) {
      listBody.querySelectorAll('.edit').forEach(b => b.onclick = () => openEdit(sales.find(x => x.id === b.dataset.id)));
      listBody.querySelectorAll('.del').forEach(b => b.onclick = () => deleteBill(sales.find(x => x.id === b.dataset.id)));
    }
  }

  // ---------- ดูบิลอย่างเดียว (member) ----------
  function showBill(s) {
    modal(`<h3 style="margin-top:0">บิล ${esc(s.billNo)}</h3>
      <p class="muted">${fmtDateTimeTH(s.ts)} · ผู้ขาย: ${esc(s.username || '—')} · ${PAY_LABEL[s.payMethod] || '—'}</p>
      <table><thead><tr><th>สินค้า</th><th class="num">ราคา</th><th class="num">จำนวน</th><th class="num">รวม</th></tr></thead>
      <tbody>${s.items.map(i => `<tr><td>${esc(i.name)}</td><td class="num">${fmtMoney(i.price)}</td>
        <td class="num">${fmtInt(i.qty)}</td><td class="num">${fmtMoney(i.price * i.qty)}</td></tr>`).join('')}</tbody></table>
      <p class="big" style="text-align:right">${fmtMoney(s.total)} ฿</p>
      ${s.payMethod === 'cash' && s.received != null
        ? `<p class="muted" style="text-align:right">รับเงินมา ${fmtMoney(s.received)} ฿ · ทอน ${fmtMoney(s.change || 0)} ฿</p>` : ''}`);
  }

  // ---------- ปรับสต๊อกตามผลต่าง (บวก = คืนของเข้าสต๊อก) ----------
  async function applyStockDiff(diff, note) {
    const ts = Date.now();
    for (const [pid, delta] of diff) {
      if (!pid || !delta) continue;
      const p = await dbGet('products', pid);
      if (!p) continue;
      p.stock = Math.max(0, (p.stock || 0) + delta);
      await dbPut('products', p);
      await dbPut('stock_moves', {
        id: uuid(), productId: pid, ts, type: 'adjust', qty: delta, note, userId: user.id,
      });
    }
  }

  function qtyMap(items) {
    const m = new Map();
    for (const i of items) if (i.productId) m.set(i.productId, (m.get(i.productId) || 0) + Number(i.qty || 0));
    return m;
  }

  // ---------- แก้ไขบิล (admin/tester) ----------
  function openEdit(s) {
    let items = s.items.map(i => ({ ...i }));
    let totalTouched = false;

    const dtLocal = ts => new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const m = modal(`
      <h3 style="margin-top:0">แก้ไขบิล ${esc(s.billNo)}</h3>
      <form id="f">
        <div class="row">
          <div><label>เลขที่บิล</label><input id="fbill" value="${esc(s.billNo)}" required></div>
          <div><label>วันเวลา</label><input id="fts" type="datetime-local" value="${dtLocal(s.ts)}" required></div>
          <div><label>วิธีชำระ</label><select id="fpay">
            <option value="cash" ${s.payMethod !== 'qr' ? 'selected' : ''}>💵 เงินสด</option>
            <option value="qr" ${s.payMethod === 'qr' ? 'selected' : ''}>📱 QR พร้อมเพย์</option>
          </select></div>
        </div>

        <h4 style="margin:14px 0 6px">รายการสินค้า</h4>
        <table class="edit-items"><thead><tr>
          <th>สินค้า</th><th class="num">ราคา/หน่วย</th><th class="num">จำนวน</th><th class="num">รวม</th><th></th>
        </tr></thead><tbody id="itemBody"></tbody></table>
        <div class="row" style="margin-top:8px">
          <div style="flex:1"><label>เพิ่มสินค้าเข้าบิล</label>
            <select id="addSel" style="width:100%"><option value="">— เลือกสินค้า —</option>
              ${products.map(p => `<option value="${p.id}">${esc(p.name)} (${fmtMoney(p.price)} ฿)</option>`).join('')}
            </select></div>
          <div><button type="button" id="addBtn">+ เพิ่ม</button></div>
          <div><button type="button" id="addFree">+ รายการอิสระ</button></div>
        </div>

        <div class="row" style="margin-top:12px;align-items:flex-end">
          <div><label>ยอดรวมที่บันทึก (บาท)</label>
            <input id="ftotal" type="number" min="0" step="0.01" value="${s.total}" style="font-size:18px;text-align:right"></div>
          <div><button type="button" id="recalc">= คำนวณจากรายการ</button></div>
          <div class="muted" id="calcHint"></div>
        </div>
        <div class="row" id="cashRow">
          <div><label>รับเงินมา (บาท)</label><input id="frecv" type="number" min="0" step="0.01" value="${s.received ?? ''}"></div>
          <div><label>เงินทอน (คำนวณให้)</label><input id="fchange" disabled value="${fmtMoney(s.change || 0)}"></div>
        </div>

        <div class="warn-box" style="margin-top:12px">
          ⚠️ ถ้าแก้จำนวนสินค้า ระบบจะปรับสต๊อกให้อัตโนมัติ (ลดจำนวน = คืนของเข้าสต๊อก) และบันทึกลงประวัติความเคลื่อนไหว
        </div>
        <div class="actions">
          <button type="button" id="cancel">ยกเลิก</button>
          <button class="primary" type="submit">บันทึกการแก้ไข</button>
        </div>
      </form>`);

    const $ = id => m.el.querySelector('#' + id);
    const sumItems = () => items.reduce((a, i) => a + (+i.price || 0) * (+i.qty || 0), 0);

    function renderItems() {
      $('itemBody').innerHTML = items.length ? items.map((i, idx) => `
        <tr>
          <td><input class="it-name" data-idx="${idx}" value="${esc(i.name)}" style="width:100%"></td>
          <td class="num"><input class="it-price" data-idx="${idx}" type="number" min="0" step="0.01" value="${i.price}" style="width:96px;text-align:right"></td>
          <td class="num"><input class="it-qty" data-idx="${idx}" type="number" min="0" step="1" value="${i.qty}" style="width:70px;text-align:right"></td>
          <td class="num">${fmtMoney((+i.price || 0) * (+i.qty || 0))}</td>
          <td><button type="button" class="ghost it-rm" data-idx="${idx}">✕</button></td>
        </tr>`).join('')
        : '<tr><td colspan="5" class="muted">ไม่มีรายการ — เพิ่มด้านล่าง</td></tr>';

      m.el.querySelectorAll('.it-name').forEach(el => el.onchange = () => { items[+el.dataset.idx].name = el.value; });
      m.el.querySelectorAll('.it-price').forEach(el => el.onchange = () => {
        items[+el.dataset.idx].price = Math.max(0, +el.value || 0); renderItems(); syncTotal();
      });
      m.el.querySelectorAll('.it-qty').forEach(el => el.onchange = () => {
        items[+el.dataset.idx].qty = Math.max(0, Math.floor(+el.value || 0)); renderItems(); syncTotal();
      });
      m.el.querySelectorAll('.it-rm').forEach(el => el.onclick = () => {
        items.splice(+el.dataset.idx, 1); renderItems(); syncTotal();
      });
      updateHint();
    }

    function updateHint() {
      const calc = sumItems();
      const cur = parseFloat($('ftotal').value);
      $('calcHint').innerHTML = Math.abs(calc - (isFinite(cur) ? cur : 0)) < 0.005
        ? `ผลรวมรายการ ${fmtMoney(calc)} ฿ ✅`
        : `<span style="color:var(--danger)">ผลรวมรายการ ${fmtMoney(calc)} ฿ (ไม่ตรงกับยอดที่บันทึก)</span>`;
    }
    function syncTotal() {
      if (!totalTouched) $('ftotal').value = sumItems().toFixed(2);
      updateHint(); updateChange();
    }
    function updateChange() {
      const got = parseFloat($('frecv').value);
      const tot = parseFloat($('ftotal').value) || 0;
      $('fchange').value = isFinite(got) ? fmtMoney(got - tot) : '';
    }

    $('ftotal').addEventListener('input', () => { totalTouched = true; updateHint(); updateChange(); });
    $('frecv').addEventListener('input', updateChange);
    $('recalc').onclick = () => { totalTouched = false; $('ftotal').value = sumItems().toFixed(2); updateHint(); updateChange(); };

    const togglePay = () => { $('cashRow').style.display = $('fpay').value === 'cash' ? '' : 'none'; };
    $('fpay').addEventListener('change', togglePay);
    togglePay();

    $('addBtn').onclick = () => {
      const p = products.find(x => x.id === $('addSel').value);
      if (!p) return toast('เลือกสินค้าก่อน', 'err');
      const ex = items.find(i => i.productId === p.id);
      if (ex) ex.qty++;
      else items.push({ productId: p.id, name: p.name, price: p.price, qty: 1 });
      renderItems(); syncTotal();
    };
    $('addFree').onclick = () => {
      items.push({ productId: null, name: 'รายการใหม่', price: 0, qty: 1 });
      renderItems(); syncTotal();
    };
    $('cancel').onclick = m.close;

    $('f').addEventListener('submit', async e => {
      e.preventDefault();
      const clean = items.filter(i => (+i.qty || 0) > 0 && String(i.name).trim());
      if (!clean.length) return toast('บิลต้องมีอย่างน้อย 1 รายการ', 'err');
      const total = Math.max(0, parseFloat($('ftotal').value) || 0);
      const ts = new Date($('fts').value).getTime();
      if (!isFinite(ts)) return toast('วันเวลาไม่ถูกต้อง', 'err');

      // ปรับสต๊อก: (จำนวนเดิม - จำนวนใหม่) → บวก = คืนเข้าสต๊อก
      const before = qtyMap(s.items), after = qtyMap(clean);
      const diff = new Map();
      for (const [pid, q] of before) diff.set(pid, (diff.get(pid) || 0) + q);
      for (const [pid, q] of after) diff.set(pid, (diff.get(pid) || 0) - q);
      await applyStockDiff(diff, `แก้ไขบิล ${$('fbill').value.trim()}`);

      const payMethod = $('fpay').value;
      const received = payMethod === 'cash' ? (parseFloat($('frecv').value) || null) : null;
      const fresh = await dbGet('sales', s.id);
      await dbPut('sales', {
        ...(fresh || s),
        billNo: $('fbill').value.trim(),
        ts, total, items: clean,
        payMethod, received,
        change: received != null ? received - total : 0,
        editedAt: Date.now(), editedBy: user.username,
      });

      m.close();
      sales = (await dbAll('sales')).sort((a, b) => b.ts - a.ts);
      products = await dbAll('products');
      renderSummary(); renderList();
      toast('บันทึกการแก้ไขบิลแล้ว (ปรับสต๊อกให้เรียบร้อย)');
    });

    renderItems();
    updateChange();
  }

  // ---------- ลบบิล ----------
  async function deleteBill(s) {
    if (!confirm(`ลบบิล ${s.billNo} (${fmtMoney(s.total)} ฿) ?\nระบบจะคืนสินค้าทั้งหมดในบิลกลับเข้าสต๊อก`)) return;
    const diff = new Map();
    for (const [pid, q] of qtyMap(s.items)) diff.set(pid, q);
    await applyStockDiff(diff, `ยกเลิกบิล ${s.billNo}`);
    await dbDel('sales', s.id);
    sales = (await dbAll('sales')).sort((a, b) => b.ts - a.ts);
    products = await dbAll('products');
    renderSummary(); renderList();
    toast('ลบบิลแล้ว และคืนของเข้าสต๊อกเรียบร้อย');
  }

  renderSummary();
  renderList();
}
