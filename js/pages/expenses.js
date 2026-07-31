// pages/expenses.js — บันทึกบิล, ถ่าย/อัปโหลดรูปบิล (บีบอัดอัตโนมัติ), ค้นหา, สรุปยอดเดือน
import { dbAll, dbPut, dbDel, uuid } from '../db.js';
import { fmtMoney, fmtDateTH, toast, esc, modal, compressImage } from '../ui.js';

export default async function render(root, { user }) {
  let expenses = await dbAll('expenses');

  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = `${curMonth}-${String(now.getDate()).padStart(2, '0')}`;

  root.innerHTML = `
  <h2>จดรายการจ่าย</h2>
  <div class="grid2">
    <div class="card">
      <h3 style="margin-top:0">บันทึกบิลใหม่</h3>
      <form id="f">
        <div class="row">
          <div><label>วันที่ *</label><input id="fdate" type="date" required value="${today}"></div>
          <div><label>จำนวนเงิน (บาท) *</label><input id="famt" type="number" min="0.01" step="0.01" required></div>
        </div>
        <div><label>รายการ *</label><input id="ftitle" required placeholder="เช่น ค่าน้ำแข็ง, ค่าไฟร้าน" style="width:100%"></div>
        <div><label>หมายเหตุ</label><input id="fnote" style="width:100%"></div>
        <div><label>รูปบิล — ถ่าย/อัปโหลด (บีบอัดอัตโนมัติ)</label>
          <input id="fimg" type="file" accept="image/*" capture="environment">
          <div id="preview"></div></div>
        <div class="actions"><button class="primary" type="submit">บันทึกบิล</button></div>
      </form>
    </div>
    <div class="card">
      <div class="row">
        <div><label>เดือน</label><input id="month" type="month" value="${curMonth}"></div>
        <div style="flex:1"><label>ค้นหา</label><input id="q" style="width:100%"></div>
      </div>
      <p>ยอดรวมเดือนนี้: <span class="big" id="monthTotal">0.00 ฿</span></p>
    </div>
  </div>
  <div class="card">
    <table><thead><tr>
      <th>วันที่</th><th>รายการ</th><th>หมายเหตุ</th><th>บิล</th><th class="num">จำนวนเงิน</th><th></th>
    </tr></thead><tbody id="body"></tbody></table>
  </div>`;

  const body = root.querySelector('#body');
  const monthInp = root.querySelector('#month');
  const q = root.querySelector('#q');
  let image = null;

  root.querySelector('#fimg').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) { image = null; return; }
    try {
      image = await compressImage(f, 1000, 0.7);
      root.querySelector('#preview').innerHTML = `<img class="thumb" src="${image}" style="width:90px;height:90px;margin-top:6px">`;
    } catch (err) { toast(err.message, 'err'); }
  });

  root.querySelector('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const date = root.querySelector('#fdate').value;
    const amount = +root.querySelector('#famt').value;
    const title = root.querySelector('#ftitle').value.trim();
    if (!date || !title || !(amount > 0)) return toast('กรอกข้อมูลให้ครบถ้วน', 'err');
    await dbPut('expenses', {
      id: uuid(), ts: new Date(date + 'T12:00:00').getTime(), date,
      title, amount, note: root.querySelector('#fnote').value.trim(),
      image, userId: user.id, createdAt: Date.now(),
    });
    root.querySelector('#f').reset();
    root.querySelector('#fdate').value = today;
    root.querySelector('#preview').innerHTML = '';
    image = null;
    expenses = await dbAll('expenses');
    renderList();
    toast('บันทึกบิลแล้ว');
  });

  function renderList() {
    const mo = monthInp.value;
    const f = q.value.trim().toLowerCase();
    const list = expenses
      .filter(x => !mo || x.date.startsWith(mo))
      .filter(x => !f || x.title.toLowerCase().includes(f) || (x.note || '').toLowerCase().includes(f))
      .sort((a, b) => b.ts - a.ts);

    const total = list.reduce((s, x) => s + x.amount, 0);
    root.querySelector('#monthTotal').textContent = fmtMoney(total) + ' ฿';

    body.innerHTML = list.length ? list.map(x => `
      <tr>
        <td>${fmtDateTH(x.ts)}</td>
        <td>${esc(x.title)}</td>
        <td class="muted">${esc(x.note || '')}</td>
        <td>${x.image ? `<button class="img" data-id="${x.id}">📷 ดูบิล</button>` : '—'}</td>
        <td class="num"><b>${fmtMoney(x.amount)}</b></td>
        <td><button class="danger del" data-id="${x.id}">ลบ</button></td>
      </tr>`).join('') : '<tr><td colspan="6" class="muted">ไม่มีรายการในเดือนนี้</td></tr>';

    body.querySelectorAll('.img').forEach(b => b.onclick = () => {
      const x = expenses.find(e => e.id === b.dataset.id);
      modal(`<h3>${esc(x.title)} — ${fmtMoney(x.amount)} ฿</h3><img class="bill-img" src="${x.image}">`);
    });
    body.querySelectorAll('.del').forEach(b => b.onclick = async () => {
      if (!confirm('ลบรายการนี้?')) return;
      await dbDel('expenses', b.dataset.id);
      expenses = await dbAll('expenses');
      renderList();
      toast('ลบแล้ว');
    });
  }

  monthInp.addEventListener('change', renderList);
  q.addEventListener('input', renderList);
  renderList();
}
