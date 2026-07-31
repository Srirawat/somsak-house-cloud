// pages/pos.js — หน้าแรก POS: สแกน/ค้นหา, ยิงบาร์โค้ด Enter เพิ่มอัตโนมัติ, ตัดสต๊อกเมื่อชำระเงิน
import { dbAll, dbGet, dbPut, uuid } from '../db.js';
import { fmtMoney, fmtInt, toast, esc, modal } from '../ui.js';
import { nextBillNo } from '../auth.js';

export default async function render(root, { user }) {
  let products = await dbAll('products');
  let cart = []; // {productId, name, price, qty}

  root.innerHTML = `
  <h2>หน้าแรก POS</h2>
  <div class="pos-grid">
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <div style="flex:1"><label>สแกนบาร์โค้ด / ค้นหาสินค้า (Enter เพื่อเพิ่ม)</label>
          <input id="scan" placeholder="ยิงบาร์โค้ดแล้วกด Enter หรือพิมพ์ชื่อสินค้า" style="width:100%" autofocus></div>
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
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    totalEl.textContent = fmtMoney(total) + ' ฿';
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

  scan.addEventListener('input', () => renderGrid(scan.value));
  scan.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = scan.value.trim().toLowerCase();
    if (!q) return;
    const p = products.find(x => (x.barcode || '').toLowerCase() === q)
      || products.find(x => x.name.toLowerCase() === q)
      || products.filter(x => x.name.toLowerCase().includes(q))[0];
    if (p) { addToCart(p); scan.value = ''; renderGrid(); }
    else toast('ไม่พบสินค้า: ' + scan.value, 'err');
  });

  root.querySelector('#btnClear').onclick = () => { cart = []; renderCart(); };

  root.querySelector('#btnPay').onclick = async () => {
    if (!cart.length) return toast('ตะกร้าว่าง', 'err');
    // ตรวจสต๊อกล่าสุดก่อนตัด
    for (const i of cart) {
      const p = await dbGet('products', i.productId);
      if (!p || p.stock < i.qty) return toast(`สต๊อก "${i.name}" ไม่พอ (เหลือ ${p ? p.stock : 0})`, 'err');
    }
    const billNo = await nextBillNo();
    const ts = Date.now();
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    // ตัดสต๊อก + บันทึกความเคลื่อนไหว
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
      userId: user.id, username: user.username,
    });
    const m = modal(`<h3>ชำระเงินสำเร็จ ✅</h3>
      <p>เลขที่บิล: <b>${billNo}</b></p>
      <p class="big">${fmtMoney(total)} ฿</p>
      <div class="actions"><button class="primary" id="ok">ตกลง</button></div>`);
    m.el.querySelector('#ok').onclick = m.close;
    cart = [];
    products = await dbAll('products');
    renderCart(); renderGrid(scan.value);
  };

  renderGrid();
  renderCart();
}
