// product-form.js — ฟอร์มเพิ่ม/แก้สินค้า + รับเข้าสต๊อก (ใช้ร่วมกันระหว่างหน้า POS และหน้าสินค้า)
import { store, call, uploadImage } from './api.js';
import { toast, esc, modal, compressImage, busy, fmtMoney, fmtInt } from './ui.js';
import { scanBarcode } from './barcode.js';

/**
 * เปิดฟอร์มสินค้า
 * @param {object|null} p  สินค้าเดิม (แก้ไข) หรือ null (เพิ่มใหม่)
 * @param {object} opts   { barcode } ค่าตั้งต้นเมื่อเพิ่มจากการสแกน
 * @returns {Promise<object|null>} สินค้าที่บันทึกแล้ว หรือ null ถ้ายกเลิก
 */
export function openProductForm(p = null, opts = {}) {
  return new Promise(resolve => {
    const isNew = !p;
    p = p || { id: '', name: '', barcode: opts.barcode || '', detail: '', category: '', price: '', cost: '', stock: 1, minStock: 3, image: '' };
    const cats = [...new Set(store.products.map(x => x.category).filter(Boolean))].sort();

    const m = modal(`
      <h3>${isNew ? '➕ เพิ่มสินค้าใหม่' : '✏️ แก้ไขสินค้า'}</h3>
      <form id="f" autocomplete="off">
        <div><label>บาร์โค้ด / QR</label>
          <div style="display:flex;gap:6px">
            <input id="fbar" value="${esc(p.barcode)}" placeholder="สแกนหรือพิมพ์ (เว้นว่างได้)">
            <button type="button" id="fbarCam" title="สแกนด้วยกล้อง" style="flex-shrink:0;font-size:18px">📷</button>
          </div></div>
        <div><label>ชื่อสินค้า *</label><input id="fname" required value="${esc(p.name)}" placeholder="เช่น น้ำดื่ม 600ml" enterkeyhint="next"></div>
        <div class="row">
          <div><label>ราคาขาย (บาท) *</label><input id="fprice" type="number" inputmode="decimal" min="0" step="0.01" required value="${p.price}"></div>
          <div><label>${isNew ? 'จำนวนตั้งต้น' : 'คงเหลือ'}</label><input id="fstock" type="number" inputmode="numeric" min="0" step="1" value="${p.stock}"></div>
        </div>
        <div><label>รายละเอียด</label><textarea id="fdetail" placeholder="เช่น ขนาด, ยี่ห้อ, รสชาติ, หมายเหตุ">${esc(p.detail)}</textarea></div>
        <details ${p.category || p.cost || !isNew ? 'open' : ''}>
          <summary class="muted" style="cursor:pointer;padding:4px 0">ข้อมูลเพิ่มเติม (หมวด, ต้นทุน, แจ้งเตือนสต๊อก)</summary>
          <div class="row" style="margin-top:8px">
            <div><label>หมวดหมู่</label><input id="fcat" value="${esc(p.category)}" list="catList">
              <datalist id="catList">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</datalist></div>
            <div><label>ต้นทุน (บาท)</label><input id="fcost" type="number" inputmode="decimal" min="0" step="0.01" value="${p.cost}"></div>
            <div><label>แจ้งเตือนเมื่อเหลือ ≤</label><input id="fmin" type="number" inputmode="numeric" min="0" step="1" value="${p.minStock}"></div>
          </div>
        </details>
        <div><label>รูปสินค้า</label>
          <div class="img-pick">
            <div id="preview">${p.image ? `<img class="thumb" src="${esc(p.image)}">` : '<div class="thumb ph">📦</div>'}</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <button type="button" id="btnImg" class="sm">📸 ถ่าย/เลือกรูป</button>
              <button type="button" id="btnImgDel" class="sm ghost" ${p.image ? '' : 'hidden'}>ลบรูป</button>
            </div>
          </div>
          <input id="fimg" type="file" accept="image/*" capture="environment" hidden></div>
        <div class="actions">
          <button type="button" id="cancel">ยกเลิก</button>
          <button class="primary" type="submit">💾 บันทึก</button>
        </div>
      </form>`);

    const $ = id => m.el.querySelector('#' + id);
    let newImage = null;          // dataURL ที่ยังไม่ได้อัปโหลด
    let image = p.image || '';
    let done = false;
    const finish = v => { if (done) return; done = true; m.close(); resolve(v); };

    // ปิดด้วยการแตะพื้นหลัง → resolve(null)
    m.el.parentElement.addEventListener('click', e => { if (e.target === m.el.parentElement) finish(null); });
    $('cancel').onclick = () => finish(null);

    setTimeout(() => (p.barcode && !p.name ? $('fname') : (p.name ? null : $('fbar')))?.focus(), 50);

    function checkDup(code) {
      const dup = code && store.products.find(x => x.barcode === code && x.id !== p.id);
      if (dup) toast(`⚠️ บาร์โค้ดนี้ซ้ำกับสินค้า "${dup.name}"`, 'err');
      return dup;
    }
    $('fbarCam').onclick = async () => {
      const code = await scanBarcode();
      if (!code) return;
      $('fbar').value = code;
      if (!checkDup(code)) toast('สแกนสำเร็จ: ' + code);
      $('fname').focus();
    };
    $('fbar').addEventListener('change', () => checkDup($('fbar').value.trim()));

    $('btnImg').onclick = () => $('fimg').click();
    $('fimg').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        newImage = await compressImage(f, 800, 0.75);
        $('preview').innerHTML = `<img class="thumb" src="${newImage}">`;
        $('btnImgDel').hidden = false;
      } catch (err) { toast(err.message, 'err'); }
      e.target.value = '';
    });
    $('btnImgDel').onclick = () => {
      newImage = null; image = '';
      $('preview').innerHTML = '<div class="thumb ph">📦</div>';
      $('btnImgDel').hidden = true;
    };

    $('f').addEventListener('submit', async e => {
      e.preventDefault();
      const rec = {
        ...p,
        name: $('fname').value.trim(),
        barcode: $('fbar').value.trim(),
        detail: $('fdetail').value.trim(),
        category: $('fcat').value.trim(),
        price: +$('fprice').value || 0,
        cost: +$('fcost').value || 0,
        stock: Math.max(0, Math.floor(+$('fstock').value || 0)),
        minStock: Math.max(0, Math.floor(+$('fmin').value || 0)),
      };
      if (!rec.name) return toast('กรุณากรอกชื่อสินค้า', 'err');
      if (checkDup(rec.barcode)) return;
      const saved = await busy(async () => {
        rec.image = newImage ? await uploadImage(newImage, rec.barcode || rec.name) : image;
        const r = await call('upsertProduct', rec);
        return r.product;
      }, newImage ? 'กำลังอัปโหลดรูปและบันทึก…' : 'กำลังบันทึก…');
      if (!saved) return;
      toast(isNew ? `เพิ่ม "${saved.name}" แล้ว` : 'บันทึกการแก้ไขแล้ว');
      finish(saved);
    });
  });
}

/** รับสินค้าเข้า / ปรับสต๊อก */
export function openStockForm(p) {
  return new Promise(resolve => {
    const m = modal(`
      <h3>📥 รับเข้า / ปรับสต๊อก</h3>
      <p style="margin:0 0 10px"><b>${esc(p.name)}</b><br><span class="muted">คงเหลือตอนนี้ ${fmtInt(p.stock)} · ราคา ${fmtMoney(p.price)} ฿</span></p>
      <form id="f">
        <div class="tabs">
          <button type="button" data-s="1" class="active">➕ รับเข้า</button>
          <button type="button" data-s="-1">➖ ลดออก (เสีย/หาย)</button>
        </div>
        <div><label>จำนวน</label><input id="qty" type="number" inputmode="numeric" min="1" step="1" required value="1" style="font-size:22px;text-align:center"></div>
        <div class="quick-cash">${[1, 6, 10, 12, 24, 48].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div>
        <div><label>หมายเหตุ</label><input id="note" placeholder="เช่น ซื้อจากแม็คโคร"></div>
        <div class="actions"><button type="button" id="cancel">ยกเลิก</button>
          <button class="primary" type="submit">บันทึก</button></div>
      </form>`);
    const $ = id => m.el.querySelector('#' + id);
    let sign = 1;
    m.el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      m.el.querySelectorAll('[data-s]').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); sign = +b.dataset.s;
    });
    m.el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { $('qty').value = b.dataset.n; });
    $('cancel').onclick = () => { m.close(); resolve(null); };
    $('qty').select();
    $('f').addEventListener('submit', async e => {
      e.preventDefault();
      const qty = Math.floor(+$('qty').value || 0);
      if (qty <= 0) return toast('ใส่จำนวนมากกว่า 0', 'err');
      const r = await busy(() => call('adjustStock', { productId: p.id, qty: qty * sign, note: $('note').value.trim() }));
      if (!r) return;
      toast(`${sign > 0 ? 'รับเข้า' : 'ลดออก'} ${qty} — คงเหลือ ${fmtInt(r.product.stock)}`);
      m.close(); resolve(r.product);
    });
  });
}
