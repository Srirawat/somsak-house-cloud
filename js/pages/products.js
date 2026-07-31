// pages/products.js — เพิ่ม/แก้/ลบ, รูปสินค้า, ค้นหา+กรองหมวด, แจ้งเตือนสต็อกต่ำ
import { dbAll, dbPut, dbDel, uuid } from '../db.js';
import { fmtMoney, fmtInt, toast, esc, modal, compressImage } from '../ui.js';

export default async function render(root, { user }) {
  let products = await dbAll('products');

  root.innerHTML = `
  <h2>รายละเอียดสินค้า</h2>
  <div class="card">
    <div class="row">
      <div style="flex:1"><label>ค้นหา (ชื่อ/บาร์โค้ด)</label><input id="q" style="width:100%"></div>
      <div><label>หมวดหมู่</label><select id="cat"><option value="">ทั้งหมด</option></select></div>
      <div><button class="primary" id="btnAdd">+ เพิ่มสินค้า</button></div>
    </div>
    <div id="lowWarn"></div>
  </div>
  <div class="card">
    <table><thead><tr>
      <th>รูป</th><th>ชื่อสินค้า</th><th>บาร์โค้ด</th><th>หมวด</th>
      <th class="num">ราคาขาย</th><th class="num">คงเหลือ</th><th class="num">จุดสั่งซื้อ</th><th></th>
    </tr></thead><tbody id="body"></tbody></table>
  </div>`;

  const q = root.querySelector('#q');
  const cat = root.querySelector('#cat');
  const body = root.querySelector('#body');

  function refreshCats() {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const cur = cat.value;
    cat.innerHTML = '<option value="">ทั้งหมด</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
    cat.value = cur;
  }

  function renderList() {
    const f = q.value.trim().toLowerCase();
    const list = products
      .filter(p => !f || p.name.toLowerCase().includes(f) || (p.barcode || '').toLowerCase().includes(f))
      .filter(p => !cat.value || p.category === cat.value)
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));

    body.innerHTML = list.length ? list.map(p => {
      const low = (p.stock || 0) <= (p.minStock ?? 0);
      return `<tr class="${low ? 'low-stock' : ''}">
        <td>${p.image ? `<img class="thumb" src="${p.image}">` : '—'}</td>
        <td>${esc(p.name)} ${low ? '<span class="badge warn">สต็อกต่ำ</span>' : ''}</td>
        <td>${esc(p.barcode || '—')}</td>
        <td>${esc(p.category || '—')}</td>
        <td class="num">${fmtMoney(p.price)}</td>
        <td class="num">${fmtInt(p.stock)}</td>
        <td class="num">${fmtInt(p.minStock ?? 0)}</td>
        <td><button class="edit" data-id="${p.id}">แก้ไข</button>
            <button class="danger del" data-id="${p.id}">ลบ</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="muted">ยังไม่มีสินค้า</td></tr>';

    const lows = products.filter(p => (p.stock || 0) <= (p.minStock ?? 0));
    root.querySelector('#lowWarn').innerHTML = lows.length
      ? `<div class="warn-box">⚠️ สินค้าสต็อกต่ำ ${lows.length} รายการ: ${lows.map(p => esc(p.name)).join(', ')}</div>` : '';

    body.querySelectorAll('.edit').forEach(b => b.onclick = () => openForm(products.find(p => p.id === b.dataset.id)));
    body.querySelectorAll('.del').forEach(b => b.onclick = async () => {
      const p = products.find(x => x.id === b.dataset.id);
      if (!confirm(`ลบสินค้า "${p.name}" ?`)) return;
      await dbDel('products', p.id);
      products = await dbAll('products');
      refreshCats(); renderList();
      toast('ลบสินค้าแล้ว');
    });
  }

  function openForm(p = null) {
    const isNew = !p;
    p = p || { id: uuid(), name: '', barcode: '', category: '', price: 0, cost: 0, stock: 0, minStock: 3, image: null };
    const m = modal(`
      <h3>${isNew ? 'เพิ่มสินค้า' : 'แก้ไขสินค้า'}</h3>
      <form id="f">
        <div><label>ชื่อสินค้า *</label><input id="fname" required value="${esc(p.name)}"></div>
        <div class="row">
          <div><label>บาร์โค้ด</label><input id="fbar" value="${esc(p.barcode || '')}"></div>
          <div><label>หมวดหมู่</label><input id="fcat" value="${esc(p.category || '')}" list="catList">
            <datalist id="catList">${[...new Set(products.map(x => x.category).filter(Boolean))].map(c => `<option>${esc(c)}</option>`).join('')}</datalist></div>
        </div>
        <div class="row">
          <div><label>ราคาขาย (บาท) *</label><input id="fprice" type="number" min="0" step="0.01" required value="${p.price}"></div>
          <div><label>ต้นทุน (บาท)</label><input id="fcost" type="number" min="0" step="0.01" value="${p.cost || 0}"></div>
        </div>
        <div class="row">
          <div><label>จำนวนคงเหลือ</label><input id="fstock" type="number" min="0" step="1" value="${p.stock || 0}"></div>
          <div><label>จุดสั่งซื้อ (แจ้งเตือนสต็อกต่ำ)</label><input id="fmin" type="number" min="0" step="1" value="${p.minStock ?? 3}"></div>
        </div>
        <div><label>รูปสินค้า (บีบอัดอัตโนมัติ)</label><input id="fimg" type="file" accept="image/*">
          <div id="preview">${p.image ? `<img class="thumb" src="${p.image}" style="width:80px;height:80px">` : ''}</div></div>
        <div class="actions">
          <button type="button" id="cancel">ยกเลิก</button>
          <button class="primary" type="submit">บันทึก</button>
        </div>
      </form>`);
    let image = p.image;
    m.el.querySelector('#fimg').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        image = await compressImage(f, 600, 0.72);
        m.el.querySelector('#preview').innerHTML = `<img class="thumb" src="${image}" style="width:80px;height:80px">`;
      } catch (err) { toast(err.message, 'err'); }
    });
    m.el.querySelector('#cancel').onclick = m.close;
    m.el.querySelector('#f').addEventListener('submit', async e => {
      e.preventDefault();
      const oldStock = isNew ? 0 : (p.stock || 0);
      const rec = {
        ...p,
        name: m.el.querySelector('#fname').value.trim(),
        barcode: m.el.querySelector('#fbar').value.trim(),
        category: m.el.querySelector('#fcat').value.trim(),
        price: +m.el.querySelector('#fprice').value || 0,
        cost: +m.el.querySelector('#fcost').value || 0,
        stock: Math.max(0, Math.floor(+m.el.querySelector('#fstock').value || 0)),
        minStock: Math.max(0, Math.floor(+m.el.querySelector('#fmin').value || 0)),
        image,
        updatedAt: Date.now(),
      };
      if (!rec.name) return toast('กรุณากรอกชื่อสินค้า', 'err');
      await dbPut('products', rec);
      if (rec.stock !== oldStock) {
        await dbPut('stock_moves', {
          id: uuid(), productId: rec.id, ts: Date.now(), type: isNew ? 'in' : 'adjust',
          qty: rec.stock - oldStock, note: isNew ? 'ตั้งต้นสินค้าใหม่' : 'แก้ไขจากหน้าสินค้า', userId: user.id,
        });
      }
      m.close();
      products = await dbAll('products');
      refreshCats(); renderList();
      toast(isNew ? 'เพิ่มสินค้าแล้ว' : 'บันทึกการแก้ไขแล้ว');
    });
  }

  root.querySelector('#btnAdd').onclick = () => openForm();
  q.addEventListener('input', renderList);
  cat.addEventListener('change', renderList);
  refreshCats(); renderList();
}
