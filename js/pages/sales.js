// pages/sales.js — รายการขายล่าสุด + สรุปกลุ่มรายวัน/เดือน/ปี, คลิกดูรายละเอียดบิล
import { dbAll } from '../db.js';
import { fmtMoney, fmtInt, fmtDateTH, fmtDateTimeTH, esc, modal } from '../ui.js';

export default async function render(root) {
  const sales = (await dbAll('sales')).sort((a, b) => b.ts - a.ts);

  root.innerHTML = `
  <h2>สรุปรายได้</h2>
  <div class="card">
    <div class="tabs">
      <button data-g="day" class="active">รายวัน</button>
      <button data-g="month">รายเดือน</button>
      <button data-g="year">รายปี</button>
    </div>
    <table><thead><tr>
      <th>ช่วงเวลา</th><th class="num">จำนวนบิล</th><th class="num">ยอดขายรวม (บาท)</th>
    </tr></thead><tbody id="sumBody"></tbody></table>
  </div>
  <div class="card">
    <h3 style="margin-top:0">รายการขายล่าสุด (คลิกเพื่อดูรายละเอียดบิล)</h3>
    <table><thead><tr>
      <th>เลขที่บิล</th><th>วันเวลา</th><th>ผู้ขาย</th><th class="num">รายการ</th><th class="num">ยอดรวม</th>
    </tr></thead><tbody id="listBody"></tbody></table>
  </div>`;

  const sumBody = root.querySelector('#sumBody');
  const listBody = root.querySelector('#listBody');

  function keyOf(ts, g) {
    const d = new Date(ts);
    if (g === 'day') return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    if (g === 'month') return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    return d.toLocaleDateString('th-TH', { year: 'numeric' });
  }

  function renderSummary(g) {
    const groups = new Map();
    for (const s of sales) {
      const k = keyOf(s.ts, g);
      const cur = groups.get(k) || { count: 0, total: 0, ts: s.ts };
      cur.count++; cur.total += s.total;
      groups.set(k, cur);
    }
    const rows = [...groups.entries()].sort((a, b) => b[1].ts - a[1].ts);
    sumBody.innerHTML = rows.length ? rows.map(([k, v]) => `
      <tr><td>${esc(k)}</td><td class="num">${fmtInt(v.count)}</td><td class="num"><b>${fmtMoney(v.total)}</b></td></tr>`).join('')
      : '<tr><td colspan="3" class="muted">ยังไม่มีรายการขาย</td></tr>';
  }

  root.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    root.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderSummary(b.dataset.g);
  });

  listBody.innerHTML = sales.length ? sales.slice(0, 50).map(s => `
    <tr class="clickable" data-id="${s.id}">
      <td><b>${esc(s.billNo)}</b></td>
      <td>${fmtDateTimeTH(s.ts)}</td>
      <td>${esc(s.username || '—')}</td>
      <td class="num">${fmtInt(s.items.length)}</td>
      <td class="num"><b>${fmtMoney(s.total)}</b></td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted">ยังไม่มีรายการขาย</td></tr>';

  listBody.querySelectorAll('tr.clickable').forEach(tr => tr.onclick = () => {
    const s = sales.find(x => x.id === tr.dataset.id);
    modal(`<h3>บิล ${esc(s.billNo)}</h3>
      <p class="muted">${fmtDateTimeTH(s.ts)} · ผู้ขาย: ${esc(s.username || '—')}</p>
      <table><thead><tr><th>สินค้า</th><th class="num">ราคา</th><th class="num">จำนวน</th><th class="num">รวม</th></tr></thead>
      <tbody>${s.items.map(i => `<tr><td>${esc(i.name)}</td><td class="num">${fmtMoney(i.price)}</td>
        <td class="num">${fmtInt(i.qty)}</td><td class="num">${fmtMoney(i.price * i.qty)}</td></tr>`).join('')}</tbody></table>
      <p class="big" style="text-align:right">${fmtMoney(s.total)} ฿</p>`);
  });

  renderSummary('day');
}
