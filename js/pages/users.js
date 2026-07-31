// pages/users.js — จัดการผู้ใช้ & สิทธิ์ (เวอร์ชัน Cloud)
// หมายเหตุ: รีเซ็ตรหัสผ่านของคนอื่นทำจากหน้าเว็บไม่ได้ (Supabase Auth) — ให้ผู้ใช้กด "ลืมรหัสผ่าน?" ที่หน้า login
import { dbAll, dbGet, dbPut } from '../db.js';
import { fmtDateTH, toast, esc, modal } from '../ui.js';
import { MENUS, ROOMS, MEMBER_DEFAULT_PERMS, canManage } from '../auth.js';

export default async function render(root, { user: me }) {
  let users = await dbAll('users');

  root.innerHTML = `
  <h2>จัดการผู้ใช้ & สิทธิ์</h2>
  <div class="card muted">
    tester จัดการได้ทุกบัญชี · admin จัดการได้เฉพาะ member · สิทธิ์รายเมนูปรับได้เฉพาะบทบาท member<br>
    การรีเซ็ตรหัสผ่าน: ให้เจ้าของบัญชีกด "ลืมรหัสผ่าน?" ที่หน้าเข้าสู่ระบบ (ระบบส่งลิงก์ทางอีเมล)
  </div>
  <div class="card">
    <table><thead><tr>
      <th>ชื่อผู้ใช้</th><th>บทบาท</th><th>สถานะ</th><th>ห้องเช่า</th><th>สมัครเมื่อ</th><th></th>
    </tr></thead><tbody id="body"></tbody></table>
  </div>`;

  const body = root.querySelector('#body');

  function renderList() {
    const list = [...users].sort((a, b) =>
      ({ tester: 0, admin: 1, member: 2 }[a.role] - { tester: 0, admin: 1, member: 2 }[b.role]) ||
      a.username.localeCompare(b.username));
    body.innerHTML = list.map(u => {
      const mgr = canManage(me, u) && u.id !== me.id;
      return `<tr>
        <td><b>${esc(u.username)}</b>${u.id === me.id ? ' <span class="badge muted">คุณ</span>' : ''}</td>
        <td><span class="badge ${u.role === 'tester' ? 'err' : u.role === 'admin' ? 'warn' : 'ok'}">${u.role}</span></td>
        <td>${u.active ? '<span class="badge ok">ใช้งาน</span>' : '<span class="badge err">ระงับ</span>'}</td>
        <td>${esc(u.room || '—')}</td>
        <td>${fmtDateTH(u.createdAt)}</td>
        <td>${mgr ? `<button class="mng" data-id="${u.id}">จัดการ</button>` : '<span class="muted">—</span>'}</td>
      </tr>`;
    }).join('');
    body.querySelectorAll('.mng').forEach(b => b.onclick = () => openManage(users.find(u => u.id === b.dataset.id)));
  }

  function openManage(u) {
    const roleOpts = me.role === 'tester'
      ? ['member', 'admin'].map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')
      : `<option selected>member</option>`;
    const isMember = u.role === 'member';
    const permMenus = MENUS.filter(m => m.id !== 'users');
    const permOf = id => {
      const o = u.perms?.[id];
      return o === undefined || o === null ? (MEMBER_DEFAULT_PERMS[id] ?? false) : !!o;
    };
    const m = modal(`
      <h3>จัดการบัญชี — ${esc(u.username)}</h3>
      <form id="f">
        <div class="row">
          <div><label>บทบาท</label><select id="role" ${u.role === 'tester' ? 'disabled' : ''}>${roleOpts}</select></div>
          <div><label>สถานะบัญชี</label><select id="active">
            <option value="1" ${u.active ? 'selected' : ''}>ใช้งาน</option>
            <option value="0" ${!u.active ? 'selected' : ''}>ระงับ</option></select></div>
          <div><label>Assign ห้องเช่า</label><select id="room">
            <option value="">— ไม่กำหนด —</option>
            ${ROOMS.map(r => `<option ${u.room === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        </div>
        ${isMember ? `<div><label>สิทธิ์รายเมนู (เฉพาะ member)</label>
          <div id="perms" style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          ${permMenus.map(mn => `<label style="display:flex;gap:6px;align-items:center;color:var(--text)">
            <input type="checkbox" data-menu="${mn.id}" ${permOf(mn.id) ? 'checked' : ''}> ${mn.label}</label>`).join('')}
          </div></div>` : ''}
        <div class="actions">
          <button type="button" id="cancel">ยกเลิก</button>
          <button class="primary" type="submit">บันทึก</button>
        </div>
      </form>`);

    m.el.querySelector('#cancel').onclick = m.close;

    m.el.querySelector('#f').addEventListener('submit', async e => {
      e.preventDefault();
      const fresh = await dbGet('users', u.id);
      if (fresh.role !== 'tester') fresh.role = m.el.querySelector('#role').value;
      fresh.active = m.el.querySelector('#active').value === '1';
      fresh.room = m.el.querySelector('#room').value || null;
      if (isMember) {
        const perms = {};
        m.el.querySelectorAll('#perms input[type=checkbox]').forEach(cb => { perms[cb.dataset.menu] = cb.checked; });
        fresh.perms = perms;
      }
      await dbPut('users', fresh);
      m.close();
      users = await dbAll('users');
      renderList();
      toast('บันทึกแล้ว');
    });
  }

  renderList();
}
