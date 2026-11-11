// pages/expenses.js — จดค่าใช้จ่าย + ถ่ายรูปบิล (อัปโหลดเข้า Google Drive) + สรุปรายเดือน
import { store, call, onChange, uploadImage } from '../api.js';
import { fmtMoney, fmtDateTH, toast, esc, modal, compressImage, busy, todayISO } from '../ui.js';

export default function render(root) {
  const curMonth = todayISO().slice(0, 7);

  root.innerHTML = `
  <div class="page-head"><h2>🧾 ค่าใช้จ่าย</h2></div>
  <div class="grid2">
    <div class="card">
      <h3 style="margin-top:0">บันทึกรายการจ่าย</h3>
      <form id="f" style="display:flex;flex-direction:column;gap:10px">
        <div class="row">
          <div><label>วันที่ *</label><input id="fdate" type="date" required value="${todayISO()}"></div>
          <div><label>จำนวนเงิน (บาท) *</label><input id="famt" type="number" inputmode="decimal" min="0.01" step="0.01" required></div>
        </div>
        <div><label>รายการ *</label><input id="ftitle" required placeholder="เช่น ค่าน้ำแข็ง, ซื้อของเข้าร้าน"></div>
        <div><label>หมายเหตุ</label><input id="fnote"></div>
        <div class="img-pick">
          <div id="preview"></div>
          <button type="button" id="btnImg" class="sm">📸 ถ่ายรูปบิล</button>
          <input id="fimg" type="file" accept="image/*" capture="environment" hidden>
        </div>
        <button class="primary block" type="submit">💾 บันทึก</button>
      </form>
    </div>
    <div class="card">
      <div class="row">
        <div><label>เดือน</label><input id="month" type="month" value="${curMonth}"></div>
        <div><label>ค้นหา</label><input id="q"></div>
      </div>
      <p style="margin:14px 0 0">ยอดรวม: <span class="big" id="monthTotal">0.00 ฿</span></p>
    </div>
  </div>
  <div class="card"><div class="list" id="list"></div></div>`;

  const $ = id => root.querySelector('#' + id);
  let image = null;

  $('btnImg').onclick = () => $('fimg').click();
  $('fimg').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      image = await compressImage(f, 1000, 0.7);
      $('preview').innerHTML = `<img class="thumb" src="${image}">`;
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  });

  $('f').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      date: $('fdate').value, amount: +$('famt').value,
      title: $('ftitle').value.trim(), note: $('fnote').value.trim(),
    };
    if (!data.date || !data.title || !(data.amount > 0)) return toast('กรอกข้อมูลให้ครบถ้วน', 'err');
    const r = await busy(async () => {
      data.image = image ? await uploadImage(image, 'bill') : '';
      return call('addExpense', data);
    });
    if (!r) return;
    $('f').reset();
    $('fdate').value = todayISO();
    $('preview').innerHTML = '';
    image = null;
    toast('บันทึกแล้ว');
  });

  function renderList() {
    const mo = $('month').value;
    const f = $('q').value.trim().toLowerCase();
    const list = store.expenses
      .filter(x => !mo || x.date.startsWith(mo))
      .filter(x => !f || x.title.toLowerCase().includes(f) || (x.note || '').toLowerCase().includes(f));
    $('monthTotal').textContent = fmtMoney(list.reduce((s, x) => s + x.amount, 0)) + ' ฿';
    $('list').innerHTML = list.length ? list.map(x => `
      <div class="item">
        ${x.image ? `<img class="thumb img" data-id="${x.id}" src="${esc(x.image)}" loading="lazy" style="cursor:zoom-in" alt="">` : '<div class="thumb ph">🧾</div>'}
        <div class="main"><div class="title">${esc(x.title)}</div>
          <div class="sub">${fmtDateTH(x.ts)}${x.note ? ' · ' + esc(x.note) : ''}</div></div>
        <div class="right"><div class="amt">${fmtMoney(x.amount)}</div></div>
        <div class="acts"><button class="ghost sm del" data-id="${x.id}" title="ลบ">🗑️</button></div>
      </div>`).join('') : '<div class="empty">ไม่มีรายการในเดือนนี้</div>';

    $('list').querySelectorAll('.img').forEach(el => el.onclick = () => {
      const x = store.expenses.find(e => e.id === el.dataset.id);
      modal(`<h3>${esc(x.title)} — ${fmtMoney(x.amount)} ฿</h3><img class="bill-img" src="${esc(x.image)}">`);
    });
    $('list').querySelectorAll('.del').forEach(b => b.onclick = async () => {
      if (!confirm('ลบรายการนี้?')) return;
      if (await busy(() => call('deleteExpense', { id: b.dataset.id }), 'กำลังลบ…')) toast('ลบแล้ว');
    });
  }

  $('month').addEventListener('change', renderList);
  $('q').addEventListener('input', renderList);
  const off = onChange(renderList);
  renderList();
  return off;
}
