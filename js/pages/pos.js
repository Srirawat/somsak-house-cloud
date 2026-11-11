// pages/pos.js — หน้าขาย: สแกน/ค้นหา/แตะสินค้า → ตะกร้า → ชำระเงินสด/QR
// สแกนเจอบาร์โค้ดที่ยังไม่มีในระบบ → เพิ่มสินค้าใหม่ได้ทันทีแล้วใส่ตะกร้าต่อเลย
import { store, call, onChange, uploadImage, findByBarcode } from '../api.js';
import { fmtMoney, fmtInt, toast, esc, modal, compressImage, busy } from '../ui.js';
import { scanBarcode } from '../barcode.js';
import { openProductForm } from '../product-form.js';

// เก็บตะกร้าไว้นอก render → สลับไปหน้าอื่นแล้วกลับมา ตะกร้ายังอยู่
let cart = []; // {productId, name, price, qty}
let category = '';

export default function render(root) {
  root.innerHTML = `
  <div class="pos-grid">
    <div>
      <div class="scan-row">
        <div class="search"><input id="scan" placeholder="ค้นหา / ยิงบาร์โค้ด แล้วกด Enter" enterkeyhint="search" autocomplete="off"></div>
        <button class="primary cam" id="btnCam" title="สแกนด้วยกล้อง">📷</button>
      </div>
      <div class="chips" id="chips"></div>
      <div class="prod-list" id="grid"></div>
    </div>
    <div class="card cart-panel" id="cartPanel">
      <div class="sheet-head"><b style="font-size:17px">🛒 ตะกร้าสินค้า</b><button class="ghost sm" id="closeSheet">✕ ปิด</button></div>
      <h3 class="cart-title" style="margin-top:0">🛒 ตะกร้าสินค้า</h3>
      <div class="cart-items" id="cartItems"></div>
      <div class="pos-total"><span>ยอดรวม</span><b id="total">0.00</b></div>
      <div class="cart-actions">
        <button id="btnClear">ล้าง</button>
        <button class="primary" id="btnPay">💰 ชำระเงิน</button>
      </div>
    </div>
  </div>
  <button class="cart-bar empty" id="cartBar"></button>
  <div class="sheet-back" id="sheetBack" hidden></div>`;

  const $ = id => root.querySelector('#' + id);
  const scan = $('scan'), grid = $('grid'), panel = $('cartPanel');

  const cartTotal = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
  const stockOf = id => store.products.find(p => p.id === id)?.stock ?? 0;

  /* ---------- สินค้า ---------- */
  function renderChips() {
    const cats = [...new Set(store.products.map(p => p.category).filter(Boolean))].sort();
    if (category && !cats.includes(category)) category = '';
    $('chips').hidden = !cats.length;
    $('chips').innerHTML = ['', ...cats].map(c =>
      `<button data-c="${esc(c)}" class="${c === category ? 'active' : ''}">${c ? esc(c) : 'ทั้งหมด'}</button>`).join('');
    $('chips').querySelectorAll('button').forEach(b => b.onclick = () => { category = b.dataset.c; renderChips(); renderGrid(); });
  }

  function renderGrid() {
    const f = scan.value.trim().toLowerCase();
    const list = store.products
      .filter(p => !category || p.category === category)
      .filter(p => !f || p.name.toLowerCase().includes(f) || (p.barcode || '').toLowerCase().includes(f))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
    grid.innerHTML = list.length ? list.map(p => {
      const inCart = cart.find(i => i.productId === p.id)?.qty;
      return `<div class="prod-card ${p.stock <= 0 ? 'out' : ''}" data-id="${p.id}">
        ${inCart ? `<span class="qty-badge">${inCart}</span>` : ''}
        <div class="pic">${p.image ? `<img src="${esc(p.image)}" loading="lazy" alt="">` : '📦'}</div>
        <div class="name">${esc(p.name)}</div>
        <div class="price">${fmtMoney(p.price)} ฿</div>
        <div class="stk">${p.stock > 0 ? 'เหลือ ' + fmtInt(p.stock) : 'หมด'}</div>
      </div>`;
    }).join('')
      : `<div class="empty" style="grid-column:1/-1">${store.products.length
          ? 'ไม่พบสินค้า'
          : 'ยังไม่มีสินค้า<br><br><button class="primary" id="addFirst">📷 สแกนเพิ่มสินค้าแรก</button>'}</div>`;
    grid.querySelectorAll('.prod-card').forEach(el =>
      el.addEventListener('click', () => addToCart(store.products.find(p => p.id === el.dataset.id))));
    const af = grid.querySelector('#addFirst');
    if (af) af.onclick = () => scanAndAdd();
  }

  /* ---------- ตะกร้า ---------- */
  function addToCart(p, qty = 1) {
    if (!p) return;
    const item = cart.find(i => i.productId === p.id);
    const want = (item?.qty || 0) + qty;
    if (p.stock <= 0) return toast(`"${p.name}" สินค้าหมด`, 'err');
    if (want > p.stock) return toast(`"${p.name}" เหลือแค่ ${p.stock}`, 'err');
    if (item) item.qty = want;
    else cart.push({ productId: p.id, name: p.name, price: p.price, qty });
    renderCart(); renderGrid();
  }

  function renderCart() {
    $('cartItems').innerHTML = cart.length ? cart.map((i, idx) => `
      <div class="cart-line">
        <div class="main"><div class="name">${esc(i.name)}</div><div class="unit">${fmtMoney(i.price)} ฿</div></div>
        <div class="stepper">
          <button data-d="-1" data-i="${idx}">−</button>
          <input class="qty" type="number" inputmode="numeric" min="1" value="${i.qty}" data-i="${idx}">
          <button data-d="1" data-i="${idx}">+</button>
        </div>
        <div class="sum">${fmtMoney(i.price * i.qty)}</div>
      </div>`).join('')
      : '<div class="empty">ตะกร้าว่าง — แตะสินค้าหรือสแกนเพื่อเพิ่ม</div>';
    $('total').textContent = fmtMoney(cartTotal()) + ' ฿';
    $('btnPay').disabled = !cart.length;

    const bar = $('cartBar');
    bar.classList.toggle('empty', !cart.length);
    bar.innerHTML = `<span>🛒 ${fmtInt(cartCount())} ชิ้น</span><span>${fmtMoney(cartTotal())} ฿ ▲</span>`;
    root.classList.toggle('has-cart', cart.length > 0);
    if (!cart.length) closeSheet();

    $('cartItems').querySelectorAll('[data-d]').forEach(b => b.onclick = () => setQty(+b.dataset.i, cart[+b.dataset.i].qty + +b.dataset.d));
    $('cartItems').querySelectorAll('.qty').forEach(inp => inp.onchange = () => setQty(+inp.dataset.i, Math.floor(+inp.value || 0)));
  }

  function setQty(idx, q) {
    const it = cart[idx];
    if (!it) return;
    if (q <= 0) cart.splice(idx, 1);
    else {
      const max = stockOf(it.productId);
      if (q > max) { q = max; toast(`"${it.name}" เหลือแค่ ${max}`, 'err'); }
      it.qty = q;
    }
    renderCart(); renderGrid();
  }

  // มือถือ: ตะกร้าเป็น bottom sheet
  function openSheet() { panel.classList.add('open'); $('sheetBack').hidden = false; }
  function closeSheet() { panel.classList.remove('open'); $('sheetBack').hidden = true; }
  $('cartBar').onclick = openSheet;
  $('closeSheet').onclick = closeSheet;
  $('sheetBack').onclick = closeSheet;

  $('btnClear').onclick = () => {
    if (cart.length && !confirm('ล้างตะกร้าทั้งหมด?')) return;
    cart = []; renderCart(); renderGrid();
  };

  /* ---------- สแกน / ค้นหา ---------- */
  async function offerAddNew(code) {
    const m = modal(`<h3>ไม่พบสินค้านี้ในระบบ</h3>
      <div class="scanned-code"><span>${esc(code)}</span></div>
      <p class="muted">ต้องการเพิ่มเป็นสินค้าใหม่แล้วใส่ตะกร้าเลยไหม?</p>
      <div class="actions"><button id="no">ไม่ใช่</button><button class="primary" id="yes">➕ เพิ่มสินค้าใหม่</button></div>`);
    m.el.querySelector('#no').onclick = m.close;
    m.el.querySelector('#yes').onclick = async () => {
      m.close();
      const p = await openProductForm(null, { barcode: code });
      if (p) { renderChips(); addToCart(p); }
    };
  }

  function submitCode(raw) {
    const q = String(raw || '').trim();
    if (!q) return;
    const lq = q.toLowerCase();
    const p = findByBarcode(q)
      || store.products.find(x => x.name.toLowerCase() === lq)
      || (store.products.filter(x => x.name.toLowerCase().includes(lq)).length === 1
          ? store.products.find(x => x.name.toLowerCase().includes(lq)) : null);
    if (p) { addToCart(p); scan.value = ''; renderGrid(); return; }
    // ดูเหมือนบาร์โค้ด (ไม่มีช่องว่าง ยาว ≥ 4) → เสนอให้เพิ่มสินค้าใหม่
    if (/^\S{4,}$/.test(q) && !store.products.some(x => x.name.toLowerCase().includes(lq))) {
      scan.value = ''; renderGrid(); offerAddNew(q);
    } else toast('เลือกสินค้าจากรายการด้านล่าง', 'info');
  }

  async function scanAndAdd() {
    const code = await scanBarcode();
    if (!code) return;
    const p = findByBarcode(code);
    if (p) { addToCart(p); toast(`+1 ${p.name}`); }
    else offerAddNew(code);
  }

  scan.addEventListener('input', renderGrid);
  scan.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitCode(scan.value);
  });
  $('btnCam').onclick = scanAndAdd;

  /* ---------- ชำระเงิน ---------- */
  $('btnPay').onclick = () => {
    if (!cart.length) return toast('ตะกร้าว่าง', 'err');
    for (const i of cart) {
      if (stockOf(i.productId) < i.qty) return toast(`สต๊อก "${i.name}" ไม่พอ (เหลือ ${stockOf(i.productId)})`, 'err');
    }
    closeSheet();
    openPayModal(Math.round(cartTotal() * 100) / 100);
  };

  function openPayModal(total) {
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
    const panelEl = m.el.querySelector('#payPanel');

    function showCash() {
      panelEl.innerHTML = `
        <label>รับเงินมา (บาท)</label>
        <input id="recv" type="number" min="0" step="0.01" inputmode="decimal"
               placeholder="0.00" style="font-size:24px;text-align:right">
        <div class="quick-cash" id="quick"></div>
        <div class="change-box" id="changeBox">เงินทอน <b>0.00</b> ฿</div>
        <button class="primary block" id="confirmCash" style="font-size:18px;min-height:52px;margin-top:12px" disabled>✅ ยืนยันการชำระ</button>`;
      const recv = panelEl.querySelector('#recv');
      const box = panelEl.querySelector('#changeBox');
      const btn = panelEl.querySelector('#confirmCash');

      const notes = [20, 50, 100, 500, 1000].filter(n => n > total);
      const quick = [{ v: total, label: 'พอดี' }].concat(notes.slice(0, 5).map(n => ({ v: n, label: fmtInt(n) })));
      panelEl.querySelector('#quick').innerHTML = quick.map(q => `<button type="button" data-v="${q.v}">${q.label}</button>`).join('');
      panelEl.querySelectorAll('#quick button').forEach(b => b.onclick = () => { recv.value = (+b.dataset.v).toFixed(2); update(); });

      function update() {
        const got = parseFloat(recv.value);
        if (!isFinite(got) || got <= 0) {
          box.className = 'change-box'; box.innerHTML = 'เงินทอน <b>0.00</b> ฿'; btn.disabled = true; return;
        }
        const change = got - total;
        if (change < -0.005) {
          box.className = 'change-box short'; box.innerHTML = `❌ ยังขาดอีก <b>${fmtMoney(-change)}</b> ฿`; btn.disabled = true;
        } else {
          box.className = 'change-box ok'; box.innerHTML = `เงินทอน <b>${fmtMoney(change)}</b> ฿`; btn.disabled = false;
        }
      }
      recv.addEventListener('input', update);
      recv.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) { e.preventDefault(); btn.click(); } });
      btn.onclick = () => finishSale(m, total, 'cash', parseFloat(recv.value));
      if (matchMedia('(pointer:fine)').matches) recv.focus(); // มือถือไม่ต้องเด้งคีย์บอร์ด ให้กดปุ่มลัดได้
    }

    function showQR() {
      const qrImage = store.settings.qrImage || '';
      panelEl.innerHTML = `
        <div class="qr-box">
          ${qrImage ? `<img src="${esc(qrImage)}" alt="QR พร้อมเพย์">`
            : `<div class="qr-empty">ยังไม่ได้ตั้งรูป QR พร้อมเพย์<br><span class="muted">กด "ตั้งรูป QR" ด้านล่างเพื่ออัปโหลด</span></div>`}
        </div>
        <div class="pay-amount" style="margin-top:8px">ให้ลูกค้าสแกนจ่าย <b>${fmtMoney(total)}</b> ฿</div>
        <button class="primary block" id="confirmQr" style="font-size:18px;min-height:52px">✅ ได้รับเงินแล้ว</button>
        <div style="text-align:center;margin-top:8px">
          <button type="button" class="ghost sm" id="btnQrEdit">🖼️ ${qrImage ? 'เปลี่ยน' : 'ตั้ง'}รูป QR</button>
        </div>
        <input id="qrFile" type="file" accept="image/*" hidden>`;
      panelEl.querySelector('#confirmQr').onclick = () => finishSale(m, total, 'qr', null);
      const file = panelEl.querySelector('#qrFile');
      panelEl.querySelector('#btnQrEdit').onclick = () => file.click();
      file.addEventListener('change', async e => {
        const f = e.target.files[0];
        if (!f) return;
        const ok = await busy(async () => {
          const url = await uploadImage(await compressImage(f, 900, 0.85), 'qr-promptpay');
          await call('setSetting', { key: 'qrImage', value: url });
          return true;
        }, 'กำลังอัปโหลดรูป QR…');
        if (ok) { toast('บันทึกรูป QR แล้ว — ใช้ได้ทุกเครื่อง'); showQR(); }
      });
    }

    m.el.querySelectorAll('.pay-tabs button').forEach(b => b.onclick = () => {
      m.el.querySelectorAll('.pay-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      b.dataset.m === 'cash' ? showCash() : showQR();
    });
    showCash();
  }

  async function finishSale(payModal, total, payMethod, received) {
    const r = await busy(() => call('checkout', { items: cart, payMethod, received }), 'กำลังบันทึกการขาย…');
    if (!r) return;
    const s = r.sale;
    payModal.close();
    const m = modal(`<h3 style="margin-top:0">ชำระเงินสำเร็จ ✅</h3>
      <p>บิล <b>${esc(s.billNo)}</b> · ${payMethod === 'cash' ? '💵 เงินสด' : '📱 QR พร้อมเพย์'}</p>
      <p class="big" style="text-align:center;font-size:32px">${fmtMoney(s.total)} ฿</p>
      ${payMethod === 'cash' ? `<div class="result-box" style="text-align:center">
        <div class="line">รับเงินมา <b>${fmtMoney(s.received)}</b> ฿</div>
        <div class="line" style="font-size:24px">💰 เงินทอน <b>${fmtMoney(s.change)}</b> ฿</div></div>` : ''}
      <div class="actions"><button class="primary block" id="ok" style="min-height:52px;font-size:17px">ขายต่อ</button></div>`);
    m.el.querySelector('#ok').onclick = () => { m.close(); if (matchMedia('(pointer:fine)').matches) scan.focus(); };
    cart = [];
    renderCart(); renderGrid();
  }

  // ข้อมูลเปลี่ยน (ซิงก์จาก Sheet / อีกเครื่องขาย) → อัปเดตหน้าจอ และตัดของในตะกร้าที่ถูกลบไปแล้ว
  const off = onChange(() => {
    cart = cart.filter(i => store.products.some(p => p.id === i.productId));
    renderChips(); renderGrid(); renderCart();
  });

  renderChips(); renderGrid(); renderCart();
  if (matchMedia('(pointer:fine)').matches) scan.focus(); // คอม: พร้อมรับเครื่องยิงบาร์โค้ดทันที
  return () => { off(); };
}
