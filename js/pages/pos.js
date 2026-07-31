// pages/pos.js — หน้าแรก POS: สแกน/ค้นหา, ยิงบาร์โค้ด Enter เพิ่มอัตโนมัติ,
// ชำระเงินสด (คำนวณเงินทอน) หรือ QR (ยืนยันเอง), ตัดสต๊อกเมื่อชำระเงิน
import { dbAll, dbGet, dbPut, uuid } from '../db.js';
import { fmtMoney, fmtInt, toast, esc, modal, compressImage } from '../ui.js';
import { nextBillNo } from '../auth.js';
import { scanBarcode } from '../barcode.js';

export default async function render(root, { user }) {
  let products = await dbAll('products');
  let cart = []; // {productId, name, price, qty}
  const canEditQR = user.role === 'tester' || user.role === 'admin';

  root.innerHTML = `
  <h2>หน้าแรก POS</h2>
  <div class="pos-grid">
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <div style="flex:1"><label>สแกนบาร์โค้ด / ค้นหาสินค้า (Enter เพื่อเพิ่ม)</label>
          <input id="scan" placeholder="ยิงบาร์โค้ดแล้วกด Enter หรือพิมพ์ชื่อสินค้า" style="width:100%" autofocus></div>
        <div><button class="primary" id="btnCam" title="เปิดกล้องสแกนบาร์โค้ด">📷 สแกนด้วยกล้อง</button></div>
      </div>
      <div class="prod-list" id="grid"></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">ตะกร้าสินค้า</h3>
      <table><thead><tr>
        <th>สินค้า</th><th class="num">ราคา</th><th class="num">จำนวน</th>
        <th class="num">ส่วนลด</th><th class="num">รวม</th><th></th>
      </tr></thead><tbody id="cartBody"></tbody></table>
      <div class="pos-total" id="total">0.00 ฿</div>
      <div style="text-align:right;margin-top:10px">
        <button id="btnClear">ล้างตะกร้า</button>
        <button class="primary" id="btnPay" style="font-size:16px;padding:10px 26px">ชำระเงิน</button>
      </div>
      <div class="muted" style="margin-top:6px">* ช่องส่วนลดปิดใช้งานไว้ตามสเปค</div>
    </div>
  </div>`;

  const scan = root.querySelector('#scan');
  const grid = root.querySelector('#grid');
  const cartBody = root.querySelector('#cartBody');
  const totalEl = root.querySelector('#total');

  const cartTotal = () => cart.reduce((s, i) => s + i.price * i.qty, 0);

  function renderGrid(filter = '') {
    const f = filter.trim().toLowerCase();
    const list = products.filter(p =>
      !f || p.name.toLowerCase().includes(f) || (p.barcode || '').toLowerCase().includes(f));
    grid.innerHTML = list.length ? list.map(p => `
      <div class="prod-card" data-id="${p.id}">
        <div class="name">${esc(p.name)}</div>
        <div class="price">${fmtMoney(p.price)} ฿</div>
        <div class="stk">คงเหลือ ${fmtInt(p.stock)}</div>
      </div>`).join('')
      : '<div class="muted">ไม่พบสินค้า — เพิ่มได้ที่เมนู "รายละเอียดสินค้า"</div>';
    grid.querySelectorAll('.prod-card').forEach(el =>
      el.addEventListener('click', () => addToCart(products.find(p => p.id === el.dataset.id))));
  }

  function addToCart(p) {
    if (!p) return;
    if ((p.stock || 0) <= 0) return toast(`"${p.name}" สินค้าหมดสต๊อก`, 'err');
    const item = cart.find(i => i.productId === p.id);
    if (item) {
      if (item.qty + 1 > p.stock) return toast('เกินจำนวนคงเหลือในสต๊อก', 'err');
      item.qty++;
    } else {
      cart.push({ productId: p.id, name: p.name, price: p.price, qty: 1 });
    }
    renderCart();
  }

  function renderCart() {
    cartBody.innerHTML = cart.map((i, idx) => `
      <tr>
        <td>${esc(i.name)}</td>
        <td class="num">${fmtMoney(i.price)}</td>
        <td class="num"><input type="number" min="1" value="${i.qty}" data-idx="${idx}" class="qty" style="width:64px"></td>
        <td class="num"><input type="number" value="0" disabled title="ปิดใช้งานตามสเปค" style="width:64px"></td>
        <td class="num">${fmtMoney(i.price * i.qty)}</td>
        <td><button class="ghost rm" data-idx="${idx}">✕</button></td>
      </tr>`).join('');
    totalEl.textContent = fmtMoney(cartTotal()) + ' ฿';
    cartBody.querySelectorAll('.qty').forEach(inp => inp.addEventListener('change', () => {
      const idx = +inp.dataset.idx;
      const p = products.find(x => x.id === cart[idx].productId);
      let q = Math.max(1, Math.floor(+inp.value || 1));
      if (p && q > p.stock) { q = p.stock; toast('เกินจำนวนคงเหลือในสต๊อก', 'err'); }
      cart[idx].qty = q;
      renderCart();
    }));
    cartBody.querySelectorAll('.rm').forEach(btn => btn.addEventListener('click', () => {
      cart.splice(+btn.dataset.idx, 1); renderCart();
    }));
  }

  // ค้นหาสินค้าจากข้อความ/บาร์โค้ด แล้วเพิ่มลงตะกร้า
  function submitCode(raw) {
    const q = String(raw || '').trim().toLowerCase();
    if (!q) return;
    const p = products.find(x => (x.barcode || '').toLowerCase() === q)
      || products.find(x => x.name.toLowerCase() === q)
      || products.filter(x => x.name.toLowerCase().includes(q))[0];
    if (p) { addToCart(p); scan.value = ''; renderGrid(); }
    else toast('ไม่พบสินค้า: ' + raw, 'err');
  }

  scan.addEventListener('input', () => renderGrid(scan.value));
  scan.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitCode(scan.value);
  });

  // 📷 เปิดกล้องสแกนบาร์โค้ด → เลขขึ้นในช่อง แล้วเพิ่มลงตะกร้าอัตโนมัติ
  root.querySelector('#btnCam').onclick = async () => {
    const code = await scanBarcode();
    if (!code) return;
    scan.value = code;
    renderGrid(code);
    if (products.some(x => (x.barcode || '') === code)) {
      submitCode(code);
      toast('สแกนสำเร็จ: ' + code);
    } else {
      toast(`สแกนได้ ${code} — ยังไม่มีสินค้านี้ในระบบ (เพิ่มที่เมนู "รายละเอียดสินค้า")`, 'err');
    }
  };

  root.querySelector('#btnClear').onclick = () => { cart = []; renderCart(); };

  // ---------------- ชำระเงิน ----------------
  root.querySelector('#btnPay').onclick = async () => {
    if (!cart.length) return toast('ตะกร้าว่าง', 'err');
    for (const i of cart) {
      const p = await dbGet('products', i.productId);
      if (!p || p.stock < i.qty) return toast(`สต๊อก "${i.name}" ไม่พอ (เหลือ ${p ? p.stock : 0})`, 'err');
    }
    openPayModal(cartTotal());
  };

  async function openPayModal(total) {
    const qrSetting = (await dbGet('settings', 'qrImage')) || {};
    let qrImage = qrSetting.image || null;

    const m = modal(`
      <h3 style="margin-top:0">ชำระเงิน</h3>
      <div class="pay-amount">ยอดที่ต้องชำระ <b>${fmtMoney(total)}</b> ฿</div>
      <div class="tabs pay-tabs">
        <button type="button" data-m="cash" class="active">💵 เงินสด</button>
        <button type="button" data-m="qr">📱 QR พร้อมเพย์</button>
      </div>
      <div id="payPanel"></div>
      <div class="actions"><button type="button" id="payCancel">ยกเลิก</button></div>`);

    m.el.querySelector('#payCancel').onclick = m.close;
    const panel = m.el.querySelector('#payPanel');

    function showCash() {
      panel.innerHTML = `
        <label>รับเงินมา (บาท)</label>
        <input id="recv" type="number" min="0" step="0.01" inputmode="decimal"
               placeholder="เช่น 100" style="width:100%;font-size:20px;text-align:right" autofocus>
        <div class="quick-cash" id="quick"></div>
        <div class="change-box" id="changeBox">เงินทอน <b>0.00</b> ฿</div>
        <div style="text-align:right;margin-top:10px">
          <button class="primary" id="confirmCash" style="font-size:16px;padding:10px 24px" disabled>ยืนยันการชำระ</button>
        </div>`;

      const recv = panel.querySelector('#recv');
      const box = panel.querySelector('#changeBox');
      const btn = panel.querySelector('#confirmCash');

      // ปุ่มลัด: ยอดพอดี + ปัดขึ้นแบงก์ที่ใช้บ่อย
      const notes = [20, 50, 100, 500, 1000].filter(n => n >= total);
      const quick = [{ v: total, label: 'พอดี ' + fmtInt(Math.ceil(total)) }]
        .concat(notes.slice(0, 4).map(n => ({ v: n, label: fmtInt(n) })));
      panel.querySelector('#quick').innerHTML = quick
        .map(q => `<button type="button" data-v="${q.v}">${q.label}</button>`).join('');
      panel.querySelectorAll('#quick button').forEach(b => b.onclick = () => {
        recv.value = (+b.dataset.v).toFixed(2);
        update();
      });

      function update() {
        const got = parseFloat(recv.value);
        if (!isFinite(got) || got <= 0) {
          box.className = 'change-box';
          box.innerHTML = 'เงินทอน <b>0.00</b> ฿';
          btn.disabled = true;
          return;
        }
        const change = got - total;
        if (change < -0.005) {
          box.className = 'change-box short';
          box.innerHTML = `❌ เงินยังขาดอีก <b>${fmtMoney(-change)}</b> ฿`;
          btn.disabled = true;
        } else {
          box.className = 'change-box ok';
          box.innerHTML = `เงินทอน <b>${fmtMoney(change)}</b> ฿`;
          btn.disabled = false;
        }
      }
      recv.addEventListener('input', update);
      recv.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !btn.disabled) { e.preventDefault(); btn.click(); }
      });
      btn.onclick = () => {
        const got = parseFloat(recv.value);
        finishSale(m, total, 'cash', got, got - total);
      };
      recv.focus();
    }

    function showQR() {
      panel.innerHTML = `
        <div class="qr-box">
          ${qrImage
            ? `<img src="${qrImage}" alt="QR พร้อมเพย์">`
            : `<div class="qr-empty">ยังไม่ได้ตั้งรูป QR<br>
                 <span class="muted">${canEditQR ? 'กดปุ่ม "เปลี่ยนรูป QR" ด้านล่างเพื่ออัปโหลด' : 'แจ้งผู้ดูแลระบบให้อัปโหลดรูป QR'}</span></div>`}
        </div>
        <div class="pay-amount" style="margin-top:8px">ให้ลูกค้าสแกนจ่าย <b>${fmtMoney(total)}</b> ฿</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;flex-wrap:wrap">
          <span>
            ${canEditQR ? `<button type="button" id="btnQrEdit">🖼️ เปลี่ยนรูป QR</button>
              ${qrImage ? '<button type="button" class="danger" id="btnQrDel">ลบรูป</button>' : ''}` : ''}
          </span>
          <button class="primary" id="confirmQr" style="font-size:16px;padding:10px 24px">✅ ยืนยันว่าชำระเงินแล้ว</button>
        </div>
        <input id="qrFile" type="file" accept="image/*" hidden>`;

      panel.querySelector('#confirmQr').onclick = () => finishSale(m, total, 'qr', null, 0);

      if (canEditQR) {
        const file = panel.querySelector('#qrFile');
        panel.querySelector('#btnQrEdit').onclick = () => file.click();
        file.addEventListener('change', async e => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            qrImage = await compressImage(f, 900, 0.85);
            await dbPut('settings', { key: 'qrImage', image: qrImage, updatedAt: Date.now(), updatedBy: user.username });
            toast('บันทึกรูป QR แล้ว — ใช้ได้ทุกเครื่อง');
            showQR();
          } catch (err) { toast(err.message, 'err'); }
        });
        const del = panel.querySelector('#btnQrDel');
        if (del) del.onclick = async () => {
          if (!confirm('ลบรูป QR ที่ตั้งไว้?')) return;
          qrImage = null;
          await dbPut('settings', { key: 'qrImage', image: null, updatedAt: Date.now(), updatedBy: user.username });
          toast('ลบรูป QR แล้ว');
          showQR();
        };
      }
    }

    m.el.querySelectorAll('.pay-tabs button').forEach(b => b.onclick = () => {
      m.el.querySelectorAll('.pay-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      b.dataset.m === 'cash' ? showCash() : showQR();
    });
    showCash();
  }

  // บันทึกการขาย + ตัดสต๊อก
  async function finishSale(payModal, total, payMethod, received, change) {
    for (const i of cart) {
      const p = await dbGet('products', i.productId);
      if (!p || p.stock < i.qty) return toast(`สต๊อก "${i.name}" ไม่พอ (เหลือ ${p ? p.stock : 0})`, 'err');
    }
    const billNo = await nextBillNo();
    const ts = Date.now();
    for (const i of cart) {
      const p = await dbGet('products', i.productId);
      p.stock -= i.qty;
      await dbPut('products', p);
      await dbPut('stock_moves', {
        id: uuid(), productId: p.id, ts, type: 'sale', qty: -i.qty,
        note: `ขายบิล ${billNo}`, userId: user.id,
      });
    }
    await dbPut('sales', {
      id: uuid(), billNo, ts, total,
      items: cart.map(i => ({ ...i })),
      payMethod, received: received ?? null, change: change ?? 0,
      userId: user.id, username: user.username,
    });

    payModal.close();
    const m = modal(`<h3 style="margin-top:0">ชำระเงินสำเร็จ ✅</h3>
      <p>เลขที่บิล: <b>${billNo}</b> · วิธีชำระ: <b>${payMethod === 'cash' ? '💵 เงินสด' : '📱 QR พร้อมเพย์'}</b></p>
      <p class="big">${fmtMoney(total)} ฿</p>
      ${payMethod === 'cash' ? `<div class="result-box">
        <div class="line">รับเงินมา <b>${fmtMoney(received)}</b> ฿</div>
        <div class="line" style="font-size:22px">💰 เงินทอน <b>${fmtMoney(change)}</b> ฿</div></div>` : ''}
      <div class="actions"><button class="primary" id="ok">ตกลง</button></div>`);
    m.el.querySelector('#ok').onclick = m.close;

    cart = [];
    products = await dbAll('products');
    renderCart(); renderGrid(scan.value);
    scan.focus();
  }

  renderGrid();
  renderCart();
}
