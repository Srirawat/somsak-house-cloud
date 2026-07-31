// pages/rental-records.js — ภาพรวมทุกห้อง + แยกรายห้อง, สถานะชำระ/ค้างชำระ (ห้อง 2001–2011)
import { dbAll, dbGet, dbPut, dbDel } from '../db.js';
import { fmtMoney, fmtInt, fmtDateTH, toast, esc } from '../ui.js';
import { ROOMS } from '../auth.js';

export default async function render(root, { user }) {
  let records = await dbAll('rental_records');
  const isMember = user.role === 'member';
  const canEdit = user.role === 'tester' || user.role === 'admin';
  const rooms = isMember ? (user.room ? [user.room] : []) : ROOMS;
  let selected = rooms[0] || null;

  if (isMember && !user.room) {
    root.innerHTML = `<h2>บันทึกบ้านเช่า</h2>
      <div class="card muted">บัญชีของคุณยังไม่ถูก assign เข้าห้องเช่า — ติดต่อผู้ดูแลระบบ</div>`;
    return;
  }

  root.innerHTML = `
  <h2>บันทึกบ้านเช่า ${isMember ? `(ห้อง ${esc(user.room)} — อ่านอย่างเดียว)` : ''}</h2>
  <div class="card"><div class="room-grid" id="roomGrid"></div></div>
  <div class="card"><h3 style="margin-top:0" id="detailTitle"></h3>
    <table><thead><tr>
      <th>เดือน</th><th>วันที่บันทึก</th><th class="num">น้ำ (หน่วย)</th><th class="num">ไฟ (หน่วย)</th>
      <th class="num">ค่าน้ำ</th><th class="num">ค่าไฟ</th><th class="num">ค่าเช่า</th><th class="num">รวม</th>
      <th>สถานะ</th>${canEdit ? '<th></th>' : ''}
    </tr></thead><tbody id="detail"></tbody></table>
  </div>`;

  const grid = root.querySelector('#roomGrid');
  const detail = root.querySelector('#detail');

  function latestOf(room) {
    return records.filter(r => r.room === room).sort((a, b) => b.ts - a.ts)[0] || null;
  }

  function renderGrid() {
    grid.innerHTML = rooms.map(room => {
      const last = latestOf(room);
      const badge = !last ? '<span class="badge muted">ไม่มีข้อมูล</span>'
        : last.status === 'paid' ? '<span class="badge ok">ชำระแล้ว</span>'
        : '<span class="badge err">ค้างชำระ</span>';
      return `<div class="room-card ${room === selected ? 'active' : ''}" data-room="${room}">
        <div class="no">ห้อง ${room}</div>
        <div class="muted">${last ? `${esc(last.month || '')} · ${fmtMoney(last.total)} ฿` : '—'}</div>
        <div style="margin-top:4px">${badge}</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.room-card').forEach(el => el.onclick = () => {
      selected = el.dataset.room;
      renderGrid(); renderDetail();
    });
  }

  function renderDetail() {
    root.querySelector('#detailTitle').textContent = selected ? `ประวัติห้อง ${selected}` : 'เลือกห้อง';
    const list = records.filter(r => r.room === selected).sort((a, b) => b.ts - a.ts);
    detail.innerHTML = list.length ? list.map(r => `
      <tr>
        <td>${esc(r.month || '—')}</td>
        <td>${fmtDateTH(r.ts)}</td>
        <td class="num">${fmtInt(r.unitsW)}</td>
        <td class="num">${fmtInt(r.unitsE)}</td>
        <td class="num">${fmtMoney(r.waterAmt)}</td>
        <td class="num">${fmtMoney(r.elecAmt)}</td>
        <td class="num">${fmtMoney(r.rent)}</td>
        <td class="num"><b>${fmtMoney(r.total)}</b></td>
        <td>${r.status === 'paid' ? '<span class="badge ok">ชำระแล้ว</span>' : '<span class="badge err">ค้างชำระ</span>'}</td>
        ${canEdit ? `<td>
          <button class="tgl" data-id="${r.id}">${r.status === 'paid' ? 'ตั้งเป็นค้างชำระ' : 'ตั้งเป็นชำระแล้ว'}</button>
          <button class="danger del" data-id="${r.id}">ลบ</button></td>` : ''}
      </tr>`).join('')
      : `<tr><td colspan="${canEdit ? 10 : 9}" class="muted">ยังไม่มีบิลของห้องนี้ — สร้างได้ที่เมนู "คำนวณบ้านเช่า"</td></tr>`;

    if (canEdit) {
      detail.querySelectorAll('.tgl').forEach(b => b.onclick = async () => {
        const rec = await dbGet('rental_records', b.dataset.id);
        rec.status = rec.status === 'paid' ? 'unpaid' : 'paid';
        rec.paidAt = rec.status === 'paid' ? Date.now() : null;
        await dbPut('rental_records', rec);
        records = await dbAll('rental_records');
        renderGrid(); renderDetail();
        toast('อัปเดตสถานะแล้ว');
      });
      detail.querySelectorAll('.del').forEach(b => b.onclick = async () => {
        if (!confirm('ลบบิลนี้?')) return;
        await dbDel('rental_records', b.dataset.id);
        records = await dbAll('rental_records');
        renderGrid(); renderDetail();
        toast('ลบแล้ว');
      });
    }
  }

  renderGrid();
  renderDetail();
}
